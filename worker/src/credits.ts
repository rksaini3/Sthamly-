// Booster kharidne par: credits balance mein jud jaate hain. Kabhi reset nahi hote.
// Ref = Razorpay payment id, isliye same payment dobara aaye to ek hi baar jorte hain.
export async function grantTopupCredits(
  db: SupabaseClient,
  userId: string,
  amount: number,
  ref: string,
): Promise<void> {
  await db.rpc<number>("grant_topup_credits", {
    p_user: userId,
    p_amount: amount,
    p_ref: ref,
  });
}