// Sthamly AI Worker: Groq ka simple text jawab (bina stream ke). PDF ke text par sawal ke liye.
// OpenAI-compatible endpoint. API key header mein jaati hai. Raw response, error body aur prompt kabhi log nahi hote.

import type { Env } from "../env";
import { ProviderError } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 60_000;

interface GroqTextOptions {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  signal: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function askGroqText(env: Env, opts: GroqTextOptions): Promise<string> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);
  const signal = AbortSignal.any([opts.signal, timeoutController.signal]);

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
        max_tokens: opts.maxTokens,
        temperature: 0.3,
        stream: false,
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
    await res.body?.cancel().catch(() => {});
    throw new ProviderError("groq", res.status, retryable);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError("groq", res.status, false);
  }

  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new ProviderError("groq", null, false);
  }
  const first: unknown = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    throw new ProviderError("groq", null, false);
  }
  const text = first.message.content.trim();
  if (text.length === 0) throw new ProviderError("groq", null, false);
  return text;
}