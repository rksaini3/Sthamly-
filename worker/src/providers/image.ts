// Sthamly AI Worker: Gemini image generation adapter (Blueprint 4.0, Phase 1, image)
// Gemini generateContent endpoint, responseModalities IMAGE. Model ID config se (verify karein).
// API key header mein jaati hai, URL mein nahi. Raw response, prompt aur key kabhi log ya client tak nahi.
// Output ek hi image hota hai. Safety block ya koi image na aaye to ProviderError ya ApiError.

import type { Env } from "../env";
import { ApiError } from "../errors";
import { ProviderError } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Image banane mein time lagta hai, isliye lamba timeout.
const IMAGE_TIMEOUT_MS = 60_000;

// Allowed output types. Gemini jo bhi de, sirf ye accept hote hain.
const ALLOWED_OUTPUT_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

// Prompt ki limit. Bahut lamba prompt kharcha badhata hai aur abuse ka rasta hai.
export const MAX_IMAGE_PROMPT_CHARS = 1000;

export interface GeneratedImage {
  bytes: ArrayBuffer;
  mimeType: string;
  // Gemini ke usage se tokens. Image ka cost credits ke hisaab se alag lagega.
  inputTokens: number;
  outputTokens: number;
}

// Gemini response ka shape (sirf jo hum use karte hain).
interface GeminiImageResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

// Base64 string ko bytes mein badalta hai. Galat base64 par exception.
function base64ToBytes(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Prompt ko saaf karta hai: khaali nahi, limit ke andar, aur control characters nahi.
export function cleanImagePrompt(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (cleaned.length === 0) {
    throw new ApiError("invalid_request", "तस्वीर के लिए कुछ लिखें।");
  }
  if (Array.from(cleaned).length > MAX_IMAGE_PROMPT_CHARS) {
    throw new ApiError(
      "invalid_request",
      `तस्वीर का विवरण ${MAX_IMAGE_PROMPT_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`,
    );
  }
  return cleaned;
}

// Gemini ko image banane ke liye bhejta hai. Ek hi image wapas aata hai.
export async function generateImage(
  env: Env,
  opts: { model: string; prompt: string; signal: AbortSignal },
): Promise<GeneratedImage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const signal = AbortSignal.any([opts.signal, controller.signal]);

  const url = `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          // Ek hi image, kam kharcha.
          candidateCount: 1,
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

  let body: GeminiImageResponse;
  try {
    body = (await res.json()) as GeminiImageResponse;
  } catch {
    throw new ProviderError("gemini", res.status, true);
  }

  // Prompt hi block ho gaya (safety): user ko saaf message, retry nahi.
  if (body.promptFeedback?.blockReason) {
    throw new ApiError(
      "invalid_request",
      "यह तस्वीर बनाई नहीं जा सकती। कृपया विवरण बदलकर दोबारा कोशिश करें।",
    );
  }

  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    // Output mein image nahi aayi (safety ya koi aur wajah): clean message, retry nahi.
    throw new ApiError(
      "invalid_request",
      "तस्वीर नहीं बन सकी। कृपया विवरण बदलकर दोबारा कोशिश करें।",
    );
  }

  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  if (!ALLOWED_OUTPUT_MIME.has(mimeType)) {
    throw new ProviderError("gemini", null, false);
  }

  const bytes = base64ToBytes(imagePart.inlineData.data);
  if (bytes.byteLength === 0) {
    throw new ProviderError("gemini", null, false);
  }

  return {
    bytes,
    mimeType,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}