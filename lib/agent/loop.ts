import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";
import { packFor } from "@/lib/packs";
import { guardReply } from "@/lib/packs/types";
import { buildAgentPrompt, parseDecision, type ProtocolTurn } from "@/lib/agent/protocol";
import {
  TOOLS,
  findTool,
  type AgentContext,
  type ToolResult,
} from "@/lib/agent/tools";
import {
  appendStep,
  createAction,
  createRun,
  expireOldActions,
  setRunStatus,
  type RunStep,
} from "@/lib/agent/store";
import type { Role } from "@/types/domain";

// ---- Limits ----

// एक run में अधिकतम कदम (model की हर पुकार एक कदम है, गलत जवाब भी)
const MAX_STEPS = 6;
// tool का नतीजा model को भेजने से पहले छोटा किया जाता है
const MAX_TOOL_TEXT = 400;

// ---- Types ----

export interface StepView {
  tool: string;
  text: string;
}

export interface ActionView {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

export type LoopOutcome =
  | { kind: "reply"; runId: string; reply: string; steps: StepView[] }
  | { kind: "waiting"; runId: string; reply: string; steps: StepView[]; actions: ActionView[] }
  | { kind: "failed"; runId: string; reply: string; steps: StepView[] };

// ---- भूमिका के tools ----

// pack नहीं (दुकानदार और बाकी): पूरा दुकानदार वाला tool सेट
const DEFAULT_TOOL_NAMES: string[] = TOOLS.map((t) => t.name);

/**
 * इस भूमिका को कौन से tools मिल सकते हैं।
 * - pack हो तो सिर्फ़ उसके allowedTools (खाली हो तो कोई tool नहीं)
 * - pack न हो तो पूरा सेट (पहले जैसा व्यवहार)
 */
export function allowedToolNames(role: Role | null): string[] {
  const pack = packFor(role);
  return pack ? [...pack.allowedTools] : DEFAULT_TOOL_NAMES;
}

// ---- Helpers ----

function pick(lang: Lang, hi: string, en: string): string {
  return lang === "en" ? en : hi;
}

function clip(text: string): string {
  return text.length > MAX_TOOL_TEXT ? `${text.slice(0, MAX_TOOL_TEXT)}…` : text;
}

// model को एक बार पूछें और खर्च दर्ज करें
async function askModel(prompt: string): Promise<string> {
  const provider = getAIProvider();
  const result = await provider.generateText({ prompt, maxTokens: 500 });
  await logCost({
    step: "agent",
    provider: provider.name,
    model: "agent",
    costPaise: result.costPaise,
  });
  return (result.text ?? "").trim();
}

// ---- Loop ----

/**
 * एक दुकानदार (या वकील आदि) के संदेश (goal) पर agent चलाएं।
 * - role दिया हो तो उसी के tools चलेंगे, और pack हो तो जवाब guardReply से गुज़रेगा।
 * - लौटता है: final जवाब, या मंज़ूरी का इंतज़ार (waiting), या विफलता (failed)।
 * - मंज़ूरी के बाद का काम confirm route में होता है, इसलिए loop वहां दोबारा नहीं चलता।
 */
export async function runAgent(input: {
  userId: string;
  threadId: string | null;
  lang: Lang;
  goal: string;
  history: ProtocolTurn[];
  role?: Role | null;
}): Promise<LoopOutcome> {
  const { userId, lang, goal, history } = input;
  const role = input.role ?? null;
  const pack = packFor(role);
  const allowed = new Set(allowedToolNames(role));
  const ctx: AgentContext = { userId, threadId: input.threadId, lang };

  // पुराने, समय निकल चुके मंज़ूरी-अनुरोध बंद करें (ये सहायक काम है, न हो तो भी चलेगा)
  try {
    await expireOldActions(userId);
  } catch (error) {
    console.error("agent: expire old actions failed", error);
  }

  const run = await createRun({ userId, threadId: input.threadId, goal });
  const runId = run.id;

  const steps: RunStep[] = [];
  const views: StepView[] = [];
  // model को दिखने वाले पिछले नतीजे (क्रम से)
  const observations: string[] = [];

  // pack वाले जवाब पर guard और सूचना, बिना pack के जैसा है वैसा
  const finish = (text: string): string => (pack ? guardReply(pack, text, lang).text : text);

  const fail = async (): Promise<LoopOutcome> => {
    await setRunStatus({ runId, userId, status: "failed" }).catch((e) =>
      console.error("agent: failed status save", e),
    );
    return {
      kind: "failed",
      runId,
      steps: views,
      reply: finish(
        pick(
          lang,
          "काम पूरा नहीं हो पाया। एक बार फिर छोटे में बताएं।",
          "I could not finish this. Please tell me again in short.",
        ),
      ),
    };
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    // 1. model से अगला फ़ैसला
    let raw: string;
    try {
      raw = await askModel(buildAgentPrompt({ goal, history, observations, lang }));
    } catch (error) {
      console.error("agent: model call failed", error);
      return fail();
    }

    // 2. जवाब पढ़ें। गलत हो तो model को बताएं, और अगला कदम उसी को सुधारने दें।
    const parsed = parseDecision(raw);
    if (!parsed.ok) {
      observations.push(`गलत जवाब (${parsed.reason})। सिर्फ़ एक JSON दो।`);
      continue;
    }
    const decision = parsed.decision;

    // 3. अंतिम जवाब: बात खत्म
    if (decision.type === "final") {
      await setRunStatus({ runId, userId, status: "done" }).catch((e) =>
        console.error("agent: done status save", e),
      );
      return { kind: "reply", runId, reply: finish(decision.reply), steps: views };
    }

    // 4. tool इस भूमिका के लिए मान्य है या नहीं
    if (!allowed.has(decision.tool)) {
      observations.push(`यह tool इस भूमिका में उपलब्ध नहीं है: ${decision.tool}। बिना tool के जवाब दो।`);
      continue;
    }

    // 5. tool मौजूद है या नहीं, और arguments सही हैं या नहीं
    const tool = findTool(decision.tool);
    if (!tool) {
      observations.push(`tool नहीं मिला: ${decision.tool}`);
      continue;
    }
    const args = tool.parse(decision.args);
    if (!args.ok) {
      observations.push(`${tool.name} के arguments गलत हैं: ${args.message}`);
      continue;
    }
    const cleanArgs = args.args as Record<string, unknown>;

    // 6. मंज़ूरी वाला काम: अभी नहीं चलेगा, pending बनेगा और loop रुकेगा
    if (tool.permission === "confirm") {
      const summary = tool.summarize(args.args);
      const action = await createAction({
        runId,
        userId,
        tool: tool.name,
        args: cleanArgs,
        summary,
      });
      await setRunStatus({ runId, userId, status: "waiting_confirm" }).catch((e) =>
        console.error("agent: waiting status save", e),
      );
      return {
        kind: "waiting",
        runId,
        reply: finish(
          decision.say ??
            pick(lang, "यह काम करने से पहले आपकी मंज़ूरी चाहिए।", "I need your approval before doing this."),
        ),
        steps: views,
        actions: [
          {
            id: action.id,
            tool: tool.name,
            summary,
            expiresAt: action.expiresAt,
          },
        ],
      };
    }

    // 7. बिना मंज़ूरी वाला काम: अभी चलाएं
    let result: ToolResult;
    try {
      result = await tool.run(args.args, ctx);
    } catch (error) {
      console.error("agent: tool failed", tool.name, error);
      result = { ok: false, message: pick(lang, "काम में गड़बड़ हुई", "Something went wrong") };
    }

    const text = clip(result.ok ? result.text : result.message);
    const step: RunStep = {
      tool: tool.name,
      args: cleanArgs,
      resultSummary: text,
      at: new Date().toISOString(),
    };

    try {
      await appendStep({ runId, userId, step, currentSteps: steps });
    } catch (error) {
      // कदम का रिकॉर्ड न बने तो भी काम आगे चले
      console.error("agent: step save failed", error);
    }
    steps.push(step);
    views.push({ tool: tool.name, text });
    observations.push(`${tool.name}: ${text}`);
  }

  // सीमा तक पहुंच गए, और अंतिम जवाब नहीं मिला
  return fail();
}