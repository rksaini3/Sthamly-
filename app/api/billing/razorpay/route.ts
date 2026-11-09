import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { creditWallet } from "@/lib/wallet";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Razorpay webhook. Razorpay Dashboard में इसका URL: /api/billing/razorpay
// Events: payment.captured (वॉलेट टॉप-अप), subscription.activated / charged (सक्रिय),
//         subscription.halted / cancelled / completed / paused (बंद), payment.failed (लॉग)
// नियम: सिर्फ़ signature सही हो तो ही आगे बढ़ें। हर event दोबारा आए तो भी सुरक्षित रहे।

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: PaymentEntity };
    subscription?: { entity: SubscriptionEntity };
  };
}

interface PaymentEntity {
  id: string;
  amount: number; // paise में
  currency: string;
  status: string;
  notes?: Record<string, string>;
}

interface SubscriptionEntity {
  id: string;
  status: string;
  current_end?: number | null; // unix seconds
  notes?: Record<string, string>;
}

const STATUS_FOR_EVENT: Record<string, string> = {
  "subscription.halted": "halted",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "completed",
  "subscription.paused": "paused",
};

export async function POST(req: NextRequest) {
  // raw body चाहिए, ताकि signature की जाँच सही हो
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, code: "BAD_SIGNATURE" }, { status: 400 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "payment.captured":
        await handleCapturedPayment(event.payload.payment?.entity);
        break;

      case "subscription.activated":
      case "subscription.charged":
        await handleSubscriptionActive(event.payload.subscription?.entity);
        break;

      case "subscription.halted":
      case "subscription.cancelled":
      case "subscription.completed":
      case "subscription.paused":
        await handleSubscriptionEnded(event.event, event.payload.subscription?.entity);
        break;

      case "payment.failed":
        console.warn("razorpay: payment failed", event.payload.payment?.entity?.id);
        break;

      default:
        // अनजान event: 200 लौटाएँ ताकि Razorpay बार-बार न भेजे
        break;
    }
  } catch (error) {
    // 500 लौटाने से Razorpay दोबारा भेजेगा। सभी handler idempotent हैं, इसलिए सुरक्षित है।
    console.error("razorpay webhook: handler failed", event.event, error);
    return NextResponse.json({ ok: false, code: "HANDLER_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleCapturedPayment(payment: PaymentEntity | undefined): Promise<void> {
  if (!payment) return;
  if (payment.notes?.kind !== "topup") return; // सब्सक्रिप्शन की कटौती इस रास्ते से नहीं
  const userId = payment.notes?.user_id;
  if (!userId) {
    console.error("razorpay: topup payment without user_id", payment.id);
    return;
  }

  const result = await creditWallet({
    userId,
    amountPaise: payment.amount,
    paymentId: payment.id,
  });

  if (result.credited) {
    console.info("razorpay: wallet credited", { userId, paymentId: payment.id, bonus: result.bonusPaise });
  }
}

async function handleSubscriptionActive(sub: SubscriptionEntity | undefined): Promise<void> {
  if (!sub) return;
  const admin = createSupabaseAdminClient();
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;

  const { data: updated, error: updateError } = await admin
    .from("subscriptions")
    .update({ status: "active", current_period_end: periodEnd })
    .eq("razorpay_sub_id", sub.id)
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (updated) return;

  // पंक्ति नहीं मिली (जैसे सीधे Razorpay से बना सब्सक्रिप्शन): notes से बनाएँ
  const userId = sub.notes?.user_id;
  const plan = sub.notes?.plan;
  if (!userId || !plan) {
    console.error("razorpay: subscription without user/plan notes", sub.id);
    return;
  }

  const { error: insertError } = await admin.from("subscriptions").insert({
    user_id: userId,
    plan,
    status: "active",
    razorpay_sub_id: sub.id,
    current_period_end: periodEnd,
  });
  if (insertError) throw insertError;
}

async function handleSubscriptionEnded(eventName: string, sub: SubscriptionEntity | undefined): Promise<void> {
  if (!sub) return;
  const status = STATUS_FOR_EVENT[eventName];
  if (!status) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({ status })
    .eq("razorpay_sub_id", sub.id);

  if (error) throw error;
}
