import { sendOtpViaMsg91 } from "@/lib/sms/msg91";
import { sendOtpViaWhatsApp } from "@/lib/sms/whatsapp";

/**
 * OTP किस रास्ते से जाए:
 * - OTP_CHANNEL=whatsapp → WhatsApp (DLT की ज़रूरत नहीं)
 * - बाकी सब (या खाली) → MSG91 SMS (DLT ज़रूरी)
 * OTP का मान कभी log न करें।
 */
export async function sendOtp(input: { phone: string; otp: string }): Promise<void> {
  const channel = process.env.OTP_CHANNEL?.trim().toLowerCase();
  if (channel === "whatsapp") {
    return sendOtpViaWhatsApp(input);
  }
  return sendOtpViaMsg91(input);
}
