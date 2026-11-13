import type { SupabaseClient } from "@supabase/supabase-js";
import { getActivePlan } from "@/lib/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWalletBalance } from "@/lib/wallet";
import { EXTRA_PRICE_PAISE, INCLUDED_PER_DAY, type UsageKind } from "@/lib/usage-rules";
import type { Plan } from "@/types/domain";

// इस्तेमाल का हिसाब: चैट के संदेश और लाइव कैमरे के सवाल।
// नियम: रोज़ की शामिल सीमा तक मुफ़्त (या प्लान में शामिल)। उसके बाद वॉलेट से थोड़े पैसे कटते हैं।
// वॉलेट में पैसे न हों तो रुक जाता है और अपग्रेड/टॉप-अप माँगता है।
// सारे नंबर यहीं हैं। कीमत या सीमा बदलनी हो तो सिर्फ़ यहाँ बदलें।

export { EXTRA_PRICE_PAISE, INCLUDED_PER_DAY, type UsageKind };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// आज (IST) की शुरुआत, ISO string में
export function istDayStartIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS).toISOString();
}

// नई टेबल/function अभी types/database.ts में नहीं हैं, इसलिए यहाँ बिना type वाला client
function db(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

async function usedToday(userId: string, kind: UsageKind): Promise<number> {
  const { count, error } = await db()
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", istDayStartIso());
  if (error) throw error;
  return count ?? 0;
}

export interface UsageSnapshot {
  plan: Plan;
  walletPaise: number;
  chat: { used: number; included: number; pricePaise: number };
  live: { used: number; included: number; pricePaise: number };
}

export async function getUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const [plan, walletPaise, chatUsed, liveUsed] = await Promise.all([
    getActivePlan(userId),
    getWalletBalance(userId),
    usedToday(userId, "chat"),
    usedToday(userId, "live"),
  ]);
  const inc = INCLUDED_PER_DAY[plan];
  return {
    plan,
    walletPaise,
    chat: { used: chatUsed, included: inc.chat, pricePaise: EXTRA_PRICE_PAISE.chat },
    live: { used: liveUsed, included: inc.live, pricePaise: EXTRA_PRICE_PAISE.live },
  };
}

export type UsageCheck =
  | { ok: true; willPayPaise: number }
  | { ok: false; plan: Plan; walletPaise: number; pricePaise: number };

// काम से पहले: क्या इजाज़त है? (अभी कुछ नहीं कटता)
export async function checkUsage(userId: string, kind: UsageKind): Promise<UsageCheck> {
  const snap = await getUsageSnapshot(userId);
  const bucket = snap[kind];
  if (bucket.used < bucket.included) return { ok: true, willPayPaise: 0 };
  if (snap.walletPaise >= bucket.pricePaise) return { ok: true, willPayPaise: bucket.pricePaise };
  return { ok: false, plan: snap.plan, walletPaise: snap.walletPaise, pricePaise: bucket.pricePaise };
}

// काम सफल होने के बाद: इस्तेमाल दर्ज करें और (ज़रूरत हो तो) वॉलेट से काटें।
// दर्ज न हो पाए तो भी यूज़र का जवाब न रुके, इसलिए गड़बड़ सिर्फ़ log होती है।
export async function recordUsage(userId: string, kind: UsageKind, paidPaise: number): Promise<void> {
  try {
    const { data, error } = await db().rpc("spend_for_usage", {
      p_user: userId,
      p_kind: kind,
      p_amount: paidPaise,
    });
    if (error) throw error;
    if (data === -1) {
      // बीच में बैलेंस घट गया: मुफ़्त दर्ज करें, ताकि गिनती सही रहे
      await db().from("usage_events").insert({ user_id: userId, kind, amount_paise: 0 });
    }
  } catch (error) {
    console.error("usage record failed", error);
  }
}