// Sthamly AI Worker — Groq chat adapter (Blueprint 3.0, section 7)
// Groq OpenAI-compatible endpoint use karta hai. Stream SSE mein aata hai.
// Raw provider response, error body aur API key kabhi bahar nahi jaate.

import type { Env } from "../env";
import {
  ProviderError,
  type ChatProvider,
  type ChatRequest,
  type ProviderChunk,
} from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CONNECT_TIMEOUT_MS = 10_000;

// Groq ke stream ka ek event (sirf jo hum use karte hain).
interface GroqStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class GroqChatProvider implements ChatProvider {
  readonly provider = "groq" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(env: Env, model: string) {
    this.apiKey = env.GROQ_API_KEY;
    this.model = model;
  }

  async *stream(request: ChatRequest): AsyncGenerator<ProviderChunk, void, unknown> {
    // Connect timeout: sirf response headers tak. Stream ke beech ka timeout nahi, client disconnect se rukta hai.
    const connectController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(), CONNECT_TIMEOUT_MS);
    const signal = AbortSignal.any([request.signal, connectController.signal]);

    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature ?? 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      });
    } catch {
      // Timeout ya network failure: dobara try karne layak
      throw new ProviderError("groq", null, true);
    } finally {
      clearTimeout(connectTimer);
    }

    if (!res.ok || !res.body) {
      // 5xx aur 429 retry layak hain. Baaki 4xx (galat request, safety) nahi.
      const retryable = res.status >= 500 || res.status === 429;
      // Response body yahan read nahi hoti: usme key ya prompt ka hissa ho sakta hai.
      await res.body?.cancel().catch(() => {});
      throw new ProviderError("groq", res.status, retryable);
    }

    yield* this.parseStream(res.body, request.signal);
  }

  // SSE lines padhta hai: "data: {...}" aur "data: [DONE]".
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
          if (payload === "[DONE]") break;

          let event: GroqStreamChunk;
          try {
            event = JSON.parse(payload) as GroqStreamChunk;
          } catch {
            // Ek kharab line poore stream ko nahi todti. Usko chhod dete hain.
            continue;
          }

          const choice = event.choices?.[0];
          const text = choice?.delta?.content;
          if (typeof text === "string" && text.length > 0) {
            yield { type: "text", text };
          }

          if (choice?.finish_reason) {
            finishReason =
              choice.finish_reason === "length" ? "length" : "stop";
          }

          if (event.usage) {
            inputTokens = event.usage.prompt_tokens ?? inputTokens;
            outputTokens = event.usage.completion_tokens ?? outputTokens;
          }
        }
      }
    } catch {
      // Stream ke beech ka error: raw message nahi, sirf finish 'error'.
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