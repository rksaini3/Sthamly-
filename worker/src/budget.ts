// Sthamly AI Worker — global daily budget aur kill-switch (Blueprint 3.0, section 7)
// Spend ka source of truth database hai (usage_logs). KV sirf alert dedupe ke liye hai.
// Stages:
//   normal          : sab features chalte hain
//   cheap_chat_only : costly features (vision, document, voice_live) band, chat sasta model
//   block_free      : upar ke saath free plan ke users bhi band
// Thresholds 1.0 aur 1.1 meri pasand hain (blueprint mein sirf order likha hai). Open decision.

import type { Config, Env } from "./env";
import { ApiError } from "./errors";
import type { SupabaseClient } from "./supabase";

export type CostFeature = "chat" | "vision" | "document" | "voice_live" | "voice_turn";

// Yeh features sabse mehngi hain, isliye budget ke 100% par sabse pehle band hote hain.
const COSTLY_FEATURES: ReadonlySet<CostFeature> = new Set<CostFeature>([
  "vision",
  "document",
  "voice_live",
]);

export type BudgetStage = "normal" | "cheap_chat_only" | "block_free";

const CHEAP_CHAT_RATIO = 1.0;
const BLOCK_FREE_RATIO = 1.1;

// Alert ke threshold (blueprint: 50%, 80%, 100%).
const ALERT_RATIOS: readonly number[] = [0.5, 0.8, 1.0];

// KV key 2 din tak rahegi, taaki din bhar mein ek threshold ka alert ek hi baar jaaye.
const ALERT_TTL_SECONDS = 2 * 24 * 60 * 60;

export interface BudgetStatus {
  spentInr: number;
  capInr: number;
  ratio: number;
  stage: BudgetStage;
}

export interface BudgetDecision extends BudgetStatus {
  // Chat ke liye: true ho to sirf cheap tier ka model use hoga.
  useCheapTierOnly: boolean;
}

export function stageFor(ratio: number): BudgetStage {
  if (ratio >= BLOCK_FREE_RATIO) return "block_free";
  if (ratio >= CHEAP_CHAT_RATIO) return "cheap_chat_only";
  return "normal";
}

// Aaj ka spend (UTC din) database se. Value na aaye ya galat ho to fail-closed: 'internal'.
async function readSpendInr(db: SupabaseClient): Promise<number> {
  const raw = await db.rpc<number | string | null>("global_spend_today_inr", {});
  const spent = Number(raw ?? 0);
  if (!Number.isFinite(spent) || spent < 0) {
    throw new ApiError("internal");
  }
  return spent;
}

// Aaj ka UTC din, jaise 2026-11-19. Database ke din se match karta hai.
function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Threshold cross hue to ek baar alert. Alert mein sirf numbers hain, koi user data ya secret nahi.
async function emitThresholdAlerts(
  env: Env,
  status: BudgetStatus,
  now: Date,
): Promise<void> {
  const day = utcDayKey(now);

  const crossed = ALERT_RATIOS.filter((r) => status.ratio >= r);
  await Promise.all(
    crossed.map(async (r) => {
      const percent = Math.round(r * 100);
      const key = `budget_alert:${day}:${percent}`;
      const already = await env.STATE.get(key);
      if (already !== null) return;

      await env.STATE.put(key, "1", { expirationTtl: ALERT_TTL_SECONDS });
      console.warn(
        JSON.stringify({
          event: "budget_threshold",
          percent,
          day,
          spent_inr: Number(status.spentInr.toFixed(2)),
          cap_inr: status.capInr,
          stage: status.stage,
        }),
      );
    }),
  );
}

// Dashboard ya admin ke liye: budget ka haal, bina kisi feature ko roke.
export async function budgetStatus(
  env: Env,
  db: SupabaseClient,
  config: Config,
  now: Date = new Date(),
): Promise<BudgetStatus> {
  const spentInr = await readSpendInr(db);
  const capInr = config.dailyBudgetInr;
  const ratio = spentInr / capInr;
  const stage = stageFor(ratio);
  const status: BudgetStatus = { spentInr, capInr, ratio, stage };
  await emitThresholdAlerts(env, status, now);
  return status;
}

// Har paid call se pehle. Feature band ho to 'budget_exceeded' throw hota hai.
// Chat ke liye useCheapTierOnly batata hai ki sasta model lena hai.
export async function assertBudget(
  env: Env,
  db: SupabaseClient,
  config: Config,
  opts: { feature: CostFeature; isFreePlan: boolean; now?: Date },
): Promise<BudgetDecision> {
  const status = await budgetStatus(env, db, config, opts.now ?? new Date());
  const decision: BudgetDecision = {
    ...status,
    useCheapTierOnly: status.stage !== "normal",
  };

  if (status.stage === "normal") return decision;

  if (COSTLY_FEATURES.has(opts.feature)) {
    throw new ApiError(
      "budget_exceeded",
      "आज की AI सीमा पूरी हो गई है। यह सुविधा अभी उपलब्ध नहीं है।",
    );
  }

  if (status.stage === "block_free" && opts.isFreePlan) {
    throw new ApiError(
      "budget_exceeded",
      "मुफ़्त प्लान अभी सीमित है। कल फिर कोशिश करें या प्लान चुनें।",
    );
  }

  return decision;
}