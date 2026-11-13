import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { allowRequest } from "@/lib/rate-limit";
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

  // एक यूज़र एक घंटे में ज़्यादा से ज़्यादा 10 live session (cost पर नियंत्रण)
  if (!(await allowRequest(`live:${user.id}`, 3600, 10))) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "थोड़ी देर बाद कोशिश करें" } }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Live सेटअप अधूरा है" } }, { status: 500 });
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  const now = Date.now();

  try {
    const client = new GoogleGenAI({ apiKey });
    const token = await client.authTokens.create({
      config: {
        uses: 1, // एक token = एक session
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      },
    });
    return NextResponse.json({ token: token.name, model });
  } catch (error) {
    console.error("live token failed", error);
    return NextResponse.json({ error: { code: "TOKEN_FAILED", message: "Live शुरू नहीं हो पाया" } }, { status: 502 });
  }
}