// Sthamly AI Worker: Razorpay billing (subscription aur booster).
// POST /api/billing/checkout   login user, tier (basic | pro | super) ke liye Razorpay subscription banata hai; frontend ko subscription_id deta hai
// POST /api/billing/topup      login user, booster pack (quick_try | mini | growth | vip) ke liye Razorpay order banata hai
// POST /api/billing/webhook    Razorpay ke events (signature check ke baad):
//                                subscription.* -> subscriptions table, aur billing cycle ke plan credits
//                                order.paid     -> booster ke credits (amount pack se milaya jaata hai)
// Plan, status aur credits hamesha DB se aate hain. Client kabhi plan ya credits ko 'paid' nahi bana sakta: sirf webhook likhta hai.
// Ek user ek hi live subscription rakh sakta hai (checkout us par rok lagata hai).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (wrangler secret put).
// Vars/secrets: RAZORPAY_PLAN_ID_BASIC, RAZORPAY_PLAN_ID_PRO, RAZORPAY_PLAN_ID_SUPER.
// Raw Razorpay error, key aur payload kabhi log ya client tak nahi jaate.

import { authenticate, type AuthUser } from "../auth";
import type { Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { createSupabase, type SupabaseClient } from "../supabase";
import { isPaidTier, PAID_TIERS, TIER_TO_DB_PLAN, type PaidTier } from "../tiers";
import { grantPlanCredits, grantTopupCredits, monthlyCreditsFor } from "../credits";
import { isTopupId, TOPUP_PACKS, type TopupId } from "../topups";

// Ye events billing cycle ki shuruaat par credits dete hain (pehli baar aur har renewal par).
// Ek hi cycle ke liye dono aaye to ref same hai, isliye credits ek hi baar jaate hain.
const CREDIT_EVENTS: ReadonlySet<string> = new Set(["subscription.activated", "subscription.charged"]);

const RAZORPAY_API = "https://api.razorpay.com/v1";
// Ek subscription ke kitne billing cycles. 120 mahine = 10 saal, lamba enough hai.
const TOTAL_COUNT = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SubscriptionRow {
  plan: string;
  status: string;
  current_period_end: string | null;
}

// Razorpay subscription object ke woh fields jo hum use karte hain. Baaki ignore.
interface RazorpaySubscriptionEntity {
  id?: unknown;
  plan_id?: unknown;
  status?: unknown;
  current_end?: unknown;
  notes?: unknown;
}

// Razorpay order aur payment object ke woh fields jo booster ke liye chahiye.
interface RazorpayOrderEntity {
  id?: unknown;
  amount?: unknown;
  notes?: unknown;
}

interface RazorpayPaymentEntity {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
}

interface RazorpayWebhookPayload {
  event?: unknown;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
    order?: { entity?: RazorpayOrderEntity };
    payment?: { entity?: RazorpayPaymentEntity };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Tier ka Razorpay plan id. Na ho to us tier ki billing band.
function planIdFor(env: Env, tier: PaidTier): string | undefined {
  switch (tier) {
    case "basic":
      return env.RAZORPAY_PLAN_ID_BASIC;
    case "pro":
      return env.RAZORPAY_PLAN_ID_PRO;
    case "super":
      return env.RAZORPAY_PLAN_ID_SUPER;
  }
}

// Razorpay ke API secrets hain ya nahi. Na hon to billing band, baaki app chalti rahti hai.
function requireRazorpay(env: Env): { keyId: string; keySecret: string } {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new ApiError("provider_unavailable");
  return { keyId, keySecret };
}

// Razorpay ko POST. Error par sirf status log hota hai, body nahi.
async function razorpayPost<T>(
  env: Env,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { keyId, keySecret } = requireRazorpay(env);
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ event: "razorpay_request_failed", path, status: res.status }));
    throw new ApiError("provider_unavailable");
  }
  return (await res.json()) as T;
}

// Checkout body: { "tier": "basic" | "pro" | "super" }. Galat ho to invalid_request.
async function readTier(request: Request): Promise<PaidTier> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ApiError("invalid_request");
  }
  if (!isRecord(parsed) || !isPaidTier(parsed.tier)) throw new ApiError("invalid_request");
  return parsed.tier;
}

// Topup body: { "pack": "quick_try" | "mini" | "growth" | "vip" }. Galat ho to invalid_request.
async function readPack(request: Request): Promise<TopupId> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ApiError("invalid_request");
  }
  if (!isRecord(parsed) || !isTopupId(parsed.pack)) throw new ApiError("invalid_request");
  return parsed.pack;
}

// Kya user ki koi subscription abhi chalu (active ya payment baaki) hai?
async function hasLiveSubscription(db: SupabaseClient, userId: string): Promise<boolean> {
  const rows = await db.select<SubscriptionRow>(
    "subscriptions",
    `user_id=eq.${userId}&status=in.(active,past_due)&select=plan,status,current_period_end&limit=1`,
  );
  return rows.length > 0;
}

