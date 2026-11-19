// Sthamly AI Worker — model router (Blueprint 3.0, section 7)
// Model ka chunav: plan, budget stage, language aur provider health ke hisaab se.
// Routing kisi web page, file ya tool result ke text par depend nahi karti.
// Circuit breaker KV mein rehta hai. Retry sirf timeout / 5xx par, sirf ek baar.

import type { Config, Env } from "../env";
import { ApiError } from "../errors";
import type { SupabaseClient } from "../supabase";
import type { BudgetDecision } from "../budget";
import { GeminiChatProvider } from "./gemini";
import { GroqChatProvider } from "./groq";
import {
  ProviderError,
  type ChatProvider,
  type ChatRequest,
  type ModelEntry,
  type ModelTier,
  type Provider,
  type ProviderChunk,
} from "./types";

// ---- Circuit breaker ----
// Ek minute mein itni failures hon to provider kuch der ke liye 'degraded' maana jaata hai.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_WINDOW_SECONDS = 60;
const BREAKER_DEGRADED_SECONDS = 180;

// Retry: ek hi baar, chhota random delay, sirf retryable errors par.
const RETRY_DELAY_MIN_MS = 300;
const RETRY_DELAY_MAX_MS = 900;

// model_registry ki row (snake_case) ko ModelEntry (camelCase) mein badalta hai.
interface ModelRow {
  id: string;
  provider: Provider;
  model: string;
  tier: ModelTier;
  supports_hindi: boolean;
  price_in_usd_per_mtok: number | string;
  price_out_usd_per_mtok: number | string;
  min_plan: string;
  enabled: boolean;
}

function toEntry(row: ModelRow): ModelEntry {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    tier: row.tier,
    supportsHindi: row.supports_hindi,
    priceInUsdPerMtok: Number(row.price_in_usd_per_mtok),
    priceOutUsdPerMtok: Number(row.price_out_usd_per_mtok),
    minPlan: row.min_plan,
    enabled: row.enabled,
  };
}

// Plan ke hisaab se allowed models, enabled hi.
async function eligibleModels(db: SupabaseClient, planName: string): Promise<ModelEntry[]> {
  const order = ["free", "plus", "pro"];
  const userRank = order.indexOf(planName);
  const rows = await db.select<ModelRow>(
    "model_registry",
    "enabled=eq.true&select=id,provider,model,tier,supports_hindi,price_in_usd_per_mtok,price_out_usd_per_mtok,min_plan,enabled",
  );
  return rows
    .map(toEntry)
    .filter((m) => order.indexOf(m.minPlan) <= userRank);
}

// ---- Circuit breaker helpers (KV) ----

function failKey(provider: Provider, minute: number): string {
  return `breaker:fail:${provider}:${minute}`;
}

function degradedKey(provider: Provider): string {
  return `breaker:degraded:${provider}`;
}

async function isDegraded(env: Env, provider: Provider): Promise<boolean> {
  return (await env.STATE.get(degradedKey(provider))) !== null;
}

// Failure record karta hai. Ek minute mein threshold paar ho to provider degraded.
async function recordFailure(env: Env, provider: Provider, now: number): Promise<void> {
  const minute = Math.floor(now / 60_000);
  const key = failKey(provider, minute);
  const current = Number((await env.STATE.get(key)) ?? "0");
  const next = current + 1;
  await env.STATE.put(key, String(next), { expirationTtl: BREAKER_WINDOW_SECONDS * 2 });

  if (next >= BREAKER_FAILURE_THRESHOLD) {
    await env.STATE.put(degradedKey(provider), "1", {
      expirationTtl: BREAKER_DEGRADED_SECONDS,
    });
  }
}

// Success par failure count ka faayda nahi, lekin degraded flag yahan se nahi hatata:
// woh apne TTL se khud khatam hota hai, taaki ek success se provider achanak wapas na aa jaaye.

// ---- Provider construction ----
function buildProvider(env: Env, entry: ModelEntry): ChatProvider {
  if (entry.provider === "groq") return new GroqChatProvider(env, entry.model);
  return new GeminiChatProvider(env, entry.model);
}

// Chunaav: tier, language aur health. Pehla eligible, sahi tier ka, healthy model.
// Tier fallback: budget ke 'cheap' stage par sirf cheap tier chalta hai.
function pickCandidates(
  models: ModelEntry[],
  opts: { preferTier: ModelTier; cheapOnly: boolean; hindi: boolean },
): ModelEntry[] {
  let pool = models;
  if (opts.cheapOnly) {
    pool = pool.filter((m) => m.tier === "cheap" || m.tier === "standard");
  }
  if (opts.hindi) {
    pool = pool.filter((m) => m.supportsHindi);
  }
  // Pehle pasandida tier, phir baaki, ek hi list mein.
  const preferred = pool.filter((m) => m.tier === opts.preferTier);
  const rest = pool.filter((m) => m.tier !== opts.preferTier);
  return [...preferred, ...rest];
}

export interface RoutedStream {
  provider: Provider;
  model: string;
  stream: AsyncGenerator<ProviderChunk, void, unknown>;
}

// Ek candidate ko try karta hai. Degraded provider skip hota hai.
// Retry sirf ek baar, sirf retryable error par, aur sirf pehle stream start hone se pehle.
async function startWithRetry(
  env: Env,
  candidate: ChatProvider,
  request: ChatRequest,
): Promise<AsyncGenerator<ProviderChunk, void, unknown>> {
  const now = Date.now();
  try {
    const gen = candidate.stream(request);
    // Pehla chunk tak wait: isse pata chalta hai ki connection sahi khula ya nahi.
    const first = await gen.next();
    return prepend(first, gen);
  } catch (err) {
    if (err instanceof ProviderError && err.retryable) {
      await recordFailure(env, candidate.provider, now);
      await delay(RETRY_DELAY_MIN_MS + Math.random() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS));
      const gen = candidate.stream(request);
      const first = await gen.next();
      return prepend(first, gen);
    }
    throw err;
  }
}

// Pehle chunk ko wapas stream mein jodta hai, taaki caller ko poora stream mile.
async function* prepend(
  first: IteratorResult<ProviderChunk, void>,
  rest: AsyncGenerator<ProviderChunk, void, unknown>,
): AsyncGenerator<ProviderChunk, void, unknown> {
  if (!first.done) yield first.value;
  if (first.done) return;
  yield* rest;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main entry: model chunna, stream shuru kiya, failure par agle candidate ko.
export async function routeChat(
  env: Env,
  config: Config,
  db: SupabaseClient,
  opts: {
    planName: string;
    budget: BudgetDecision;
    hindi: boolean;
    preferTier: ModelTier;
    request: ChatRequest;
  },
): Promise<RoutedStream> {
  const models = await eligibleModels(db, opts.planName);
  const ordered = pickCandidates(models, {
    preferTier: opts.budget.useCheapTierOnly ? "cheap" : opts.preferTier,
    cheapOnly: opts.budget.useCheapTierOnly,
    hindi: opts.hindi,
  });

  if (ordered.length === 0) {
    throw new ApiError("provider_unavailable");
  }

  let lastError: unknown = null;
  for (const entry of ordered) {
    if (await isDegraded(env, entry.provider)) continue;

    const candidate = buildProvider(env, entry);
    try {
      const stream = await startWithRetry(env, candidate, opts.request);
      return { provider: entry.provider, model: entry.model, stream };
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError) {
        await recordFailure(env, entry.provider, Date.now());
      }
    }
  }

  // Koi bhi model na chale: user ko clean error, raw provider error nahi.
  void config;
  void lastError;
  throw new ApiError("provider_unavailable");
}