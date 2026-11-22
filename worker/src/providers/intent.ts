// Sthamly AI Worker: prompt dekh kar tay karta hai ki user tasveer par kya chahta hai.
// "ask" = sawal ka text jawab, "edit" = tasveer badlo ya banao, "remove_bg" = background hatao.
// Groq (text model) se ek shabd mein jawab. Koi bhi galti ho to safe raasta: "ask".

import type { Env } from "../env";
import { askGroqText } from "./groq-text";

export type ResolvedIntent = "ask" | "edit" | "remove_bg";

// Groq ka text model naam. Live test se pakka karein.
const INTENT_MODEL = "llama-3.3-70b-versatile";
const CLASSIFY_MAX_TOKENS = 5;

const SYSTEM =
  "तुम एक वर्गीकरण करने वाले हो। यूज़र का संदेश पढ़ो, जो एक तस्वीर के साथ आया है। " +
  "अगर यूज़र तस्वीर को बनाना, बदलना, सुधारना या एडिट करना चाहता है, तो edit लिखो। " +
  "अगर यूज़र सिर्फ़ बैकग्राउंड हटाना या सफ़ेद करना चाहता है, तो remove_bg लिखो। " +
  "अगर यूज़र तस्वीर के बारे में सवाल पूछ रहा है या कुछ जानना चाहता है (जैसे क्या लिखा है, यह क्या है), तो ask लिखो। " +
  "सिर्फ़ एक शब्द लिखो: ask, edit या remove_bg।";

// Prompt se intent. Galti, timeout ya client ke band karne par "ask" lautata hai.
export async function classifyImageIntent(
  env: Env,
  prompt: string,
  signal: AbortSignal,
): Promise<ResolvedIntent> {
  try {
    const answer = await askGroqText(env, {
      model: INTENT_MODEL,
      system: SYSTEM,
      user: prompt,
      maxTokens: CLASSIFY_MAX_TOKENS,
      signal,
    });
    const word = answer.toLowerCase();
    if (word.includes("remove_bg")) return "remove_bg";
    if (word.includes("edit")) return "edit";
    return "ask";
  } catch {
    return "ask";
  }
}