// Checkout: naya subscription banata hai. Frontend Razorpay Checkout ko subscription_id aur key_id deta hai.
// user_id aur tier notes mein jaate hain, taaki webhook sahi user aur sahi plan pehchane.
export async function handleCheckout(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const tier = await readTier(request);

  const planId = planIdFor(env, tier);
  const { keyId } = requireRazorpay(env);
  if (!planId) throw new ApiError("provider_unavailable");

  const db = createSupabase(env);
  if (await hasLiveSubscription(db, user.id)) {
    throw new ApiError("invalid_request", "आपका सब्सक्रिप्शन पहले से चालू है।");
  }

  const subscription = await razorpayPost<{ id?: unknown }>(env, "/subscriptions", {
    plan_id: planId,
    total_count: TOTAL_COUNT,
    customer_notify: 1,
    notes: { user_id: user.id, tier },
  });

  if (typeof subscription.id !== "string" || subscription.id.length === 0) {
    throw new ApiError("provider_unavailable");
  }

  return json({ subscription_id: subscription.id, key_id: keyId, tier }, 201);
}

// Booster order: amount server tay karta hai (pack se), client nahi. Free pack sirf free user, baaki sirf paid user ko.
export async function handleTopupOrder(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const packId = await readPack(request);
  const pack = TOPUP_PACKS[packId];
  const { keyId } = requireRazorpay(env);

  const db = createSupabase(env);
  const paid = await hasLiveSubscription(db, user.id);
  if (pack.freeOnly && paid) {
    throw new ApiError("invalid_request", "यह पैक सिर्फ़ फ़्री यूज़र के लिए है।");
  }
  if (!pack.freeOnly && !paid) {
    throw new ApiError("plan_required");
  }

  const amountPaise = pack.amountInr * 100;
  const order = await razorpayPost<{ id?: unknown }>(env, "/orders", {
    amount: amountPaise,
    currency: "INR",
    receipt: `tp_${crypto.randomUUID()}`,
    notes: { user_id: user.id, pack: packId },
  });

  if (typeof order.id !== "string" || order.id.length === 0) {
    throw new ApiError("provider_unavailable");
  }

  return json({ order_id: order.id, key_id: keyId, amount: amountPaise, currency: "INR", pack: packId }, 201);
}

