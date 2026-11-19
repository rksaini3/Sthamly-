// Sthamly AI Worker — provider ka common contract (Blueprint 3.0, principle 2, section 7)
// Har provider (Groq, Gemini) isi interface ko implement karta hai.
// Router aur routes sirf yahi jaante hain. Provider ka raw response yahan se bahar nahi jaata.

import type { ErrorCode } from "../errors";

export type Provider = "groq" | "gemini";

export type ModelTier = "cheap" | "standard" | "strong";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  // Abort signal: client disconnect ya timeout par provider call band ho jaaye.
  signal: AbortSignal;
}

// Stream ka ek chunk. Provider sirf text dene ka kaam karta hai.
export type ProviderChunk =
  | { type: "text"; text: string }
  | {
      type: "finish";
      finishReason: "stop" | "length" | "error";
      inputTokens: number;
      outputTokens: number;
    };

export interface ChatProvider {
  readonly provider: Provider;
  readonly model: string;
  // Stream karta hai. Failure par ProviderError throw karta hai, raw message nahi.
  stream(request: ChatRequest): AsyncGenerator<ProviderChunk, void, unknown>;
}

// Provider ki failure ka ek hi type. Raw message kabhi client tak nahi jaata.
// retryable sirf timeouts aur 5xx ke liye true hota hai (blueprint 7: retry sirf yahin).
export class ProviderError extends Error {
  readonly provider: Provider;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code: ErrorCode;

  constructor(provider: Provider, status: number | null, retryable: boolean) {
    super(`provider ${provider} failed`); // log ke liye generic message, body nahi
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.code = "provider_unavailable";
  }
}

// Model registry ki ek row ka TypeScript shape (sthamly_v3.model_registry).
export interface ModelEntry {
  id: string;
  provider: Provider;
  model: string;
  tier: ModelTier;
  supportsHindi: boolean;
  priceInUsdPerMtok: number;
  priceOutUsdPerMtok: number;
  minPlan: string;
  enabled: boolean;
}

// Token cost ka hisaab. Rupee rate open decision hai, isliye config se aata hai.
export function estimateCostInr(
  entry: Pick<ModelEntry, "priceInUsdPerMtok" | "priceOutUsdPerMtok">,
  inputTokens: number,
  outputTokens: number,
  usdToInr: number,
): number {
  const usd =
    (inputTokens / 1_000_000) * entry.priceInUsdPerMtok +
    (outputTokens / 1_000_000) * entry.priceOutUsdPerMtok;
  return usd * usdToInr;
}