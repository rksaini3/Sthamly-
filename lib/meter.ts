import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { debitWallet } from "@/lib/wallet";

// सारी रकम paise में। ₹0.5 = 50 paise, ₹1 = 100 paise।
export const FREE_CHATS_PER_DAY = 25;
export const FREE_LIVE_PER_DAY = 3;
export const CHAT_PRICE_PAISE = 50;
export const LIVE_PRICE_PAISE = 100;

export type AssistantKind = "chat" | "live";

export type MeterResult =
  | { ok: true; source: "free" }
  | { ok: true; source: "wallet"; jobId: string; balancePaise: number }
  | { ok: false; balancePaise: number };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// आज का IST 00:00 (कोटा हर दिन IST के हिसाब से रीसेट होता है)
function istDayStart(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(startIst - IST_OFFSET_MS);
}

/**
 * एक चैट या लाइव सत्र के लिए क्रेडिट लें।
 * 1) आज का मुफ़्त कोटा बचा हो तो वही।
 * 2) वरना वॉलेट से कटौती। बैलेंस कम हो तो ok=false।
 * Error throw हो सकता है (database बंद हो), कॉलर उसे संभाले।
 */
export async function takeAssistantCredit(userId: string, kind: AssistantKind): Promise<MeterResult> {
  const admin = createSupabaseAdminClient();
  const limit = kind === "chat" ? FREE_CHATS_PER_DAY : FREE_LIVE_PER_DAY;
  const price = kind === "chat" ? CHAT_PRICE_PAISE : LIVE_PRICE_PAISE;

  // TODO: types/database.ts में यह function अभी नहीं है। database types दोबारा बनने पर यह cast हटा दें।
  const rpc = (admin.rpc as unknown as (
    fn: "assistant_take_free",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>).bind(admin);

  const { data, error } = await rpc("assistant_take_free", {
    p_user: userId,
    p_kind: kind,
    p_limit: limit,
    p_since: istDayStart().toISOString(),
  });
  if (error) throw error;
  if (data === true) return { ok: true, source: "free" };

  const jobId = randomUUID();
  const debit = await debitWallet({
    userId,
    jobId,
    item: kind === "chat" ? "assistant_chat" : "assistant_live",
    amountPaise: price,
  });
  if (debit.ok) {
    return { ok: true, source: "wallet", jobId, balancePaise: debit.balancePaise };
  }
  return { ok: false, balancePaise: debit.balancePaise };
}