import { z } from "zod";
import type { Lang } from "@/lib/i18n";
import { TOOLS, type AnyTool } from "@/lib/agent/tools";

// ---- Types ----

export interface ProtocolTurn {
  role: "user" | "assistant";
  content: string;
}

// model हर कदम पर एक ही फ़ैसला दे सकता है:
// 1) tool चलाना, या 2) user को अंतिम जवाब देना
export type Decision =
  | { type: "tool"; tool: string; args: unknown; say?: string }
  | { type: "final"; reply: string };

// ---- Schema (model के जवाब की संरचना) ----

const decisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool"),
    tool: z.string().trim().min(1).max(60),
    args: z.record(z.string(), z.unknown()).default({}),
    say: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("final"),
    reply: z.string().trim().min(1).max(1500),
  }),
]);

export type ParseResult = { ok: true; decision: Decision } | { ok: false; reason: string };

// ---- Prompt ----

const MAX_HISTORY = 6;
const MAX_TURN_CHARS = 600;

const RULES_HI = [
  "तुम Sthamly एजेंट हो। तुम्हारा मुख्य काम दुकानदार के पोस्टर बनाना और उनके पोस्टर की स्थिति बताना है।",
  "tools सिर्फ़ इन्हीं कामों के लिए हैं। बाकी हर सवाल (किसी व्यक्ति या कंपनी की जानकारी, सामान्य सवाल, लेख, सलाह, बातचीत) का जवाब सीधे final में दो। ऐसे सवाल पर कोई tool मत चलाओ।",
  "jobId या कोई id कभी user से मत माँगो। पोस्टर की स्थिति पूछी जाए और id पता न हो, तो पहले list_recent_jobs चलाओ, फिर उसके नतीजे की id से get_job_status चलाओ।",
  "हिंदी या हिंग्लिश में, छोटे और सीधे वाक्यों में बोलो।",
  "हर कदम पर सिर्फ़ एक JSON object दो। JSON के बाहर कुछ मत लिखो, markdown या code block भी नहीं।",
  "दो में से एक रूप चुनो:",
  '  1) tool चलाने के लिए: {"type":"tool","tool":"नाम","args":{...},"say":"एक लाइन में क्या कर रहे हो"}',
  '  2) user को जवाब देने के लिए: {"type":"final","reply":"जवाब"}',
  "जब तक ज़रूरी जानकारी न हो, final में user से सवाल पूछो। पर id जैसी तकनीकी चीज़ कभी मत पूछो।",
  "tool का नतीजा आने से पहले मान मत लो कि काम हो गया। नतीजे के बाद ही बताओ।",
  "मंज़ूरी वाले tool के लिए बस tool माँगो। system खुद user से पूछ लेगा, तुम पैसे या मंज़ूरी का सवाल मत बनाओ।",
  "id कभी खुद मत बनाओ। सिर्फ़ वही id इस्तेमाल करो जो पहले नतीजे में आई हो।",
  "अगर कोई tool न चाहिए तो सीधे final दो।",
].join("\n");

const RULES_EN = [
  "You are the Sthamly agent. Your main job is to make shopkeepers' posters and report the status of their posters.",
  "Tools are only for those jobs. For every other question (information about a person or company, general questions, articles, advice, chat), answer directly with final. Never run a tool for such questions.",
  "Never ask the user for a jobId or any id. If the status is asked and you do not know the id, first run list_recent_jobs, then run get_job_status with an id from that result.",
  "Reply in simple, short English sentences.",
  "Output exactly one JSON object per step. No text outside the JSON, no markdown or code block.",
  "Choose one of two forms:",
  '  1) to run a tool: {"type":"tool","tool":"name","args":{...},"say":"one line on what you are doing"}',
  '  2) to answer the user: {"type":"final","reply":"answer"}',
  "Ask the user a question in final when required information is missing. Never ask for technical ids.",
  "Never assume an action is done before its tool result comes back.",
  "For tools that need approval, just request the tool. The system will ask the user for approval; do not ask about money or approval yourself.",
  "Never invent ids. Use only ids that appeared in an earlier tool result.",
  "If no tool is needed, answer with final.",
].join("\n");

