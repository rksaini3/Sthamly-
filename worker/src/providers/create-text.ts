// Sthamly AI Worker: Gemini text generation (creation ke liye: slides JSON, website HTML, document markdown)
// API key header mein jaati hai, URL mein nahi. Raw response, prompt aur key kabhi log ya client tak nahi.
// Ek hi call, koi retry nahi. Caller ProviderError dekh kar user ko clean message deta hai.

import type { Env } from "../env";
import { ApiError } from "../errors";
import { ProviderError } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 90_000;

export interface TextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
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
    res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          maxOutputTokens: opts.maxOutputTokens,
          temperature: 0.7,
          responseMimeType: opts.json ? "application/json" : "text/plain",
        },
      }),
      signal,
    });
  } catch {
    throw new ProviderError("gemini", null, true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429;
    await res.body?.cancel().catch(() => undefined);
    throw new ProviderError("gemini", res.status, retryable);
  }

  let body: GeminiTextResponse;
  try {
    body = (await res.json()) as GeminiTextResponse;
  } catch {
    throw new ProviderError("gemini", res.status, true);
  }

  if (body.promptFeedback?.blockReason) {
    throw new ApiError(
      "invalid_request",
      "यह विषय सहायता के लिए उपलब्ध नहीं है। विवरण बदलकर दोबारा कोशिश करें।",
    );
  }

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (text.length === 0) {
    throw new ApiError("invalid_request", "सामग्री नहीं बन सकी। विवरण बदलकर दोबारा कोशिश करें।");
  }

  return {
    text,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}