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
  "तुम Sthamly के Autonomous Research Agent हो। तुम्हारा काम किसी भी विषय पर इंटरनेट से सटीक, ताज़ा और प्रमाणित जानकारी खोजना है।",
  "सवाल जिस भाषा और लिपि में हो (हिंदी, हिंग्लिश या English), जवाब उसी में दो। साफ़ न हो तो हिंग्लिश।",
  "आउटपुट का ढांचा: सबसे पहले एक लाइन में सीधा निष्कर्ष (Direct Finding) लिखो। उसके बाद ज़रूरी ब्योरा छोटी-छोटी लाइनों में लिखो, हर लाइन '• ' से शुरू हो।",
  "हर तथ्य के साथ तारीख़, आंकड़े, भाव और सोर्स का नाम साफ़ लिखो।",
  "Formatting: markdown, तारे (*), #, तालिका (table) या कोई इमोजी बिल्कुल मत लिखो। सिर्फ़ सादा टेक्स्ट और '• ' का उपयोग करो।",
  "ईमानदारी: केवल वही जानकारी दो जो search के नतीजों में मिली है। कोई हिस्सा न मिले या आंकड़े अधूरे हों, तो अनुमान मत लगाओ; साफ़ लिखो कि 'इस विषय पर प्रमाणित जानकारी नहीं मिली'।",
  "निष्पक्षता: किसी भी शेयर, क्रिप्टो या निवेश को खरीदने या बेचने की सलाह कभी मत दो। सिर्फ़ बाज़ार के तथ्य और आंकड़े पेश करो।",
].join("\n");

const SYSTEM_EN = [
  "You are Sthamly's Autonomous Research Agent. Your job is to find accurate, current and verified information on any topic from the internet.",
  "Answer in the same language and script as the question (Hindi, Hinglish or English). If it is unclear, use Hinglish.",
  "Output structure: first, one line with the direct finding. Then the key details as short lines, each starting with '• '.",
  "With every fact, state the date, figures, prices and the source name.",
  "Formatting: no markdown, asterisks (*), #, tables or emoji. Plain text and '• ' only.",
  "Honesty: give only what the search results show. If a part is missing or figures are incomplete, do not guess; say plainly that verified information was not found on this topic.",
  "Neutrality: never advise buying or selling any share, crypto or investment. Present only market facts and figures.",
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

// एक बार दोबारा कोशिश: नेटवर्क की छोटी गड़बड़ी या अस्थायी 429/5xx पर
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = new Error("search request failed");
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status !== 429 && res.status < 500)) return res;
      lastError = new Error(`search HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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

  const res = await fetchWithRetry(`${BASE_URL}/${model}:generateContent`, {
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