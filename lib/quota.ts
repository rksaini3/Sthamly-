import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLAN_ALLOWANCES, type QuotaWindow } from "@/lib/pricing";
import { getWalletBalance, refundWalletForJob } from "@/lib/wallet";
import type { Plan } from "@/types/domain";

export interface ReserveInput {
  userId: string;
  jobId: string;
  poster: number; // कितने poster credit चाहिए (आम तौर पर 1 या 0)
  reel: number; // कितने reel credit चाहिए (0 या 1)
}

export interface QuotaResult {
  allowed: boolean;
  remaining: { poster: number; reel: number };
  plan: Plan;
}

// पेज और असिस्टेंट के लिए कोटे की स्थिति
export interface QuotaStatus {
  plan: Plan;
  posterLeft: number;
  reelLeft: number;
  posterWindow: QuotaWindow;
  walletPaise: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// यूज़र का सक्रिय प्लान। न मिले तो Free।
export async function getActivePlan(userId: string): Promise<Plan> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("plan_tier")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.plan_tier as Plan | undefined) ?? "free";
}

/**
 * विंडो की शुरुआत।
 *  - day:   आज का IST 00:00
 *  - week:  पिछले 7 दिन (rolling)
 *  - month: IST कैलेंडर महीने की पहली तारीख 00:00
 * MVP में महीना कैलेंडर से है। बाद में Razorpay की billing तारीख से होगा।
 */
export function windowStart(window: QuotaWindow, now: Date = new Date()): Date {
  if (window === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  if (window === "day") {
    const startIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
    return new Date(startIst - IST_OFFSET_MS);
  }

  const startIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
  return new Date(startIst - IST_OFFSET_MS);
}

function isRemaining(value: unknown): value is { poster: number; reel: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.poster === "number" && typeof v.reel === "number";
}

/**
 * Job शुरू करने से पहले कोटा reserve करें।
 * जांच और लिखना database function में एक साथ होता है (race नहीं होगी)।
 */
export async function reserveCredits(input: ReserveInput): Promise<QuotaResult> {
  const plan = await getActivePlan(input.userId);
  const allowances = PLAN_ALLOWANCES[plan];
  const admin = createSupabaseAdminClient();
  const now = new Date();

  // TODO: types/database.ts में अभी सिर्फ़ पुराना reserve_credits है। Supabase में v2 का नाम और
  // arguments पक्के होने पर database types दोबारा बनाएं और यह cast हटा दें।
  const rpc = (admin.rpc as unknown as (
    fn: "reserve_credits_v2",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>).bind(admin);
  const { data, error } = await rpc("reserve_credits_v2", {
    p_user: input.userId,
    p_job: input.jobId,
    p_poster_need: input.poster,
    p_reel_need: input.reel,
    p_poster_limit: allowances.poster.limit,
    p_reel_limit: allowances.reel.limit,
    p_poster_since: windowStart(allowances.poster.window, now).toISOString(),
    p_reel_since: windowStart(allowances.reel.window, now).toISOString(),
  });

  if (error) throw error;

  const result = data as { allowed?: unknown; remaining?: unknown } | null;
  if (typeof result?.allowed !== "boolean" || !isRemaining(result.remaining)) {
    throw new Error("reserve_credits_v2 returned unexpected shape");
  }

  return { allowed: result.allowed, remaining: result.remaining, plan };
}

/**
 * विफल job के कोटा और वॉलेट कटौती, दोनों वापस करें।
 * एक job के लिए हर एक बार ही चलता है।
 * लौटाता है: कोटा की कितनी entries वापस हुईं (वॉलेट रिफ़ंड अलग से जुड़ा है)।
 */
export async function refundCredits(jobId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("refund_job_credits", { p_job: jobId });

  if (error) throw error;

  // वॉलेट से भरा गया हिस्सा भी वापस (अगर कोई हो)
  await refundWalletForJob(jobId);

  return typeof data === "number" ? data : 0;
}

// विंडो के अंदर कोटा कितना खर्च हुआ।
// मान्यता: खर्च usage_ledger में नकारात्मक delta है, और रिफ़ंड सकारात्मक।
async function usedInWindow(userId: string, kind: "poster" | "reel", window: QuotaWindow): Promise<number> {
  const admin = createSupabaseAdminClient();
  const since = windowStart(window, new Date()).toISOString();
  const { data, error } = await admin
    .from("usage_ledger")
    .select("delta")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);

  if (error) throw error;
  const net = (data ?? []).reduce((sum, row) => sum + row.delta, 0);
  return Math.max(0, -net);
}

// पोस्टर और रील का बचा कोटा, और वॉलेट का बैलेंस।
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const plan = await getActivePlan(userId);
  const allowances = PLAN_ALLOWANCES[plan];

  const [posterUsed, reelUsed, walletPaise] = await Promise.all([
    usedInWindow(userId, "poster", allowances.poster.window),
    usedInWindow(userId, "reel", allowances.reel.window),
    getWalletBalance(userId),
  ]);

  return {
    plan,
    posterLeft: Math.max(0, allowances.poster.limit - posterUsed),
    reelLeft: Math.max(0, allowances.reel.limit - reelUsed),
    posterWindow: allowances.poster.window,
    walletPaise,
  };
}

// ---- पुराने कोड के लिए सहायक exports (app/account/page.tsx) ----
// नए नियमों से ही गणना। पुराने "lifetime" वाले नियम अब नहीं हैं।
export const PLAN_LIMITS: Record<Plan, { poster: number; reel: number; lifetime: boolean }> = {
  free: { poster: PLAN_ALLOWANCES.free.poster.limit, reel: PLAN_ALLOWANCES.free.reel.limit, lifetime: false },
  starter: { poster: PLAN_ALLOWANCES.starter.poster.limit, reel: PLAN_ALLOWANCES.starter.reel.limit, lifetime: false },
  premium: { poster: PLAN_ALLOWANCES.premium.poster.limit, reel: PLAN_ALLOWANCES.premium.reel.limit, lifetime: false },
  business: { poster: PLAN_ALLOWANCES.business.poster.limit, reel: PLAN_ALLOWANCES.business.reel.limit, lifetime: false },
};

// इस प्लान के कोटे का चालू समय-चक्र कब से शुरू हुआ, ISO string में।
// account page इसे सीधे `p_since` में भेजता है, इसलिए string ही लौटता है।
export function currentPeriodStart(plan?: Plan): string {
  void plan; // सभी प्लान के लिए IST कैलेंडर महीना
  return windowStart("month").toISOString();
}