// Sthamly AI Worker: orchestrator ka planner (Blueprint 4.0).
// Ek user request ko 1 se 4 chhote kaamon mein todta hai. Har kaam ek hi kind ka hota hai:
// image, slides, website, document. Planner sirf plan banata hai, koi file nahi banata.
// Model ka jawab JSON hai, par use bharosa nahi karte: parsePlan har cheez check karta hai,
// aur galat ho to ek simple document wala plan lautata hai, taaki user ka kaam na ruke.

import type { Env } from "../env";
import { COST_INR } from "../routes/create";
import { CREATE_TEXT_MODEL, MAX_SLIDE_IMAGES, isCreateKind, stripCodeFence, userText, type CreateKind } from "../creators";
import { generateText } from "../providers/create-text";

export const MAX_PLAN_STEPS = 4;
export const MAX_STEP_PROMPT_CHARS = 1000;
const PLAN_MAX_OUTPUT_TOKENS = 1024;

export interface PlanStep {
  kind: CreateKind;
  prompt: string;
}

export interface Plan {
  steps: PlanStep[];
}

const PLANNER_SYSTEM = `आप छोटे व्यापारियों, छात्रों, वकीलों और क्रिएटर्स के AI सहायक की योजना बनाने वाले हैं।
उपयोगकर्ता का अनुरोध 1 से 4 कामों में बाँटें। हर काम इनमें से ठीक एक kind का हो:
- "image": एक तस्वीर (पोस्टर, प्रोडक्ट फ़ोटो, लोगो)
- "slides": स्लाइड्स का deck (प्रेज़ेंटेशन)
- "website": एक पेज की वेबसाइट (HTML)
- "document": लिखित दस्तावेज़ (नोट्स, पत्र, योजना, कैप्शन की सूची)
नियम:
- जितना कम हो सके उतने काम रखें। सरल अनुरोध के लिए एक ही काम काफ़ी है।
- हर काम का "prompt" अपने आप में पूरा हो: नाम, कीमत, तारीख, भाषा, जो भी तथ्य चाहिए, सब उसी में लिखें, क्योंकि हर काम अलग चलता है।
- सिर्फ़ JSON लौटाएँ, इस रूप में: {"steps":[{"kind":"document","prompt":"..."}]}`;

// Model के जवाब को जाँचकर साफ़ plan बनाता है। कुछ भी गलत हो, तो fallback।
export function parsePlan(raw: string, fallbackPrompt: string): Plan {
  const fallback: Plan = { steps: [{ kind: "document", prompt: fallbackPrompt }] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return fallback;
  }
  if (typeof parsed !== "object" || parsed === null) return fallback;

  const list = (parsed as { steps?: unknown }).steps;
  if (!Array.isArray(list) || list.length === 0) return fallback;

  const steps: PlanStep[] = [];
  for (const item of list) {
    if (steps.length >= MAX_PLAN_STEPS) break;
    if (typeof item !== "object" || item === null) continue;

    const kind = (item as { kind?: unknown }).kind;
    const prompt = (item as { prompt?: unknown }).prompt;
    if (!isCreateKind(kind) || typeof prompt !== "string") continue;

    const clean = Array.from(prompt.trim()).slice(0, MAX_STEP_PROMPT_CHARS).join("");
    if (clean.length === 0) continue;
    steps.push({ kind, prompt: clean });
  }

  return steps.length > 0 ? { steps } : fallback;
}

// एक काम का अनुमानित खर्च (rupees). Slides में ज़्यादा से ज़्यादा MAX_SLIDE_IMAGES तस्वीरें मानते हैं।
export function estimateStepCostInr(kind: CreateKind): number {
  if (kind === "image") return COST_INR.image;
  if (kind === "slides") return COST_INR.slides + MAX_SLIDE_IMAGES * COST_INR.image;
  if (kind === "website") return COST_INR.website;
  return COST_INR.document;
}

export function estimatePlanCostInr(steps: readonly PlanStep[]): number {
  return steps.reduce((sum, step) => sum + estimateStepCostInr(step.kind), 0);
}

// Planner को बुलाता है। Text model एक बार चलता है। Tokens caller लिखता है।
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
    plan: parsePlan(res.text, prompt),
    model: CREATE_TEXT_MODEL,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}
