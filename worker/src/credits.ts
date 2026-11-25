// Sthamly AI Worker: credits (ek currency: chat, tasveer, aur aage ke sab features).
// Balance aur badlav database ke functions se hote hain (migration 0003_credits.sql).
// Pehle check (assertCredits), kaam successful hone par kharch (spendCredits).
// Charge ref unique hota hai (request id), isliye retry se double charge nahi hota.

import { ApiError } from "./errors";
import type { SupabaseClient } from "./supabase";

// Ek cheez ki kimat credits mein. Ye Sthamly ki price table se match karti hain.
export const CREDITS_CHAT = 1;
export const CREDITS_IMAGE = 10;
// Naye user ko ek hi baar, sirf trial ke liye.
export const TRIAL_CREDITS = 40;

export interface Balance {
  plan: number;
  topup: number;
  total: number;
}

interface WalletRow {
  plan_balance: number;
  topup_balance: number;
}

interface SpendRow {
  ok: boolean;
  plan_left: number;
  topup_left: number;
}

// Balance padhta hai. Wallet na ho to null.
export async function getBalance(db: SupabaseClient, userId: string): Promise<Balance | null> {
  const rows = await db.select<WalletRow>(
    "credit_wallets",
    `user_id=eq.${userId}&select=plan_balance,topup_balance`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    plan: row.plan_balance,
    topup: row.topup_balance,
    total: row.plan_balance + row.topup_balance,
  };
}

// Pehli baar wallet banata hai, trial credits ke saath. Ek user ke liye ek hi baar (ref fixed hai).
export async function ensureWallet(db: SupabaseClient, userId: string): Promise<void> {
  const existing = await getBalance(db, userId);
  if (existing !== null) return;
  await db.rpc<number>("grant_plan_credits", {
    p_user: userId,
    p_amount: TRIAL_CREDITS,
    p_ref: `trial:${userId}`,
  });
}

// Kaam shuru karne se pehle: kaafi credits hain ya nahi. Nahi to 'credits_exhausted'.
export async function assertCredits(
  db: SupabaseClient,
  userId: string,
  needed: number,
): Promise<void> {
  await ensureWallet(db, userId);
  const balance = await getBalance(db, userId);
  if (balance === null || balance.total < needed) {
    throw new ApiError("credits_exhausted");
  }
}

// Kaam successful hone par kharch. Same ref dobara aaye to kuch nahi katta.
// Return: true agar kharch hua (ya pehle hi ho chuka tha), false agar balance kam nikla.
export async function spendCredits(
  db: SupabaseClient,
  userId: string,
  amount: number,
  ref: string,
): Promise<boolean> {
  const result = await db.rpc<SpendRow[] | SpendRow>("spend_credits", {
    p_user: userId,
    p_amount: amount,
    p_ref: ref,
  });
  const row = Array.isArray(result) ? result[0] : result;
  return row?.ok === true;
}