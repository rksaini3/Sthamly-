// Sthamly AI Worker: live jaankari (train, hotel, kiraya, khabar, mausam) ke liye Google Search grounding.
// Gemini interactions API, tools: [{ type: "google_search" }]. Key header mein jaati hai (URL mein nahi).
// Raw provider response, error body aur key kabhi bahar nahi jaate. Koi bhi galti ho to null: chat bina live data ke chalti hai.

import type { Env } from "../env";
import type { ChatMessage } from "./types";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// Gemini docs ka current example model. Naya model aaye to sirf is line ko badlein.
const GROUNDING_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 25_000;
const MAX_TEXT_CHARS = 3_000;
const MAX_SOURCES = 5;

export interface LiveSource {
  title: string;
  url: string;
}

export interface LiveAnswer {
  text: string;
  sources: LiveSource[];
}

// Ye sawal taaza jaankari maangta hai ya nahi. Galat positive ka nuksaan sirf thoda extra time hai.
const LIVE_PATTERN =
  /ट्रेन|train|रेल|टिकट|ticket|pnr|होटल|hotel|किराया|किराए|fare|flight|फ्लाइट|फ़्लाइट|मौसम|weather|ख़बर|खबर|\bnews\b|\bscore\b|स्कोर|भाव|कीमत|कितने का|\bprice\b|\brate\b|आज का|आज की|आज के|aaj ka|aaj ki|kal subah|कल सुबह|\blive\b|लाइव|\blatest\b|ताज़ा|ताजा/i;

export function needsLiveInfo(message: string): boolean {
  return LIVE_PATTERN.test(message);
}

// Bharat ki aaj ki tareekh (YYYY-MM-DD), IST ke hisaab se.
export function todayIst(now: number = Date.now()): string {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 'content' kabhi array hota hai, kabhi ek object. Dono sambhalte hain.
function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return [value];
  return [];
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Jawab ka text aur sources (url_citation annotations) nikalta hai. Shape na mile to null.
export function parseLiveAnswer(body: unknown): LiveAnswer | null {
  if (!isRecord(body)) return null;

  let text = "";
  const sources: LiveSource[] = [];
  const seen = new Set<string>();

  for (const step of asList(body.steps)) {
    if (!isRecord(step) || step.type !== "model_output") continue;
    for (const block of asList(step.content)) {
      if (!isRecord(block)) continue;
      if (typeof block.text === "string") text += block.text;
      for (const ann of asList(block.annotations)) {
        if (!isRecord(ann) || ann.type !== "url_citation") continue;
        const url = safeHttpUrl(ann.url);
        if (url === null || seen.has(url) || sources.length >= MAX_SOURCES) continue;
        seen.add(url);
        const title = typeof ann.title === "string" && ann.title.trim() !== "" ? ann.title.trim() : url;
        sources.push({ title: title.slice(0, 160), url });
      }
    }
  }

  const trimmed = text.trim();
  if (trimmed === "") return null;
  return { text: trimmed.slice(0, MAX_TEXT_CHARS), sources };
}

// Google Search se taaza jaankari. Key na ho, network fail ho ya jawab khaali ho, to null.
export async function fetchLiveAnswer(
  env: Env,
  message: string,
  signal: AbortSignal,
): Promise<LiveAnswer | null> {
  if (!env.GEMINI_API_KEY) return null;

  const input =
    `आज की तारीख (भारत): ${todayIst()}. ` +
    "नीचे का सवाल वेब सर्च से ताज़ा जानकारी लेकर जवाब दो। " +
    "ट्रेन हो तो ट्रेन नंबर, नाम, निकलने और पहुँचने का समय, किराया और क्लास बताओ। " +
    "होटल हो तो नाम, जगह और किराया बताओ। जो जानकारी न मिले उसे साफ़ कहो, अंदाज़ा मत लगाओ। " +
    "जवाब हिंदी या Hinglish में, छोटा और साफ़।\n\nसवाल: " +
    message;

  let res: Response;
  try {
    res = await fetch(INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROUNDING_MODEL,
        input,
        tools: [{ type: "google_search" }],
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch {
    console.error(JSON.stringify({ event: "live_search_failed", reason: "network" }));
    return null;
  }

  if (!res.ok) {
    console.error(JSON.stringify({ event: "live_search_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.error(JSON.stringify({ event: "live_search_failed", reason: "bad_json" }));
    return null;
  }

  const answer = parseLiveAnswer(body);
  if (answer === null) {
    console.error(JSON.stringify({ event: "live_search_failed", reason: "empty" }));
  }
  return answer;
}

// Chat ke messages mein live jaankari ko system note ke roop mein, aakhri user sawal se pehle, jodta hai.
export function withLiveContext(messages: ChatMessage[], live: LiveAnswer): ChatMessage[] {
  if (messages.length === 0) return messages;
  const sourceLines = live.sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n");
  const note =
    `वेब सर्च के ताज़ा नतीजे (${todayIst()}):\n${live.text}\n` +
    (sourceLines === "" ? "" : `स्रोत:\n${sourceLines}\n`) +
    "ऊपर की जानकारी से जवाब दो। अगर कुछ पक्का न हो तो वैसा ही कहो। स्रोत के links जवाब के आख़िर में दो।";
  const last = messages.length - 1;
  return [...messages.slice(0, last), { role: "system", content: note }, messages[last]!];
}
