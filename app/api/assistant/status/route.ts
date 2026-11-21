import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUsageSnapshot } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// असिस्टेंट की आज की स्थिति: बचे हुए शामिल चैट/लाइव सवाल, वॉलेट और कीमतें।
// सारे नंबर lib/usage-rules.ts से आते हैं (lib/usage.ts के ज़रिए), ताकि हर जगह एक ही हिसाब रहे।
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  try {
    const snap = await getUsageSnapshot(user.id);

    return NextResponse.json({
      plan: snap.plan,
      walletPaise: snap.walletPaise,
      chatsLeft: Math.max(0, snap.chat.included - snap.chat.used),
      liveLeft: Math.max(0, snap.live.included - snap.live.used),
      freeChats: snap.chat.included,
      freeLive: snap.live.included,
      chatPricePaise: snap.chat.pricePaise,
      livePricePaise: snap.live.pricePaise,
    });
  } catch (error) {
    console.error("assistant status failed", error);
    return NextResponse.json({ error: { code: "STATUS_FAILED", message: "जानकारी नहीं मिल पाई" } }, { status: 500 });
  }
}
