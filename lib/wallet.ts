import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FIRST_TOPUP_BONUS_MIN_PAISE, FIRST_TOPUP_BONUS_PERCENT } from "@/lib/pricing";

// वॉलेट के सभी काम server पर होते हैं (admin client)।
// सारी असली जांच और लिखना database function में होता है, ताकि race न हो।

export interface DebitResult {
  ok: boolean;
  balancePaise: number;
}

export interface CreditResult {
  credited: boolean;
  balancePaise: number;
  bonusPaise: number;
}

export async function getWalletBalance(userId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallets")
    .select("balance_paise")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.balance_paise ?? 0;
}

/**
 * वॉलेट से कटौती। बैलेंस कम हो तो ok=false और कुछ नहीं कटता।
 * item = PRICE_PAISE का कोई नाम (जैसे "ai_poster"), ledger में दर्ज होता है।
 */
export async function debitWallet(input: {
  userId: string;
  jobId: string;
  item: string;
  amountPaise: number;
}): Promise<DebitResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("wallet_debit", {
    p_user: input.userId,
    p_amount: input.amountPaise,
    p_item: input.item,
    p_job: input.jobId,
  });

  if (error) throw error;

  const result = data as { ok?: unknown; balance?: unknown } | null;
  if (typeof result?.ok !== "boolean" || typeof result?.balance !== "number") {
    throw new Error("wallet_debit returned unexpected shape");
  }
  return { ok: result.ok, balancePaise: result.balance };
}

/**
 * भुगतान सफल होने के बाद वॉलेट में डालें। payment id दोबारा आए तो दोबारा क्रेडिट नहीं होगा।
 * पहली बार ₹100+ पर 10% बोनस अपने-आप जुड़ता है।
 */
export async function creditWallet(input: {
  userId: string;
  amountPaise: number;
  paymentId: string;
}): Promise<CreditResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("wallet_credit", {
    p_user: input.userId,
    p_amount: input.amountPaise,
    p_ref: input.paymentId,
    p_bonus_percent: FIRST_TOPUP_BONUS_PERCENT,
    p_bonus_min: FIRST_TOPUP_BONUS_MIN_PAISE,
  });

  if (error) throw error;

  const result = data as { credited?: unknown; balance?: unknown; bonus?: unknown } | null;
  if (
    typeof result?.credited !== "boolean" ||
    typeof result?.balance !== "number" ||
    typeof result?.bonus !== "number"
  ) {
    throw new Error("wallet_credit returned unexpected shape");
  }
  return {
    credited: result.credited,
    balancePaise: result.balance,
    bonusPaise: result.bonus,
  };
}

/** फ़ेल हुए job की वॉलेट कटौती वापस। एक job के लिए सिर्फ़ एक बार। */
export async function refundWalletForJob(jobId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("wallet_refund_job", { p_job: jobId });

  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
