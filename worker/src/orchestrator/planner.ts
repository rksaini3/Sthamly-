// Sthamly AI Worker: orchestrator ka planner (Blueprint 4.0).
// Ek hi text model call se tay hota hai ki user ko chat ka jawab chahiye (route "chat"),
// ya kuch banana hai (route "create", 1 se 4 kaam: image, slides, website, document).
// Chat ka role (shop, study, legal, creator) bhi isi call se aata hai, alag call ki zaroorat nahi.
// Model ka jawab JSON hai, par bharosa nahi: parsePlan har cheez check karta hai.
// Kuch bhi galat ho to route "chat": user ka sawal kabhi bina wajah file mein nahi jaata.

import type { Env } from "../env";
import { COST_INR } from "../routes/create";
import {
  CREATE_TEXT_MODEL,
  MAX_SLIDE_IMAGES,
  isCreateKind,
  stripCodeFence,
  userText,
  type CreateKind,
} from "../creators";
import { generateText } from "../providers/create-text";
import type { AutoRole } from "../providers/intent";

export const MAX_PLAN_STEPS = 4;
export const MAX_STEP_PROMPT_CHARS = 1000;
const PLAN_MAX_OUTPUT_TOKENS = 512;
const ROLES: readonly AutoRole[] = ["general", "shop", "study", "legal", "creator"];

export interface PlanStep {
  kind: CreateKind;
  prompt: string;
}

export type PlanRoute = "chat" | "create";

export interface Plan {
  route: PlanRoute;
  role: AutoRole;
  steps: PlanStep[];
}

const PLANNER_SYSTEM = `आप Sthamly AI के मुख्य ऑर्केस्ट्रेटर हैं। उपयोगकर्ता का संदेश पढ़कर तय करें:
(A) उन्हें सिर्फ़ बातचीत का जवाब चाहिए: सवाल, सलाह, समझाना, या कोई संदेश/कैप्शन का मसौदा जो वे चैट में ही पढ़ेंगे। तो route "chat".
(B) उन्हें कोई फ़ाइल या तस्वीर बनवानी है: पोस्टर, लोगो, स्लाइड्स, वेबसाइट, दस्तावेज़। तो route "create".

role इनमें से एक चुनें:
- "shop": दुकान या छोटा बिज़नेस (ऑफ़र, बिल, उधार, ग्राहक संदेश)
- "study": पढ़ाई (नोट्स, प्रश्नोत्तर, परीक्षा)
- "legal": कानूनी कागज़ (नोटिस, शिकायत, आवेदन, किराया, सरकारी काम)
- "creator": सोशल मीडिया (रील, कैप्शन, हैशटैग, स्क्रिप्ट)
- "general": बाकी सब

route "create" के लिए हर काम का kind इनमें से एक हो:
- "image": एक तस्वीर (पोस्टर, प्रोडक्ट फ़ोटो, लोगो)
- "slides": स्लाइड्स का deck
- "website": एक पेज की वेबसाइट (HTML)
- "document": लिखित दस्तावेज़ (नोट्स, पत्र, योजना)

नियम:
- route "create" में 1 से 4 काम। सरल अनुरोध के लिए एक ही काम काफ़ी है।
- हर काम का "prompt" अपने आप में पूरा हो: नाम, कीमत, तारीख, भाषा, जो भी तथ्य चाहिए, सब उसी में लिखें, क्योंकि हर काम अलग चलता है।
- शक हो तो route "chat" चुनें।
- सिर्फ़ JSON लौटाएँ। इन रूपों में से एक:
{"route":"chat","role":"general"}
{"route":"create","role":"shop","steps":[{"kind":"image","prompt":"..."}]}`;

// Model ke jawab ko jaanch kar saaf plan banata hai. Kuch bhi galat ho to route "chat".
export function parsePlan(raw: string): Plan {
  const chat: Plan = { route: "chat", role: "general", steps: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return chat;
  }
  if (typeof parsed !== "object" || parsed === null) return chat;

  const obj = parsed as { route?: unknown; role?: unknown; steps?: unknown };
  const role: AutoRole = ROLES.find((r) => r === obj.role) ?? "general";
  if (obj.route !== "create" || !Array.isArray(obj.steps)) return { ...chat, role };

  const steps: PlanStep[] = [];
  for (const item of obj.steps) {
    if (steps.length >= MAX_PLAN_STEPS) break;
    if (typeof item !== "object" || item === null) continue;

    const kind = (item as { kind?: unknown }).kind;
    const prompt = (item as { prompt?: unknown }).prompt;
    if (!isCreateKind(kind) || typeof prompt !== "string") continue;

    const clean = Array.from(prompt.trim()).slice(0, MAX_STEP_PROMPT_CHARS).join("");
    if (clean.length === 0) continue;
    steps.push({ kind, prompt: clean });
  }

  // "create" bola par ek bhi sahi kaam nahi mila to chat hi chalega.
  if (steps.length === 0) return { ...chat, role };
  return { route: "create", role, steps };
}

// Ek kaam ka anumaanit kharcha (rupees). Slides mein zyada se zyada MAX_SLIDE_IMAGES tasveerein maante hain.
export function estimateStepCostInr(kind: CreateKind): number {
  if (kind === "image") return COST_INR.image;
  if (kind === "slides") return COST_INR.slides + MAX_SLIDE_IMAGES * COST_INR.image;
  if (kind === "website") return COST_INR.website;
  return COST_INR.document;
}

export function estimatePlanCostInr(steps: readonly PlanStep[]): number {
  return steps.reduce((sum, step) => sum + estimateStepCostInr(step.kind), 0);
}

// Planner ko ek baar chalata hai. Provider ka error caller ko milta hai, wahi fallback chunta hai.
export async function planProject(
  env: Env,
  prompt: string,
  signal: AbortSignal,
): Promise<{ plan: Plan; model: string; inputTokens: number; outputTokens: number }> {
  const res = await generateText(env, {
    model: CREATE_TEXT_MODEL,
    system: PLANNER_SYSTEM,
    user: userText(prompt),
    json: true,
    maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS,
    signal,
  });
  return {
    plan: parsePlan(res.text),
    model: CREATE_TEXT_MODEL,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}
