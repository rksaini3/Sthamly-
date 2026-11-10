import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createTopupOrder, getRazorpayKeyId } from "@/lib/billing/razorpay";
import { TOPUP_PRESETS_PAISE } from "@/lib/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST { amountPaise } → वॉलेट में पैसे डालने के लिए Razorpay order।
// रकम सिर्फ़ तय विकल्पों में से (₹50, ₹100, ₹200, ₹500)। असली क्रेडिट webhook से होता है।
const bodySchema = z.object({
  amountPaise: z.number().int().refine((v) => (TOPUP_PRESETS_PAISE as readonly number[]).includes(v), {
    message: "invalid amount",
  }),
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
    return NextResponse.json({ ok: false, code: "BAD_AMOUNT" }, { status: 400 });
  }

  try {
    const order = await createTopupOrder({
      userId: user.id,
      amountPaise: parsed.data.amountPaise,
      receipt: `tu_${user.id.slice(0, 8)}_${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      amountPaise: order.amount,
      keyId: getRazorpayKeyId(),
    });
  } catch (error) {
    console.error("topup: order create failed", error);
    return NextResponse.json({ ok: false, code: "ORDER_FAILED" }, { status: 502 });
  }
}