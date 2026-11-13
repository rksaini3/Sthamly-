import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { allowRequest } from "@/lib/rate-limit";
import { takeAssistantCredit } from "@/lib/meter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refundWalletForJob } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  // एक यूज़र एक घंटे में ज़्यादा से ज़्यादा 10 session शुरू कर सकता है
  if (!(await allowRequest(`live:${user.id}`, 3600, 10))) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "थोड़ी देर बाद कोशिश करें" } }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Live सेटअप अधूरा है" } }, { status: 500 });
  }

  // मीटरिंग: पहले मुफ़्त 3 सत्र, फिर वॉलेट से ₹1 प्रति सत्र
  const credit = await takeAssistantCredit(user.id, "live").catch((error: unknown) => {
    console.error("live token: meter failed", error);
    return null;
  });
  if (!credit) {
    return NextResponse.json(
      { error: { code: "METER_DOWN", message: "अभी सेवा उपलब्ध नहीं, थोड़ी देर बाद कोशिश करें" } },
      { status: 503 },
    );
  }
  if (!credit.ok) {
    return NextResponse.json(
      {
        error: { code: "NEED_RECHARGE", message: "आज के मुफ़्त लाइव सत्र खत्म हो गए। वॉलेट में बैलेंस डालें।" },
        balancePaise: credit.balancePaise,
      },
      { status: 402 },
    );
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  const now = Date.now();

  try {
    const client = new GoogleGenAI({ apiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      },
    });
    return NextResponse.json({ token: token.name, model });
  } catch (error) {
    console.error("live token failed", error);
    if (credit.source === "wallet") {
      try {
        await refundWalletForJob(credit.jobId);
      } catch (refundError) {
        console.error("live token: wallet refund failed", refundError);
      }
    }
    return NextResponse.json({ error: { code: "TOKEN_FAILED", message: "Live शुरू नहीं हो पाया" } }, { status: 502 });
  }
}