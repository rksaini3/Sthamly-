import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPlanSubscription, getRazorpayKeyId } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST { plan: "starter" | "premium" | "business", cycle: "monthly" | "yearly" }
// Razorpay subscription बनाता है और checkout का लिंक लौटाता है।
// Status "active" तब होगा जब webhook subscription.activated भेजेगा।
const bodySchema = z.object({
  plan: z.enum(["starter", "premium", "business"]),
  cycle: z.enum(["monthly", "yearly"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // पहले से सक्रिय सब्सक्रिप्शन हो तो नया न बनाएँ (दोहरी कटौती रोकने के लिए)
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("subscribe: active check failed", existingError);
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: false, code: "ALREADY_ACTIVE" }, { status: 409 });
  }

  try {
    const sub = await createPlanSubscription({
      userId: user.id,
      plan: parsed.data.plan,
      cycle: parsed.data.cycle,
    });

    const { error: insertError } = await admin.from("subscriptions").insert({
      user_id: user.id,
      plan_tier: parsed.data.plan,
      status: "pending",
      razorpay_subscription_id: sub.id,
    });

    if (insertError) {
      console.error("subscribe: row insert failed", insertError);
      return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      subscriptionId: sub.id,
      checkoutUrl: sub.short_url ?? null,
      keyId: getRazorpayKeyId(),
    });
  } catch (error) {
    console.error("subscribe: razorpay create failed", error);
    return NextResponse.json({ ok: false, code: "SUBSCRIPTION_FAILED" }, { status: 502 });
  }
}
