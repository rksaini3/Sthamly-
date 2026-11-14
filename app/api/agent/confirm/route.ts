import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findTool, type AgentContext, type ToolResult } from "@/lib/agent/tools";
import {
  appendStep,
  getAction,
  getRun,
  moveAction,
  setRunStatus,
  type RunStep,
} from "@/lib/agent/store";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { allowRequest } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// एक user एक मिनट में ज़्यादा से ज़्यादा 20 मंज़ूरी (ज़्यादा होना गलत बटन-दबाव या दुरुपयोग का संकेत है)
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_DECISIONS = 20;

const bodySchema = z.object({
  actionId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  try {
    return await handleConfirm(req);
  } catch (error) {
    console.error("agent confirm: unexpected error", error);
    return errorResponse(500, "INTERNAL", "काम नहीं हो पाया, दोबारा कोशिश करें");
  }
}

async function handleConfirm(req: NextRequest) {
  // 1. Login जांच
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 2. Rate limit
  const allowed = await allowRequest(`agent-confirm:${user.id}`, RATE_WINDOW_SECONDS, RATE_MAX_DECISIONS);
  if (!allowed) {
    return errorResponse(429, "RATE_LIMITED", "बहुत जल्दी-जल्दी बटन दबाए जा रहे हैं, थोड़ा रुकें");
  }

  // 3. Body जांच
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "सही जानकारी भेजें");

  const { actionId, decision } = parsed.data;
  const lang = parseLang(req.cookies.get(LANG_COOKIE)?.value);

  // 4. Action खोजें: सिर्फ़ उसी user का
  const action = await getAction(actionId, user.id);
  if (!action) return errorResponse(404, "NOT_FOUND", "यह काम नहीं मिला");

  // 5. अभी भी pending है, और समय सीमा के अंदर है?
  if (action.status !== "pending") {
    return errorResponse(409, "ALREADY_DECIDED", "इस काम पर पहले ही फ़ैसला हो चुका है");
  }
  if (new Date(action.expiresAt).getTime() <= Date.now()) {
    await moveAction({ actionId, userId: user.id, from: "pending", to: "expired" }).catch((e) =>
      console.error("agent confirm: expire save", e),
    );
    return errorResponse(410, "EXPIRED", "मंज़ूरी का समय निकल गया, काम दोबारा माँगें");
  }

  // 6. रद्द करना: बस status बदलना, कोई tool नहीं चलेगा
  if (decision === "reject") {
    const moved = await moveAction({ actionId, userId: user.id, from: "pending", to: "rejected" });
    if (!moved) return errorResponse(409, "ALREADY_DECIDED", "इस काम पर पहले ही फ़ैसला हो चुका है");
    await finishRunIfNoPending(action.runId, user.id);
    return NextResponse.json({ status: "rejected", reply: lang === "en" ? "Cancelled." : "काम रद्द कर दिया गया।" });
  }

  // 7. मंज़ूरी: पहले status "approved" करें (ताकि दूसरी बार न चले), फिर tool चलाएं
  const claimed = await moveAction({ actionId, userId: user.id, from: "pending", to: "approved" });
  if (!claimed) return errorResponse(409, "ALREADY_DECIDED", "इस काम पर पहले ही फ़ैसला हो चुका है");

  const tool = findTool(action.tool);
  if (!tool) {
    await moveAction({ actionId, userId: user.id, from: "pending", to: "failed" }).catch(() => undefined);
    return errorResponse(500, "TOOL_MISSING", "यह काम अब उपलब्ध नहीं है");
  }

  // Arguments दोबारा जांचें: database में रखी चीज़ पर भी भरोसा नहीं
  const args = tool.parse(action.args);
  if (!args.ok) {
    await moveAction({ actionId, userId: user.id, from: "pending", to: "failed" }).catch(() => undefined);
    return errorResponse(500, "BAD_ARGS", "काम की जानकारी सही नहीं है");
  }

  const ctx: AgentContext = {
    userId: user.id,
    threadId: null,
    lang,
  };

  let result: ToolResult;
  try {
    result = await tool.run(args.args, ctx);
  } catch (error) {
    console.error("agent confirm: tool failed", action.tool, error);
    result = { ok: false, message: lang === "en" ? "Something went wrong" : "काम में गड़बड़ हुई" };
  }

  const text = result.ok ? result.text : result.message;
  await moveAction({
    actionId,
    userId: user.id,
    from: "pending",
    to: result.ok ? "done" : "failed",
    result: result.ok ? { text, ...(result.data ?? {}) } : { message: text },
  }).catch((e) => console.error("agent confirm: final status save", e));

  // run में कदम जोड़ें (ताकि इतिहास में दिखे कि मंज़ूरी के बाद क्या हुआ)
  const run = await getRun(action.runId, user.id);
  if (run) {
    const step: RunStep = {
      tool: action.tool,
      args: action.args,
      resultSummary: text,
      at: new Date().toISOString(),
    };
    await appendStep({ runId: action.runId, userId: user.id, step, currentSteps: run.steps }).catch((e) =>
      console.error("agent confirm: step save", e),
    );
  }
  await finishRunIfNoPending(action.runId, user.id);

  return NextResponse.json({
    status: result.ok ? "done" : "failed",
    reply: text,
    data: result.ok ? result.data ?? null : null,
  });
}

/** run में कोई pending action न बचे, तो run "done" माना जाए। */
async function finishRunIfNoPending(runId: string, userId: string): Promise<void> {
  const { pendingActionsForRun } = await import("@/lib/agent/store");
  const left = await pendingActionsForRun(runId, userId);
  if (left.length === 0) {
    await setRunStatus({ runId, userId, status: "done" }).catch((e) =>
      console.error("agent confirm: run done save", e),
    );
  }
}