// Signature check: Razorpay HMAC-SHA256 (hex) raw body par bhejta hai. Compare constant-time.
async function signatureIsValid(secret: string, rawBody: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// Razorpay status ko hamare status mein badalte hain.
function mapStatus(razorpayStatus: string): "active" | "past_due" | "cancelled" | null {
  switch (razorpayStatus) {
    case "active":
    case "authenticated":
      return "active";
    case "pending":
    case "halted":
      return "past_due";
    case "cancelled":
    case "completed":
    case "expired":
      return "cancelled";
    default:
      return null;
  }
}

// Tier pehchan: pehle notes.tier (checkout ne bheja), warna Razorpay plan id se milaana.
function tierFromEvent(
  env: Env,
  notes: Record<string, unknown>,
  planIdRaw: unknown,
): PaidTier | null {
  if (isPaidTier(notes.tier)) return notes.tier;
  if (typeof planIdRaw !== "string") return null;
  for (const tier of PAID_TIERS) {
    if (planIdFor(env, tier) === planIdRaw) return tier;
  }
  return null;
}

// Subscription row update karta hai. Na mile to naya banata hai.
async function upsertSubscription(
  db: SupabaseClient,
  userId: string,
  patch: { plan: string; status: "active" | "past_due" | "cancelled"; current_period_end: string | null },
): Promise<void> {
  const updated = await db.update<SubscriptionRow>(
    "subscriptions",
    `user_id=eq.${userId}`,
    { ...patch, updated_at: new Date().toISOString() },
  );
  if (updated.length === 0) {
    await db.insert("subscriptions", { user_id: userId, ...patch });
  }
}

// Billing cycle ke credits. Ref = subscription id + cycle ka end time, isliye ek cycle ek hi baar.
async function grantCycleCredits(
  db: SupabaseClient,
  userId: string,
  dbPlan: string,
  subscriptionId: unknown,
  periodEndUnix: number | null,
): Promise<void> {
  if (typeof subscriptionId !== "string" || periodEndUnix === null) {
    console.error(JSON.stringify({ event: "razorpay_credit_skipped", reason: "missing_period" }));
    return;
  }
  const amount = await monthlyCreditsFor(db, dbPlan);
  if (amount <= 0) {
    console.error(JSON.stringify({ event: "razorpay_credit_skipped", reason: "plan_credits_zero", plan: dbPlan }));
    return;
  }
  await grantPlanCredits(db, userId, amount, `sub:${subscriptionId}:${periodEndUnix}`);
}

// order.paid: booster ke credits. Amount pack se milaya jaata hai; mismatch par kuch nahi jorte (log hota hai).
// Ref = payment id, isliye same payment dobara aaye to credits ek hi baar jaate hain.
async function handleOrderPaid(parsed: RazorpayWebhookPayload, env: Env): Promise<Response> {
  const order = parsed.payload?.order?.entity;
  const payment = parsed.payload?.payment?.entity;
  if (!order || !payment || typeof payment.id !== "string") {
    return json({ received: true });
  }

  const notes = isRecord(order.notes) ? order.notes : {};
  const userId = typeof notes.user_id === "string" ? notes.user_id : "";
  if (!UUID_RE.test(userId) || !isTopupId(notes.pack)) {
    console.error(JSON.stringify({ event: "razorpay_topup_missing_meta" }));
    return json({ received: true });
  }

  const pack = TOPUP_PACKS[notes.pack];
  const expectedPaise = pack.amountInr * 100;
  if (order.amount !== expectedPaise || payment.amount !== expectedPaise) {
    console.error(JSON.stringify({ event: "razorpay_topup_amount_mismatch", pack: pack.id }));
    return json({ received: true });
  }

  const db = createSupabase(env);
  await grantTopupCredits(db, userId, pack.credits, `topup:${payment.id}`);

  console.error(JSON.stringify({ event: "razorpay_topup_applied", pack: pack.id }));
  return json({ received: true });
}

// Webhook: pehle signature, phir event. Galat signature par 400, koi DB badlaav nahi.
export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("provider_unavailable");

  const signature = request.headers.get("X-Razorpay-Signature");
  if (signature === null) throw new ApiError("invalid_request");

  const rawBody = await request.text();
  if (!(await signatureIsValid(secret, rawBody, signature))) {
    console.error(JSON.stringify({ event: "razorpay_signature_invalid" }));
    throw new ApiError("invalid_request");
  }

  let parsed: RazorpayWebhookPayload;
  try {
    parsed = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    throw new ApiError("invalid_request");
  }

  const eventName = typeof parsed.event === "string" ? parsed.event : "";

  if (eventName === "order.paid") {
    return handleOrderPaid(parsed, env);
  }

  const entity = parsed.payload?.subscription?.entity;
  // Subscription se juda event nahi hai (ya entity nahi): 200 do, taaki Razorpay dobara na bheje.
  if (!entity || !eventName.startsWith("subscription.")) {
    return json({ received: true });
  }

  const notes = isRecord(entity.notes) ? entity.notes : {};
  const userId = typeof notes.user_id === "string" ? notes.user_id : "";
  if (!UUID_RE.test(userId)) {
    console.error(JSON.stringify({ event: "razorpay_missing_user", type: eventName }));
    return json({ received: true });
  }

  const status = typeof entity.status === "string" ? mapStatus(entity.status) : null;
  const currentEnd = typeof entity.current_end === "number" ? entity.current_end : null;
  const periodEnd = currentEnd !== null ? new Date(currentEnd * 1000).toISOString() : null;

  if (status === null) {
    return json({ received: true });
  }

  const tier = tierFromEvent(env, notes, entity.plan_id);
  let plan: string;
  if (status === "cancelled") {
    plan = "free";
  } else if (tier !== null) {
    plan = TIER_TO_DB_PLAN[tier];
  } else {
    // Active ya payment baaki, par tier pata nahi: plan na badlein, sirf log.
    console.error(JSON.stringify({ event: "razorpay_tier_unknown", type: eventName }));
    return json({ received: true });
  }

  const db = createSupabase(env);
  await upsertSubscription(db, userId, {
    plan,
    status,
    current_period_end: periodEnd,
  });

  // Naya billing cycle: plan ke credits. Error par throw karte hain, taaki Razorpay dobara bheje (ref se safe).
  if (status === "active" && CREDIT_EVENTS.has(eventName)) {
    await grantCycleCredits(db, userId, plan, entity.id, currentEnd);
  }

  console.error(JSON.stringify({ event: "razorpay_event_applied", type: eventName, status, plan }));
  return json({ received: true });
}

export async function handleBilling(request: Request, env: Env): Promise<Response> {
  const traceId = crypto.randomUUID();
  try {
    const url = new URL(request.url);

    if (url.pathname === "/api/billing/webhook") {
      if (request.method !== "POST") throw new ApiError("invalid_request");
      return await handleWebhook(request, env);
    }

    if (url.pathname === "/api/billing/checkout") {
      if (request.method !== "POST") throw new ApiError("invalid_request");
      const user = await authenticate(request, env);
      return await handleCheckout(request, env, user);
    }

    if (url.pathname === "/api/billing/topup") {
      if (request.method !== "POST") throw new ApiError("invalid_request");
      const user = await authenticate(request, env);
      return await handleTopupOrder(request, env, user);
    }

    throw new ApiError("invalid_request");
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "billing_request_failed",
        code: err instanceof ApiError ? err.code : "internal",
        request_id: traceId,
      }),
    );
    return toErrorResponse(err, traceId);
  }
}