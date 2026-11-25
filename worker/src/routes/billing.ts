// Sthamly AI Worker: Razorpay subscription (billing).
// POST /api/billing/checkout   login user ke liye Razorpay subscription banata hai, frontend ko subscription_id deta hai
// POST /api/billing/webhook    Razorpay ke events (signature check ke baad) subscriptions table update karte hain
// Plan aur status hamesha DB se padhe jaate hain. Client kabhi plan ko 'paid' nahi bana sakta: sirf webhook likhta hai.
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (wrangler secret put).
// Var: RAZORPAY_PLAN_ID (wrangler.toml ya secret). Raw Razorpay error, key aur payload kabhi log ya client tak nahi jaate.

import { authenticate, type AuthUser } from "../auth";
import type { Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { createSupabase, type SupabaseClient } from "../supabase";

const RAZORPAY_API = "https://api.razorpay.com/v1";
// Ek subscription ke kitne billing cycles. 120 mahine = 10 saal, lamba enough hai.
const TOTAL_COUNT = 120;
// App mein "premium" plan ka database naam. plan.ts ke PLAN_ORDER mein yahi hona chahiye.
// TODO: confirm karein ki Premium = 'plus' hai ya 'pro'.
const PREMIUM_DB_PLAN = "plus";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SubscriptionRow {
  id: string;
  user_id: string;
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

interface RazorpayWebhookPayload {
  event?: unknown;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
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

// Razorpay ke secrets hain ya nahi. Na hon to billing band, baaki app chalti rahti hai.
function requireRazorpay(env: Env): { keyId: string; keySecret: string; planId: string } {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const planId = env.RAZORPAY_PLAN_ID;
  if (!keyId || !keySecret || !planId) throw new ApiError("provider_unavailable");
  return { keyId, keySecret, planId };
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

// Checkout: naya subscription banata hai. Frontend Razorpay Checkout ko subscription_id aur key_id deta hai.
// user_id notes mein jaata hai, taaki webhook sahi user ko pehchane.
export async function handleCheckout(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const { keyId, planId } = requireRazorpay(env);

  const subscription = await razorpayPost<{ id?: unknown }>(env, "/subscriptions", {
    plan_id: planId,
    total_count: TOTAL_COUNT,
    customer_notify: 1,
    notes: { user_id: user.id },
  });

  if (typeof subscription.id !== "string" || subscription.id.length === 0) {
    throw new ApiError("provider_unavailable");
  }

  return json({ subscription_id: subscription.id, key_id: keyId, plan: "premium" }, 201);
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

  const db = createSupabase(env);
  await upsertSubscription(db, userId, {
    plan: status === "cancelled" ? "free" : PREMIUM_DB_PLAN,
    status,
    current_period_end: periodEnd,
  });

  console.error(JSON.stringify({ event: "razorpay_event_applied", type: eventName, status }));
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