import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/types/domain";

// प्लान की सीमाएं (हर कैलेंडर महीने, IST के हिसाब से)
// मुफ़्त: 5 पोस्टर, रील नहीं, watermark।  वीआईपी: 60 पोस्टर, 10 रील, बिना watermark।
export const PLAN_LIMITS: Record<Plan, { poster: number; reel: number; lifetime: boolean }> = {
  free: { poster: 5, reel: 0, lifetime: false },
  vip: { poster: 60, reel: 10, lifetime: false },
};

export interface ReserveInput {
  userId: string;
  jobId: string;
  poster: number; // कितने poster credit चाहिए (आम तौर पर 1)
  reel: number; // कितने reel credit चाहिए (0 या 1)
}

export interface QuotaResult {
  allowed: boolean;
  remaining: { poster: number; reel: number };
  plan: Plan;
}

// यूज़र का सक्रिय प्लान। न मिले तो मुफ़्त।
export async function getActivePlan(userId: string): Promise<Plan> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.plan as Plan | undefined) ?? "free";
}

// Period की शुरुआत: कैलेंडर महीना (IST)
function periodStart(plan: Plan): Date {
  if (PLAN_LIMITS[plan].lifetime) return new Date(0);

  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const startIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
  return new Date(startIst - IST_OFFSET_MS);
}

function isRemaining(value: unknown): value is { poster: number; reel: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.poster === "number" && typeof v.reel === "number";
}

/**
 * Job शुरू करने से पहले credit reserve करें।
 * जांच और लिखना database function में एक साथ होता है (race नहीं होगी)।
 */
export async function reserveCredits(input: ReserveInput): Promise<QuotaResult> {
  const plan = await getActivePlan(input.userId);
  const limits = PLAN_LIMITS[plan];
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("reserve_credits", {
    p_user: input.userId,
    p_job: input.jobId,
    p_poster_need: input.poster,
    p_reel_need: input.reel,
    p_poster_limit: limits.poster,
    p_reel_limit: limits.reel,
    p_since: periodStart(plan).toISOString(),
  });

  if (error) throw error;

  const result = data as { allowed?: unknown; remaining?: unknown } | null;
  if (typeof result?.allowed !== "boolean" || !isRemaining(result.remaining)) {
    throw new Error("reserve_credits returned unexpected shape");
  }

  return { allowed: result.allowed, remaining: result.remaining, plan };
}

/**
 * विफल job के credit वापस करें। एक job के लिए सिर्फ एक बार चलता है।
 * लौटाता है: कितनी ledger entries बनीं (0 का मतलब पहले ही refund हो चुका)।
 */
export async function refundCredits(jobId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("refund_job_credits", { p_job: jobId });

  if (error) throw error;
  return typeof data === "number" ? data : 0;
}