function clip(text: string): string {
  return text.length > MAX_TURN_CHARS ? `${text.slice(0, MAX_TURN_CHARS)}…` : text;
}

// भूमिका के मान्य tools की सूची (मूल, छाना हुआ)। allowed न दिया हो तो सारे tools।
function catalogFor(allowed: readonly string[] | undefined): AnyTool[] {
  if (!allowed) return TOOLS;
  const set = new Set(allowed);
  return TOOLS.filter((t) => set.has(t.name));
}

// model को दिखने वाले tools की सूची (छानी हुई)
function catalogText(tools: AnyTool[], en: boolean): string {
  if (tools.length === 0) {
    return en
      ? "(no tools available for this role. Answer with final.)"
      : "(इस भूमिका के लिए कोई tool नहीं। सीधे final से जवाब दो।)";
  }
  return tools
    .map((t) => {
      const mode = t.permission === "confirm" ? (en ? " [needs approval]" : " [मंज़ूरी चाहिए]") : "";
      return `- ${t.name}${mode}: ${t.description}\n  arguments: ${t.argsHint}`;
    })
    .join("\n");
}

/**
 * model को अगला फ़ैसला माँगने का prompt।
 * - allowedTools: इस भूमिका के मान्य tool नाम। न दिया हो तो सारे tools (पुराना व्यवहार)।
 * - goal: user का ताज़ा संदेश (लक्ष्य)
 * - history: पिछली बातचीत (आखिरी कुछ संदेश)
 * - observations: अब तक के tool नतीजे, क्रम से
 */
export function buildAgentPrompt(input: {
  goal: string;
  history: ProtocolTurn[];
  observations: string[];
  lang: Lang;
  allowedTools?: readonly string[];
}): string {
  const en = input.lang === "en";
  const rules = en ? RULES_EN : RULES_HI;
  const toolsHeader = en ? "Available tools:" : "उपलब्ध tools:";
  const historyHeader = en ? "Conversation so far:" : "अब तक की बातचीत:";
  const obsHeader = en ? "Tool results so far:" : "अब तक के tool नतीजे:";
  const goalHeader = en ? "Current request from the shopkeeper:" : "दुकानदार का ताज़ा काम:";
  const who = (r: ProtocolTurn["role"]) =>
    r === "user" ? (en ? "Shopkeeper" : "दुकानदार") : "Sthamly";

  const recent = input.history.slice(-MAX_HISTORY).map((t) => `${who(t.role)}: ${clip(t.content)}`);
  const obs = input.observations.length
    ? input.observations.map((o, i) => `${i + 1}. ${clip(o)}`)
    : [en ? "(none yet)" : "(अभी कुछ नहीं)"];

  return [
    rules,
    "",
    toolsHeader,
    catalogText(catalogFor(input.allowedTools), en),
    "",
    historyHeader,
    ...(recent.length ? recent : [en ? "(none)" : "(कुछ नहीं)"]),
    "",
    goalHeader,
    clip(input.goal),
    "",
    obsHeader,
    ...obs,
    "",
    en ? "Your next JSON:" : "आपका अगला JSON:",
  ].join("\n");
}

// ---- Parsing ----

// model अक्सर JSON के बाहर भी लिख देता है: पहला {...} ब्लॉक निकालें
function extractJsonText(raw: string): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return trimmed.slice(start, end + 1);
}

/** model का जवाब पढ़ें। गलत हो तो reason लौटाएं, ताकि loop एक बार दोबारा माँग सके। */
export function parseDecision(raw: string): ParseResult {
  const jsonText = extractJsonText(raw);
  if (!jsonText) return { ok: false, reason: "जवाब में JSON नहीं मिला" };

  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: "JSON सही नहीं बना" };
  }

  const parsed = decisionSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "JSON की संरचना सही नहीं है" };

  const d = parsed.data;
  if (d.type === "tool") {
    return { ok: true, decision: { type: "tool", tool: d.tool, args: d.args, say: d.say } };
  }
  return { ok: true, decision: { type: "final", reply: d.reply } };
}