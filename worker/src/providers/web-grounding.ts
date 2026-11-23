// Sthamly AI Worker: live jaankari (train, hotel, kiraya, khabar, mausam) ke liye Tavily Search API.
// Tavily ka free tier bina credit card ke, har mahine kuch sau/hazaar searches. Key header mein jaati hai (URL mein nahi).
// Raw provider response, error body aur key kabhi bahar nahi jaate. Koi bhi galti ho to null: chat bina live data ke chalti hai.

import type { Env } from "../env";
import type { ChatMessage } from "./types";

const TAVILY_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 5;
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

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Tavily jawab: { answer, results: [{ title, url, content }] }. Shape na mile to null.
export function parseTavilyAnswer(body: unknown): LiveAnswer | null {
  if (!isRecord(body)) return null;

  const sources: LiveSource[] = [];
  const seen = new Set<string>();
  const snippets: string[] = [];

  const results = Array.isArray(body.results) ? body.results : [];
  for (const item of results) {
    if (!isRecord(item)) continue;
    const url = safeHttpUrl(item.url);
    if (url === null || seen.has(url) || sources.length >= MAX_SOURCES) continue;
    seen.add(url);
    const title = typeof item.title === "string" && item.title.trim() !== "" ? item.title.trim() : url;
    sources.push({ title: title.slice(0, 160), url });
    if (typeof item.content === "string" && item.content.trim() !== "") {
      snippets.push(item.content.trim().slice(0, 600));
    }
  }

  // Tavily ka seedha jawab (answer) pehle. Na ho to results ke snippets se.
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const text = answer !== "" ? answer : snippets.join("\n\n").trim();
  if (text === "") return null;
  return { text: text.slice(0, MAX_TEXT_CHARS), sources };
}

// Tavily se taaza jaankari. Key na ho, network fail ho ya jawab khaali ho, to null.
export async function fetchLiveAnswer(
  env: Env,
  message: string,
  signal: AbortSignal,
): Promise<LiveAnswer | null> {
  if (!env.TAVILY_API_KEY) return null;

  let res: Response;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Aaj ki tareekh query mein: purane nataije kam aayein.
        query: `${message} (aaj ${todayIst()}, India)`,
        search_depth: "basic",
        include_answer: true,
        max_results: MAX_RESULTS,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch {
    console.error(JSON.stringify({ event: "live_search_failed", provider: "tavily", reason: "network" }));
    return null;
  }

  if (!res.ok) {
    console.error(JSON.stringify({ event: "live_search_failed", provider: "tavily", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.error(JSON.stringify({ event: "live_search_failed", provider: "tavily", reason: "bad_json" }));
    return null;
  }

  const answer = parseTavilyAnswer(body);
  if (answer === null) {
    console.error(JSON.stringify({ event: "live_search_failed", provider: "tavily", reason: "empty" }));
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