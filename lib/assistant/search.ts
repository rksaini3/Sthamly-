import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";

// ताज़ा जानकारी के लिए Gemini की Google Search grounding (वही GEMINI_API_KEY)।
// model का नाम बदलना हो तो Vercel में GEMINI_SEARCH_MODEL सेट करें (code बदलने की ज़रूरत नहीं)।
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_SEARCH_MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 30_000;
const MAX_QUERY_CHARS = 300;
const MAX_SOURCES = 3;
// अंदाज़ा: एक search query का खर्च (paise)। असली दाम Google की pricing page से मिलाकर सुधारें।
// Gemini 3 में model जितनी search query चलाए, हर एक का अलग बिल बनता है।
const COST_PER_QUERY_PAISE = 120;

export interface SearchResult {
  // जवाब का सार (सादा text, markdown नहीं)
  answer: string;
  // जिन साइटों से जानकारी आई (सिर्फ़ नाम, जैसे "economictimes.com")
  sources: string[];
  // model ने कितनी search query चलाईं
  queries: number;
}

const SYSTEM_HI = [
  "तुम Sthamly के लिए खोज करने वाले सहायक हो।",
  "सवाल जिस भाषा और लिपि में हो (हिंदी, हिंग्लिश या English), जवाब उसी में दो। साफ़ न हो तो हिंग्लिश।",
  "3 से 5 छोटे वाक्य। कोई सूची, तारे, markdown या इमोजी नहीं।",
  "सिर्फ़ वही बताओ जो search के नतीजों में मिला। जवाब न मिले तो साफ़ कहो कि नहीं मिला।",
  "किसी शेयर को खरीदने या बेचने की सलाह कभी मत दो।",
].join("\n");

const SYSTEM_EN = [
  "You are a search assistant for Sthamly.",
  "Answer in the same language and script as the question (Hindi, Hinglish or English). If it is unclear, use Hinglish.",
  "Use 3 to 5 short sentences. No lists, asterisks, markdown or emoji.",
  "Say only what the search results show. If they do not answer the question, say plainly that you could not find it.",
  "Never advise buying or selling any share.",
].join("\n");

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface SearchResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: GroundingChunk[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * किसी सवाल का ताज़ा जवाब वेब से खोजकर लौटाएं।
 * गलती (नेटवर्क, key, model) पर error फेंकता है; जवाब खाली हो तो answer खाली लौटता है।
 */
export async function searchWeb(input: { query: string; lang: Lang }): Promise<SearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY सेट नहीं है");
  const model = process.env.GEMINI_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL;

  const query = input.query.trim().slice(0, MAX_QUERY_CHARS);
  if (query.length < 2) throw new Error("खोज का सवाल बहुत छोटा है");

  const res = await fetch(`${BASE_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.lang === "en" ? SYSTEM_EN : SYSTEM_HI }] },
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      // सोचने वाले tokens भी इसी सीमा में गिने जाते हैं, इसलिए जगह खुली रखी है
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`search request failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as SearchResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`search blocked: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const answer = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  // स्रोतों के सिर्फ़ नाम (links Google के लंबे redirect होते हैं), बिना दोहराव
  const seen = new Set<string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const title = chunk.web?.title?.trim();
    if (title) seen.add(title);
    if (seen.size >= MAX_SOURCES) break;
  }

  const queries = candidate?.groundingMetadata?.webSearchQueries?.length ?? 0;

  await logCost({
    step: "other",
    provider: "gemini",
    model,
    costPaise: Math.max(1, queries) * COST_PER_QUERY_PAISE,
    meta: { feature: "search", queries },
  });

  return { answer, sources: [...seen], queries };
}