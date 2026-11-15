const FLOW_URL = "https://control.msg91.com/api/v5/flow";

/**
 * MSG91 के DLT-approved template से OTP भेजें।
 * OTP का मान कभी log न करें।
 */
export async function sendOtpViaMsg91(input: { phone: string; otp: string }): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  // Template में जो variable का नाम है (डिफ़ॉल्ट "otp")
  const varName = process.env.MSG91_OTP_VAR ?? "otp";
  if (!authKey || !templateId) throw new Error("MSG91 env सेट नहीं है");

  // Supabase "+919876543210" देता है, MSG91 को "+" के बिना चाहिए
  const mobiles = input.phone.replace(/^\+/, "");

  const res = await fetch(FLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      recipients: [{ mobiles, [varName]: input.otp }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`MSG91 HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { type?: string } | null;
  if (data?.type === "error") throw new Error("MSG91 ने error लौटाया");
}