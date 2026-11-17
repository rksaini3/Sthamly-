import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent, type LoopOutcome } from "@/lib/agent/loop";
import type { ProtocolTurn } from "@/lib/agent/protocol";
import { titleFromMessage } from "@/lib/chats";
import { preflight, withCors } from "@/lib/cors";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { userFromBearer } from "@/lib/mobile-auth";
import { allowRequest } from "@/lib/rate-limit";
import { checkUsage, recordUsage } from "@/lib/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// एक user एक मिनट में ज़्यादा से ज़्यादा 6 agent runs (हर run में model की कई calls होती हैं)
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_RUNS = 6;

const bodySchema = z.object({
  threadId: z.uuid().optional(),
  // आखिरी संदेश दुकानदार का काम (goal) है
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(12),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleAgent(req);
  } catch (error) {
    console.error("agent route: unexpected error", error);
    res = errorResponse(500, "INTERNAL", "एजेंट में गड़बड़ हुई, थोड़ी देर बाद दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

/**
 * दो तरीकों से user पहचानें:
 * 1. Android app: Authorization: Bearer <token>
 * 2. Web app: login cookie (same-origin)
 */
async function currentUserId(req: NextRequest): Promise<string | null> {
  const fromBearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("agent route: bearer check failed", error);
    return null;
  });
  if (fromBearer) return fromBearer.id;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function handleAgent(req: NextRequest) {
  // 1. Login जांच (Bearer या cookie)
  const userId = await currentUserId(req);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 2. Rate limit (body पढ़ने से पहले)
  const allowed = await allowRequest(`agent:${userId}`, RATE_WINDOW_SECONDS, RATE_MAX_RUNS);
  if (!allowed) {
    return errorResponse(429, "RATE_LIMITED", "बहुत जल्दी-जल्दी काम भेजे जा रहे हैं, थोड़ा रुकें");
  }

  // 3. Body जांच
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "संदेश सही नहीं है");

  const messages = parsed.data.messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return errorResponse(400, "BAD_ORDER", "आखिरी संदेश आपका होना चाहिए");
  }

  const lang = parseLang(req.cookies.get(LANG_COOKIE)?.value);

  // 4. इस्तेमाल की सीमा (चैट वाली ही, एजेंट का हर run एक चैट गिना जाए)
  let willPayPaise = 0;
  try {
    const usage = await checkUsage(userId, "chat");
    if (!usage.ok) {
      return NextResponse.json(
        {
          error: {
            code: "LIMIT_REACHED",
            message: "आज की मुफ़्त बातचीत पूरी हो गई। जारी रखने के लिए वॉलेट भरें या प्लान लें।",
          },
          limit: { kind: "chat", plan: usage.plan, walletPaise: usage.walletPaise, pricePaise: usage.pricePaise },
        },
        { status: 402 },
      );
    }
    willPayPaise = usage.willPayPaise;
  } catch (error) {
    // हिसाब की टेबल न बनी हो तो भी agent चले
    console.error("agent route: usage check failed", error);
  }

  // 5. बातचीत का थ्रेड (पिछले संदेश model को संदर्भ के लिए)
  const threadId = parsed.data.threadId ?? null;
  const history: ProtocolTurn[] = messages.slice(0, -1);

  // 6. Agent चलाएं
  let outcome: LoopOutcome;
  try {
    outcome = await runAgent({
      userId,
      threadId,
      lang,
      goal: last.content,
      history,
    });
  } catch (error) {
    console.error("agent route: run failed", error);
    return errorResponse(502, "AGENT_FAILED", "काम शुरू नहीं हो पाया, दोबारा कोशिश करें");
  }

  // 7. Run हो गया: इस्तेमाल दर्ज करें। सिर्फ़ सफल जवाब पर, विफल run पर वॉलेट नहीं कटेगा।
  if (outcome.kind !== "failed") {
    try {
      await recordUsage(userId, "chat", willPayPaise);
    } catch (error) {
      console.error("agent route: usage record failed", error);
    }
  }

  // 8. जवाब: user को reply, कदमों की सूची, और मंज़ूरी के काम (अगर हों)
  if (outcome.kind === "failed") {
    return NextResponse.json(
      {
        runId: outcome.runId,
        status: "failed",
        reply: outcome.reply,
        steps: outcome.steps,
        actions: [],
      },
      { status: 200 },
    );
  }

  if (outcome.kind === "waiting") {
    return NextResponse.json({
      runId: outcome.runId,
      status: "waiting_confirm",
      reply: outcome.reply,
      steps: outcome.steps,
      actions: outcome.actions,
    });
  }

  return NextResponse.json({
    runId: outcome.runId,
    status: "done",
    reply: outcome.reply,
    steps: outcome.steps,
    actions: [],
  });
}