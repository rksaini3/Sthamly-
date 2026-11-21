// Sthamly AI Worker: Gemini document adapter (PDF par sawal ya summary).
// PDF ko inline_data (base64) ke roop mein bhejte hain, saath mein prompt. Jawab text mein aata hai.
// REST generateContent use hota hai, koi SDK nahi. API key header mein jaati hai (URL mein nahi).
// Raw response, error body, prompt aur PDF bytes kabhi log ya client tak nahi jaate.

import type { Env } from "../env";
import { ProviderError } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ASK_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 2048;

interface AskOptions {
  model: string;
  prompt: string;
  // Base64 PDF bytes, bina "data:" prefix ke.
  pdfBase64: string;
  signal: AbortSignal;
}

// Unknown JSON ko object ki tarah padhne ke liye chhota helper.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Response: candidates[0].content.parts[].text. Pehla candidate hi lete hain.
function extractText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.candidates)) {
    throw new ProviderError("gemini", null, false);
  }
  const first: unknown = body.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    throw new ProviderError("gemini", null, false);
  }

  const texts: string[] = [];
  for (const part of first.content.parts) {
    if (isRecord(part) && typeof part.text === "string") texts.push(part.text);
  }
  const joined = texts.join("").trim();
  if (joined.length === 0) throw new ProviderError("gemini", null, false);
  return joined;
}

// PDF par prompt chalata hai. Document part pehle, text baad mein (docs ki salah ke hisaab se).
export async function askAboutPdf(env: Env, opts: AskOptions): Promise<string> {
  const connectController = new AbortController();
  const timer = setTimeout(() => connectController.abort(), ASK_TIMEOUT_MS);
  const signal = AbortSignal.any([opts.signal, connectController.signal]);

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
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "application/pdf", data: opts.pdfBase64 } },
              { text: opts.prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.4,
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
    await res.body?.cancel().catch(() => {});
    throw new ProviderError("gemini", res.status, retryable);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError("gemini", res.status, false);
  }

  return extractText(body);
}