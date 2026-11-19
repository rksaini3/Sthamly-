// Sthamly AI Worker — Gemini chat adapter (Blueprint 3.0, section 7)
// Gemini REST streamGenerateContent (alt=sse) use karta hai, bina SDK ke.
// API key header mein jaati hai (URL mein nahi, taaki logs mein na aaye).
// Raw provider response, error body aur key kabhi bahar nahi jaate.

import type { Env } from "../env";
import {
  ProviderError,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ProviderChunk,
} from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CONNECT_TIMEOUT_MS = 10_000;

// Gemini stream ka ek event (sirf jo hum use karte hain).
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

// Gemini ka format alag hai: system message 'systemInstruction' mein jaata hai,
// aur role 'user' / 'model' hota hai (assistant ki jagah).
function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
} {
  const systemTexts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

  return {
    ...(systemTexts.length > 0
      ? { systemInstruction: { parts: systemTexts.map((text) => ({ text })) } }
      : {}),
    contents,
  };
}

// Gemini ke finishReason ko hamare chhote set mein badalta hai.
function mapFinishReason(reason: string | undefined): "stop" | "length" | "error" | null {
  if (!reason) return null;
  if (reason === "MAX_TOKENS") return "length";
  if (reason === "STOP") return "stop";
  // Safety, recitation, aur baaki reasons hamare liye 'error' hain (raw reason client ko nahi jaata).
  return "error";
}

export class GeminiChatProvider implements ChatProvider {
  readonly provider = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(env: Env, model: string) {
    this.apiKey = env.GEMINI_API_KEY;
    this.model = model;
  }

  async *stream(request: ChatRequest): AsyncGenerator<ProviderChunk, void, unknown> {
    const connectController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(), CONNECT_TIMEOUT_MS);
    const signal = AbortSignal.any([request.signal, connectController.signal]);

    const url = `${GEMINI_BASE}/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`;
    const { systemInstruction, contents } = toGeminiContents(request.messages);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          // Key header mein: URL mein nahi, taaki kisi log ya error mein na dikhe.
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          ...(systemInstruction ? { systemInstruction } : {}),
          contents,
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            temperature: request.temperature ?? 0.7,
          },
        }),
        signal,
      });
    } catch {
      throw new ProviderError("gemini", null, true);
    } finally {
      clearTimeout(connectTimer);
    }

    if (!res.ok || !res.body) {
      const retryable = res.status >= 500 || res.status === 429;
      await res.body?.cancel().catch(() => {});
      throw new ProviderError("gemini", res.status, retryable);
    }

    yield* this.parseStream(res.body, request.signal);
  }

  private async *parseStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<ProviderChunk, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: "stop" | "length" | "error" | null = null;

    try {
      while (true) {
        if (signal.aborted) {
          await reader.cancel().catch(() => {});
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);

          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let event: GeminiStreamChunk;
          try {
            event = JSON.parse(payload) as GeminiStreamChunk;
          } catch {
            // Kharab line poore stream ko nahi todti.
            continue;
          }

          const candidate = event.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];
          for (const part of parts) {
            if (typeof part.text === "string" && part.text.length > 0) {
              yield { type: "text", text: part.text };
            }
          }

          const reason = mapFinishReason(candidate?.finishReason);
          if (reason) finishReason = reason;

          if (event.usageMetadata) {
            inputTokens = event.usageMetadata.promptTokenCount ?? inputTokens;
            outputTokens = event.usageMetadata.candidatesTokenCount ?? outputTokens;
          }
        }
      }
    } catch {
      yield { type: "finish", finishReason: "error", inputTokens, outputTokens };
      return;
    } finally {
      reader.releaseLock();
    }

    yield {
      type: "finish",
      finishReason: finishReason ?? "stop",
      inputTokens,
      outputTokens,
    };
  }
}