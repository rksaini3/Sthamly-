// Sthamly AI Worker — plan, profile aur daily usage (Blueprint 3.0, section 6 step 3, section 8)
// Plan, subscription status aur usage hamesha DB se aate hain, client se nahi.
// Pehli request par profile upsert hota hai (auth.users par trigger nahi hai).

import type { AuthUser } from "./auth";
import { ApiError } from "./errors";
import type { SupabaseClient } from "./supabase";

export interface PlanLimits {
  plan: string;
  dailyTokens: number;
  maxOutputTokens: number;
  dailyLiveMinutes: number;
  connectorCount: number;
  fileLimitPerDay: number;
}

export interface UserContext {
  userId: string;
  language: "hi" | "hinglish" | "en";
  historyEnabled: boolean;
  memoryEnabled: boolean;
  plan: PlanLimits;
  subscriptionStatus: "active" | "past_due" | "cancelled";
  tokensUsedToday: number;
}

interface ProfileRow {
  user_id: string;
  language: "hi" | "hinglish" | "en";
  history_enabled: boolean;
  memory_enabled: boolean;
}

interface SubscriptionRow {
  plan: string;
  status: "active" | "past_due" | "cancelled";
  current_period_end: string | null;
}

interface PlanRow {
  plan: string;
  daily_tokens: number;
  max_output_tokens: number;
  daily_live_minutes: number;
  connector_count: number;
  file_limit_per_day: number;
  active: boolean;
}

// Profile ensure karta hai. Pehli baar ho to banata hai, warna jaisa hai waisa rehta hai.
// Ignore-duplicates ka matlab hai ki existing preferences kabhi overwrite nahi hote.
async function ensureProfile(db: SupabaseClient, user: AuthUser): Promise<ProfileRow> {
  const rows = await db.insert<ProfileRow>(
    "profiles",
    { user_id: user.id, display_name: null },
    { upsert: true, onConflict: "user_id" },
  );
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row;
}

// Plan ka naam subscriptions se. Row na ho to free plan.
async function loadSubscription(db: SupabaseClient, userId: string): Promise<SubscriptionRow> {
  const rows = await db.select<SubscriptionRow>(
    "subscriptions",
    `user_id=eq.${userId}&select=plan,status,current_period_end`,
  );
  const row = rows[0];
  if (!row) return { plan: "free", status: "active", current_period_end: null };

  // Lapse ho chuka plan (period khatam, status active nahi) to free maana jaata hai.
  // Blueprint: lapse hone par plan ke fayde band hote hain, top-up credits rehte hain (agle phase mein).
  const expired =
    row.current_period_end !== null && new Date(row.current_period_end).getTime() < Date.now();
  if (row.status === "past_due" || expired) {
    return { ...row, plan: "free", status: row.status === "cancelled" ? "cancelled" : "past_due" };
  }
  return row;
}

async function loadPlanLimits(db: SupabaseClient, plan: string): Promise<PlanLimits> {
  const rows = await db.select<PlanRow>(
    "plans",
    `plan=eq.${encodeURIComponent(plan)}&active=eq.true&select=*`,
  );
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return {
    plan: row.plan,
    dailyTokens: row.daily_tokens,
    maxOutputTokens: row.max_output_tokens,
    dailyLiveMinutes: row.daily_live_minutes,
    connectorCount: row.connector_count,
    fileLimitPerDay: row.file_limit_per_day,
  };
}

// Aaj ke tokens (UTC midnight se) usage_logs se.
async function loadTokensToday(db: SupabaseClient, userId: string): Promise<number> {
  const used = await db.rpc<number | null>("user_tokens_today", { p_user: userId });
  return typeof used === "number" ? used : 0;
}

// Ek hi call mein poora user context. Har chat request isse shuru hoti hai.
export async function loadUserContext(db: SupabaseClient, user: AuthUser): Promise<UserContext> {
  const profile = await ensureProfile(db, user);
  const subscription = await loadSubscription(db, user.id);
  const [limits, tokensUsedToday] = await Promise.all([
    loadPlanLimits(db, subscription.plan),
    loadTokensToday(db, user.id),
  ]);

  return {
    userId: user.id,
    language: profile.language,
    historyEnabled: profile.history_enabled,
    memoryEnabled: profile.memory_enabled,
    plan: limits,
    subscriptionStatus: subscription.status,
    tokensUsedToday,
  };
}

// Daily token quota check. Limit paar ho to 'budget_exceeded' (blueprint 7: per-user quota bhi).
// Note: yeh 'rate_limited' nahi, kyunki yeh din bhar ka quota hai, per-minute ka rate nahi.
export function assertWithinDailyQuota(ctx: UserContext, requestedTokens: number): void {
  if (ctx.tokensUsedToday + requestedTokens > ctx.plan.dailyTokens) {
    throw new ApiError("budget_exceeded", "आज का टोकन कोटा पूरा हो गया है। कल फिर कोशिश करें।");
  }
}

// Paid features ke liye plan check. Free plan mein jo feature band hai, woh yahin rukta hai.
export function assertPlanAllows(ctx: UserContext, minPlan: string): void {
  const order = ["free", "plus", "pro"];
  if (order.indexOf(ctx.plan.plan) < order.indexOf(minPlan)) {
    throw new ApiError("plan_required");
  }
}