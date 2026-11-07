import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLANS, type Plan } from "@/types/domain";

// प्लान की सीमाएं (हर कैलेंडर महीने, IST के हिसाब से)
// पोस्टर = फ़ोटो + ऑफर से बना poster
// रील   = टेम्पलेट रील (AI वीडियो रील अलग से, सिर्फ़ भुगतान पर, इसकी सीमा यहां नहीं)
export const PLAN_LIMITS: Record<Plan, { poster: number; reel: number }> = {
  free: { poster: 5, reel: 1 },
  vip: { poster: 60, reel: 10 },
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

function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

// यूज़र का प्लान profiles.plan से। न मिले तो Free।
// Razorpay आने पर वेबहुक यही column बदलेगा (और मियाद खत्म होने पर free करेगा)।
export async function getActivePlan(userId: string): Promise<Plan> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  const plan: unknown = data?.plan;
  return isPlan(plan) ? plan : "free";
}

// इस महीने की शुरुआत (IST) का ISO समय। क्रेडिट की गिनती इसी से होती है।
export function currentPeriodStart(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const startIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
  return new Date(startIst - IST_OFFSET_MS).toISOString();
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
    p_since: currentPeriodStart(),
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