// Sthamly AI Worker: Groq text generation (creation ke liye: slides JSON, website HTML, document markdown)
// Groq ka OpenAI-jaisa endpoint, free tier par chalta hai. API key header mein jaati hai, URL mein nahi.
// Raw response, prompt aur key kabhi log ya client tak nahi. Ek hi call, koi retry nahi.
// Caller ProviderError dekh kar user ko clean message deta hai.

import type { Env } from "../env";
import { ApiError } from "../errors";
import { ProviderError } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 90_000;

export interface TextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function generateText(
  env: Env,
  opts: {
    model: string;
    system: string;
    user: string;
    json: boolean;
    maxOutputTokens: number;
    signal: AbortSignal;
  },
): Promise<TextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const signal = AbortSignal.any([opts.signal, controller.signal]);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_tokens: opts.maxOutputTokens,
        temperature: 0.7,
        stream: false,
        // JSON mode: sirf tab jab caller ko JSON chahiye (slides). Prompt mein "JSON" shabd hona zaroori hai.
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    });
  } catch {
    throw new ProviderError("groq", null, true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429;
    await res.body?.cancel().catch(() => undefined);
    throw new ProviderError("groq", res.status, retryable);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError("groq", res.status, true);
  }

  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new ProviderError("groq", null, false);
  }

  const first: unknown = body.choices[0];
  if (!isRecord(first)) throw new ProviderError("groq", null, false);

  // Output limit tak pahunch gaya to jawab adhoora hai (HTML ya JSON toota hoga). Saaf error do.
  if (first.finish_reason === "length") {
    throw new ApiError(
      "provider_unavailable",
      "विवरण बहुत लंबा हो गया। छोटा विवरण देकर दोबारा कोशिश करें।",
    );
  }

  const message = isRecord(first.message) ? first.message.content : null;
  const text = typeof message === "string" ? message.trim() : "";

  if (text.length === 0) {
    throw new ApiError("invalid_request", "सामग्री नहीं बन सकी। विवरण बदलकर दोबारा कोशिश करें।");
  }

  const usage = isRecord(body.usage) ? body.usage : {};
  return {
    text,
    inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}