import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaidPlan } from "@/lib/pricing";

// Razorpay REST और webhook सुरक्षा। सिर्फ़ server पर।
// Keys env में: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
// Plan IDs (Razorpay dashboard में बनाए गए): RAZORPAY_PLAN_ID_<PLAN>_<CYCLE>
//   उदाहरण: RAZORPAY_PLAN_ID_STARTER_MONTHLY, RAZORPAY_PLAN_ID_PREMIUM_YEARLY

const API_BASE = "https://api.razorpay.com/v1";

export type BillingCycle = "monthly" | "yearly";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getRazorpayKeyId(): string {
  return requireEnv("RAZORPAY_KEY_ID");
}

function authHeader(): string {
  const token = Buffer.from(`${requireEnv("RAZORPAY_KEY_ID")}:${requireEnv("RAZORPAY_KEY_SECRET")}`).toString("base64");
  return `Basic ${token}`;
}

export function planIdFor(plan: PaidPlan, cycle: BillingCycle): string {
  const key = `RAZORPAY_PLAN_ID_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return requireEnv(key);
}

async function razorpayPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as T | { error?: { description?: string } } | null;
  if (!res.ok) {
    const desc = (json as { error?: { description?: string } } | null)?.error?.description;
    throw new Error(`Razorpay ${path} failed: ${res.status} ${desc ?? ""}`.trim());
  }
  return json as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createTopupOrder(input: {
  userId: string;
  amountPaise: number;
  receipt: string;
}): Promise<RazorpayOrder> {
  return razorpayPost<RazorpayOrder>("/orders", {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt,
    notes: { kind: "topup", user_id: input.userId },
  });
}

/**
 * Order पढ़ें (उसके notes समेत)। Webhook में payment पर notes अक्सर नहीं आते,
 * इसलिए top-up की पहचान order से होती है।
 */
export async function fetchOrder(orderId: string): Promise<{ id: string; notes?: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json().catch(() => null)) as { id?: string; notes?: Record<string, string> } | null;
  if (!res.ok || !json?.id) {
    throw new Error(`Razorpay order fetch failed: ${res.status}`);
  }
  return { id: json.id, notes: json.notes };
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url?: string;
}

export async function createPlanSubscription(input: {
  userId: string;
  plan: PaidPlan;
  cycle: BillingCycle;
}): Promise<RazorpaySubscription> {
  return razorpayPost<RazorpaySubscription>("/subscriptions", {
    plan_id: planIdFor(input.plan, input.cycle),
    // मासिक: 10 साल तक; सालाना: 10 साल तक (हर साल एक बार कटेगा)
    total_count: input.cycle === "monthly" ? 120 : 10,
    customer_notify: 1,
    notes: { kind: "subscription", user_id: input.userId, plan: input.plan, cycle: input.cycle },
  });
}

/**
 * Webhook की सुरक्षा: X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret), hex में।
 * raw body (string) ही दें, parsed JSON नहीं।
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}