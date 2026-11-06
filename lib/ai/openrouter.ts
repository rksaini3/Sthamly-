import { getServerEnv } from "@/lib/env";
import type { AIProvider, AIResult, TextRequest } from "@/lib/ai/types";

// OpenRouter का text provider। सिर्फ text के लिए (जैसे voice से offer निकालना)।
// Free models का नाम ":free" से खत्म होता है। Model बदलना हो तो Vercel में OPENROUTER_MODEL डालें।
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30_000;

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

async function chat(prompt: string, maxTokens: number): Promise<string> {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY सेट नहीं है");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://sthamly.com",
      "X-Title": "Sthamly",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as ChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter: जवाब खाली है");
  }
  return text;
}

function unsupported(what: string): never {
  throw new Error(`OpenRouter पर ${what} समर्थित नहीं है। Fal का इस्तेमाल करें।`);
}

export const openrouterProvider: AIProvider = {
  name: "openrouter",

  async generateImage(): Promise<AIResult> {
    return unsupported("image");
  },

  async generateVideo(): Promise<AIResult> {
    return unsupported("video");
  },

  async generateText(req: TextRequest): Promise<AIResult> {
    const text = await chat(req.prompt, req.maxTokens ?? 300);
    // Free models पर कोई खर्च नहीं
    return { text, costPaise: 0 };
  },

  async transcribe(): Promise<AIResult> {
    return unsupported("transcription (voice to text)");
  },
};