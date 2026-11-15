import { NextResponse, type NextRequest } from "next/server";
import { preflight, withCors } from "@/lib/cors";
import { userFromBearer } from "@/lib/mobile-auth";
import { getWalletBalance } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// APK के लिए: सिर्फ़ wallet balance। सिर्फ़ Bearer token से (cookie नहीं),
// ताकि web का /api/usage और उसका जवाब जस का तस रहे।

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  const user = await userFromBearer(req).catch((error: unknown) => {
    console.error("mobile wallet: token check failed", error);
    return null;
  });
  if (!user) {
    return withCors(
      NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 }),
      origin,
    );
  }

  try {
    const walletPaise = await getWalletBalance(user.id);
    return withCors(NextResponse.json({ walletPaise }), origin);
  } catch (error) {
    console.error("mobile wallet: balance read failed", error);
    return withCors(
      NextResponse.json({ error: { code: "READ_FAILED", message: "बैलेंस अभी नहीं दिख रहा" } }, { status: 500 }),
      origin,
    );
  }
}