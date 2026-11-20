import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { allowRequest } from "@/lib/rate-limit";
import { checkUsage, recordUsage } from "@/lib/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  // मीटरिंग: प्लान की रोज़ की शामिल सीमा, फिर वॉलेट से (नियम lib/usage-rules.ts में हैं)
  // सत्र शुरू होने के बाद ही इस्तेमाल दर्ज होता है, इसलिए यहाँ अभी कुछ नहीं कटता।
  let usage: Awaited<ReturnType<typeof checkUsage>>;
  try {
    usage = await checkUsage(user.id, "live");
  } catch (error: unknown) {
    console.error("live token: usage check failed", error);
    return NextResponse.json(
      { error: { code: "METER_DOWN", message: "अभी सेवा उपलब्ध नहीं, थोड़ी देर बाद कोशिश करें" } },
      { status: 503 },
    );
  }
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: { code: "NEED_RECHARGE", message: "आज के मुफ़्त लाइव सत्र खत्म हो गए। वॉलेट में बैलेंस डालें।" },
        balancePaise: usage.walletPaise,
        pricePaise: usage.pricePaise,
      },
      { status: 402 },
    );
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  const now = Date.now();

  let tokenName: string | undefined;
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      },
    });
    tokenName = token.name;
  } catch (error: unknown) {
    // token नहीं बना: कोई इस्तेमाल दर्ज नहीं, इसलिए पैसे नहीं कटे
    console.error("live token failed", error);
    return NextResponse.json({ error: { code: "TOKEN_FAILED", message: "Live शुरू नहीं हो पाया" } }, { status: 502 });
  }

  // सत्र शुरू हुआ: अब इस्तेमाल दर्ज करें और (ज़रूरत हो तो) वॉलेट से काटें
  await recordUsage(user.id, "live", usage.willPayPaise);

  return NextResponse.json({ token: tokenName, model });
}