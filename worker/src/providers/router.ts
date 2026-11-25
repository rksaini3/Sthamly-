// Sthamly AI Worker — model router (Blueprint 3.0, section 7)
// Model ka chunav: plan, budget stage, language aur provider health ke hisaab se.
// Routing kisi web page, file ya tool result ke text par depend nahi karti.
// Circuit breaker KV mein rehta hai. Retry sirf timeout / 5xx par, sirf ek baar,
// aur sirf stream shuru hone se pehle.

import type { Env } from "../env";
import { ApiError } from "../errors";
import type { BudgetDecision } from "../budget";
import type { SupabaseClient } from "../supabase";
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
// Ek minute mein itni failures hon to provider kuch der ke liye degraded maana jaata hai.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_WINDOW_SECONDS = 60;
const BREAKER_DEGRADED_SECONDS = 180;

// ---- Retry ----
const RETRY_DELAY_MIN_MS = 300;
const RETRY_DELAY_MAX_MS = 900;

// ---- Plan order: model_registry.min_plan isi se compare hota hai ----
const PLAN_ORDER: readonly string[] = ["free", "plus", "pro"];

// model_registry ki row (snake_case)
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

// User ke plan se allowed, enabled models.
async function eligibleModels(db: SupabaseClient, planName: string): Promise<ModelEntry[]> {
  const userRank = PLAN_ORDER.indexOf(planName);
  if (userRank === -1) throw new ApiError("internal");

  const rows = await db.select<ModelRow>(
    "model_registry",
    "enabled=eq.true&select=id,provider,model,tier,supports_hindi,price_in_usd_per_mtok,price_out_usd_per_mtok,min_plan,enabled",
  );

  return rows
    .map(toEntry)
    .filter((m) => m.enabled && PLAN_ORDER.indexOf(m.minPlan) <= userRank);
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
// Degraded flag apne TTL se khatam hota hai, ek success se wapas nahi aata.
async function recordFailure(env: Env, provider: Provider, nowMs: number): Promise<void> {
  const minute = Math.floor(nowMs / 60_000);
  const key = failKey(provider, minute);
  const current = Number((await env.STATE.get(key)) ?? "0");
  const next = (Number.isFinite(current) ? current : 0) + 1;

  await env.STATE.put(key, String(next), {
    expirationTtl: BREAKER_WINDOW_SECONDS * 2,
  });

  if (next >= BREAKER_FAILURE_THRESHOLD) {
    await env.STATE.put(degradedKey(provider), "1", {
      expirationTtl: BREAKER_DEGRADED_SECONDS,
    });
  }
}

// ---- Provider construction ----

function buildProvider(env: Env, entry: ModelEntry): ChatProvider {
  if (entry.provider === "groq") return new GroqChatProvider(env, entry.model);
  return new GeminiChatProvider(env, entry.model);
}

// Candidates ka order:
//  - budget 'cheap' stage par sirf cheap aur standard models
//  - Hindi / Hinglish ke liye sirf Hindi support wale models
//  - pasandida tier pehle, phir baaki
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

  const preferred = pool.filter((m) => m.tier === opts.preferTier);
  const rest = pool.filter((m) => m.tier !== opts.preferTier);
  return [...preferred, ...rest];
}

export interface RoutedStream {
  provider: Provider;
  model: string;
  // Model ki poori entry, taaki caller cost (prices) nikaal sake.
  entry: ModelEntry;
  stream: AsyncGenerator<ProviderChunk, void, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pehla chunk wapas stream mein jodta hai. Stream khaali ho to kuch nahi yield hota.
async function* prepend(
  first: IteratorResult<ProviderChunk, void>,
  rest: AsyncGenerator<ProviderChunk, void, unknown>,
): AsyncGenerator<ProviderChunk, void, unknown> {
  if (first.done) return;
  yield first.value;
  yield* rest;
}

// Stream khulta hai aur pehla chunk tak wait karta hai.
// Isse galat connection par user ko khaali reply nahi milti.
async function firstChunkStream(
  candidate: ChatProvider,
  request: ChatRequest,
): Promise<AsyncGenerator<ProviderChunk, void, unknown>> {
  const gen = candidate.stream(request);
  const first = await gen.next();
  return prepend(first, gen);
}

// Ek candidate ko kholta hai. Retryable error par ek baar, chhote random delay ke baad.
// Failure record yahan nahi hota, woh routeChat mein hota hai (double count se bachne ke liye).
async function openStream(
  candidate: ChatProvider,
  request: ChatRequest,
): Promise<AsyncGenerator<ProviderChunk, void, unknown>> {
  try {
    return await firstChunkStream(candidate, request);
  } catch (err) {
    if (!(err instanceof ProviderError) || !err.retryable) throw err;
    if (request.signal.aborted) throw err;

    await delay(
      RETRY_DELAY_MIN_MS + Math.random() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS),
    );
    return firstChunkStream(candidate, request);
  }
}

// Main entry. Model chunta hai, stream kholta hai, failure par agle candidate ko.
// Koi model na chale to user ko sirf 'provider_unavailable' jaata hai.
export async function routeChat(
  env: Env,
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

  // DIAGNOSTIC: 503 ki asli wajah Cloudflare Logs mein dikhe. Key, body ya prompt kabhi nahi log hota.
  if (ordered.length === 0) {
    console.error(
      JSON.stringify({
        event: "route_no_models",
        plan: opts.planName,
        hindi: opts.hindi,
        cheap_only: opts.budget.useCheapTierOnly,
        eligible_count: models.length,
      }),
    );
    throw new ApiError("provider_unavailable");
  }

  for (const entry of ordered) {
    if (opts.request.signal.aborted) throw new ApiError("internal");
    if (await isDegraded(env, entry.provider)) {
      console.error(JSON.stringify({ event: "route_skip_degraded", provider: entry.provider, model: entry.model }));
      continue;
    }

    try {
      const stream = await openStream(buildProvider(env, entry), opts.request);
      return {
        provider: entry.provider,
        model: entry.model,
        entry,
        stream,
      };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      console.error(
        JSON.stringify({
          event: "route_provider_failed",
          provider: entry.provider,
          model: entry.model,
          status: err.status,
          retryable: err.retryable,
        }),
      );
      // Sirf asli outage (timeout / 5xx / 429) breaker ginta hai. Galat key ya hata hua model
      // (401/403/404) sirf us model ko is request mein chhodta hai, poore provider ko band nahi karta.
      if (err.retryable) {
        await recordFailure(env, entry.provider, Date.now());
      }
    }
  }

  console.error(
    JSON.stringify({
      event: "route_all_failed",
      tried: ordered.map((e) => `${e.provider}:${e.model}`),
    }),
  );
  throw new ApiError("provider_unavailable");
}