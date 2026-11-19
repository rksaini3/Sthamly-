// Sthamly AI Worker — plan, profile aur daily usage (Blueprint 3.0, section 6 step 3, section 8)
// Plan, subscription status aur usage hamesha DB se aate hain, client se nahi.
// Pehli request par profile banta hai. Existing profile kabhi overwrite nahi hota.

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

// Profile ensure karta hai. Pehli baar ho to banata hai.
// conflict "ignore" ki wajah se existing row (naam, preferences, language) kabhi nahi badalti.
async function ensureProfile(db: SupabaseClient, user: AuthUser): Promise<ProfileRow> {
  await db.insert<ProfileRow>(
    "profiles",
    { user_id: user.id },
    { onConflict: "user_id", conflict: "ignore" },
  );

  const rows = await db.select<ProfileRow>(
    "profiles",
    `user_id=eq.${user.id}&select=user_id,language,history_enabled,memory_enabled`,
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

  // Period khatam ho chuka ho, ya payment past_due / cancelled ho, to plan ke fayde band hote hain.
  // Blueprint: lapse hone par free mein jaata hai, top-up credits rehte hain (credits phase mein).
  const expired =
    row.current_period_end !== null && new Date(row.current_period_end).getTime() < Date.now();
  if (row.status === "past_due" || row.status === "cancelled" || expired) {
    return { ...row, plan: "free" };
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

// Aaj ke tokens (UTC midnight se) usage_logs se, DB function ke zariye.
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

// Daily token quota check. Limit paar ho to 'budget_exceeded'.
// Yeh din bhar ka quota hai, per-minute ka rate nahi, isliye 'rate_limited' nahi.
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