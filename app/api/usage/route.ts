import { NextResponse, type NextRequest } from "next/server";
import { preflight, withCors } from "@/lib/cors";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWalletBalancePaise } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  // पहले APK वाला रास्ता (Bearer), फिर web वाला (cookie)
  let userId: string | null = (await userFromBearer(req))?.id ?? null;
  if (!userId) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) {
    return withCors(
      NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 }),
      origin,
    );
  }

  const balancePaise = await getWalletBalancePaise(userId);
  return withCors(NextResponse.json({ walletPaise: balancePaise }), origin);
}