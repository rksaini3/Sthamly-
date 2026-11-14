import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPlanSubscription, getRazorpayKeyId, planIdFor } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST { plan: "starter" | "premium" | "business", cycle: "monthly" | "yearly" }
// Razorpay subscription बनाता है और checkout के लिए id लौटाता है।
// हर विफलता का अलग code और साफ़ Hindi message, ताकि UI और logs में असली कारण दिखे।
// Status "active" तब होगा जब webhook subscription.activated भेजेगा।

const bodySchema = z.object({
  plan: z.enum(["starter", "premium", "business"]),
  cycle: z.enum(["monthly", "yearly"]),
});

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail(401, "UNAUTHORIZED", "भुगतान के लिए पहले लॉग-इन करें।");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "प्लान सही नहीं चुना गया।");

  const { plan, cycle } = parsed.data;

  // 1. Razorpay की keys और इस प्लान की id env में हैं या नहीं (Razorpay को बुलाने से पहले)
  let keyId: string;
  try {
    keyId = getRazorpayKeyId();
    planIdFor(plan, cycle);
  } catch (error) {
    console.error("subscribe: razorpay env missing", { plan, cycle, error: String(error) });
    return fail(
      503,
      "PLAN_NOT_CONFIGURED",
      "यह प्लान अभी चालू नहीं हुआ है। कुछ देर बाद दोबारा कोशिश करें।",
    );
  }

  const admin = createSupabaseAdminClient();

  // 2. पहले से सक्रिय सब्सक्रिप्शन हो तो नया न बनाएँ (दोहरी कटौती रोकने के लिए)
  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("subscribe: active check failed", existingError);
    return fail(500, "INTERNAL", "कुछ गड़बड़ हुई, दोबारा कोशिश करें।");
  }
  if (existing) {
    return fail(409, "ALREADY_ACTIVE", "आपका प्लान पहले से चालू है।");
  }

  // 3. Razorpay पर subscription बनाएँ
  let sub;
  try {
    sub = await createPlanSubscription({ userId: user.id, plan, cycle });
  } catch (error) {
    // createPlanSubscription में Razorpay का जवाब error message में आता है
    console.error("subscribe: razorpay rejected", { plan, cycle, error: String(error) });
    return fail(
      502,
      "RAZORPAY_REJECTED",
      "Razorpay ने यह प्लान नहीं बनाया। थोड़ी देर बाद दोबारा कोशिश करें।",
    );
  }

  // 4. हमारे database में "pending" पंक्ति (webhook बाद में इसे active करेगा)
  const { error: insertError } = await admin.from("subscriptions").insert({
    user_id: user.id,
    plan_tier: plan,
    status: "pending",
    razorpay_subscription_id: sub.id,
  });

  if (insertError) {
    console.error("subscribe: row insert failed", insertError);
    return fail(500, "INTERNAL", "कुछ गड़बड़ हुई, दोबारा कोशिश करें।");
  }

  return NextResponse.json({
    ok: true,
    subscriptionId: sub.id,
    checkoutUrl: sub.short_url ?? null,
    keyId,
  });
}