import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "standardwebhooks";
import { sendOtp } from "@/lib/sms/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase Send SMS hook। Supabase OTP भेजने से पहले यहाँ call करता है।
// Signature Standard Webhooks के हिसाब से जांचा जाता है, ताकि कोई और यहाँ से SMS न भेज सके।

interface HookPayload {
  user?: { phone?: string };
  sms?: { otp?: string };
}

export async function POST(req: NextRequest) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error("sms hook: SEND_SMS_HOOK_SECRET सेट नहीं है");
    return NextResponse.json({ error: { message: "hook not configured" } }, { status: 500 });
  }

  const raw = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  let payload: HookPayload;
  try {
    payload = new Webhook(secret).verify(raw, headers) as HookPayload;
  } catch {
    return NextResponse.json({ error: { message: "invalid signature" } }, { status: 401 });
  }

  const phone = payload.user?.phone ?? "";
  const otp = payload.sms?.otp ?? "";
  // E.164 फ़ॉर्मेट (+ और देश कोड) और 6 अंक का OTP
  if (!/^\+\d{10,15}$/.test(phone) || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: { message: "bad payload" } }, { status: 400 });
  }

  try {
    await sendOtp({ phone, otp });
  } catch (error) {
    // OTP कभी log नहीं होता, सिर्फ़ कारण
    console.error("sms hook: OTP send failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { message: "sms send failed" } }, { status: 502 });
  }

  return NextResponse.json({});
}