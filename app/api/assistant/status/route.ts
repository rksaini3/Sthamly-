import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CHAT_PRICE_PAISE, FREE_CHATS_PER_DAY, FREE_LIVE_PER_DAY, LIVE_PRICE_PAISE } from "@/lib/meter";
import { getActivePlan, windowStart } from "@/lib/quota";
import { getWalletBalance } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// आज (IST) कितने चैट या लाइव सत्र हो चुके हैं
async function usedToday(userId: string, kind: "chat" | "live"): Promise<number> {
  const admin = createSupabaseAdminClient();
  const rpc = (admin.rpc as unknown as (
    fn: "assistant_used",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>).bind(admin);

  const { data, error } = await rpc("assistant_used", {
    p_user: userId,
    p_kind: kind,
    p_since: windowStart("day").toISOString(),
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  try {
    const [plan, walletPaise, chatUsed, liveUsed] = await Promise.all([
      getActivePlan(user.id),
      getWalletBalance(user.id),
      usedToday(user.id, "chat"),
      usedToday(user.id, "live"),
    ]);

    return NextResponse.json({
      plan,
      walletPaise,
      chatsLeft: Math.max(0, FREE_CHATS_PER_DAY - chatUsed),
      liveLeft: Math.max(0, FREE_LIVE_PER_DAY - liveUsed),
      freeChats: FREE_CHATS_PER_DAY,
      freeLive: FREE_LIVE_PER_DAY,
      chatPricePaise: CHAT_PRICE_PAISE,
      livePricePaise: LIVE_PRICE_PAISE,
    });
  } catch (error) {
    console.error("assistant status failed", error);
    return NextResponse.json({ error: { code: "STATUS_FAILED", message: "जानकारी नहीं मिल पाई" } }, { status: 500 });
  }
}