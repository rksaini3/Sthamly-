// Sthamly AI Worker: prompt dekh kar tay karta hai
//   (1) tasveer par kya karna hai: "ask" = sawal ka text jawab, "edit" = tasveer banao ya badlo, "remove_bg" = background hatao.
//   (2) chat ka role kya hai: general, shop, study, legal, creator. Bina chip ke, apne-aap.
// Groq (text model) ek hi chhoti call mein jawab deta hai. Galti ya timeout par safe fallback:
// tasveer ke liye keyword se, chat ke liye "general". Prompt ya jawab kabhi log nahi hota.

import type { Env } from "../env";
import { askGroqText } from "./groq-text";

export type ResolvedIntent = "ask" | "edit" | "remove_bg";
export type AutoRole = "general" | "shop" | "study" | "legal" | "creator";

export interface ImageDecision {
  intent: ResolvedIntent;
  // Edit ke liye image model ko English mein saaf nirdesh. Ask ya fallback par null.
  imagePrompt: string | null;
}

const DECIDE_MODEL = "llama-3.3-70b-versatile";
const DECIDE_MAX_TOKENS = 220;
const ROLE_MAX_TOKENS = 6;
const IMAGE_PROMPT_MAX_CHARS = 400;

const IMAGE_SYSTEM = `You decide what the user wants to do with an attached picture. The user may write in Hindi, Hinglish or English.
Reply with ONLY one JSON object and nothing else:
{"intent": "ask" | "edit" | "remove_bg", "image_prompt": "..."}

- "ask": the user asks a question ABOUT the picture (what is written, what is this, read it, explain, summarise, price, how to use). Answer in text. Use image_prompt "".
- "edit": the user wants a NEW or CHANGED picture: add, include, make, create, banao, bana do, poster, collage, change, improve, edit, style, a scene, "without text".
- "remove_bg": the user only wants the background removed or made white.

For "edit" or "remove_bg", image_prompt is a short ENGLISH instruction for an image model (under 60 words). Say exactly what to show. Keep the main product or object from the picture. If the user said "without text" or "बिना टेक्स्ट", add: "no text, no letters, no words".`;

const ROLE_SYSTEM =
  "Classify the user's chat message into exactly one word: general, shop, study, legal or creator. " +
  "shop = running a shop or small business (offers, bills, udhaar, customer messages, product ideas). " +
  "study = school, college, exams, learning a topic, notes, MCQs. " +
  "legal = notices, complaints, applications, rent, police, court, government paperwork, law questions. " +
  "creator = social media content, reels, captions, hashtags, hooks, thumbnails, scripts. " +
  "general = anything else. Reply with one word only.";

const ROLES: readonly AutoRole[] = ["shop", "study", "legal", "creator", "general"];

const REMOVE_BG_WORDS =
  /बैकग्राउंड|background|सफ़ेद कर|सफेद कर|सफ़ेद बना|सफेद बना|पीछे का हिस्सा|remove bg|remove background/i;
const EDIT_WORDS =
  /बनाओ|बना\s*दो|बना\s*दे|बनाइए|जोड़ो|जोड़\s*दो|शामिल|include|add|बदलो|बदल\s*दो|एडिट|edit|make|create|generate|design|poster|पोस्टर|collage|कोलाज|बिना\s*टेक्स्ट|without\s*text|बेहतर|सुधारो|सुधार\s*दो|improve|style|\bbn?a?n?ao\b|\bbanao\b|\bbna\s*do\b|\bbna\s*de\b|\bbnado\b|\bbnade\b|\bbana\s*do\b|\bbana\s*de\b/i;

// Keyword se fallback intent. Sirf tab jab Groq se jawab na mile.
function keywordIntent(prompt: string): ResolvedIntent {
  if (REMOVE_BG_WORDS.test(prompt)) return "remove_bg";
  if (EDIT_WORDS.test(prompt)) return "edit";
  return "ask";
}

function isIntent(value: unknown): value is ResolvedIntent {
  return value === "ask" || value === "edit" || value === "remove_bg";
}

// Model ke jawab se JSON nikalta hai. Shape galat ho to null.
function parseDecision(raw: string): ImageDecision | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const intent = record.intent;
  if (!isIntent(intent)) return null;
  if (intent === "ask") return { intent, imagePrompt: null };

  const rawPrompt = typeof record.image_prompt === "string" ? record.image_prompt.trim() : "";
  if (rawPrompt.length === 0) return { intent, imagePrompt: null };
  return { intent, imagePrompt: Array.from(rawPrompt).slice(0, IMAGE_PROMPT_MAX_CHARS).join("") };
}

// Tasveer ke saath aaye prompt ka intent aur English image prompt. Koi bhi galti ho to keyword fallback.
export async function classifyImageRequest(
  env: Env,
  prompt: string,
  signal: AbortSignal,
): Promise<ImageDecision> {
  try {
    const raw = await askGroqText(env, {
      model: DECIDE_MODEL,
      system: IMAGE_SYSTEM,
      user: prompt,
      maxTokens: DECIDE_MAX_TOKENS,
      signal,
    });
    const decision = parseDecision(raw);
    if (decision !== null) return decision;
  } catch {
    // Neeche fallback chalega.
  }
  return { intent: keywordIntent(prompt), imagePrompt: null };
}

// Chat message ka role. Kuch bhi galat ho to "general".
export async function detectAutoRole(
  env: Env,
  message: string,
  signal: AbortSignal,
): Promise<AutoRole> {
  try {
    const answer = (
      await askGroqText(env, {
        model: DECIDE_MODEL,
        system: ROLE_SYSTEM,
        user: message,
        maxTokens: ROLE_MAX_TOKENS,
        signal,
      })
    ).toLowerCase();
    for (const role of ROLES) {
      if (answer.includes(role)) return role;
    }
  } catch {
    // Fallback neeche.
  }
  return "general";
}
