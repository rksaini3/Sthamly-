// WhatsApp Cloud API (Meta) से OTP भेजें।
// Env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (पहले से Vercel में हैं),
//      WHATSAPP_OTP_TEMPLATE (Meta से approved Authentication template का नाम),
//      WHATSAPP_OTP_LANG (template की भाषा, डिफ़ॉल्ट "en")।
// DLT की ज़रूरत नहीं, पर template Meta से approved होना चाहिए।

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 10_000;

export async function sendOtpViaWhatsApp(input: { phone: string; otp: string }): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const template = process.env.WHATSAPP_OTP_TEMPLATE?.trim();
  const lang = process.env.WHATSAPP_OTP_LANG?.trim() || "en";
  if (!token || !phoneNumberId || !template) {
    throw new Error("WhatsApp env सेट नहीं है (ACCESS_TOKEN, PHONE_NUMBER_ID, OTP_TEMPLATE)");
  }

  // Meta को "+" के बिना नंबर चाहिए
  const to = input.phone.replace(/^\+/, "");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: input.otp }],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // जवाब में OTP नहीं होता, सिर्फ़ गड़बड़ी का कारण लॉग करें
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
}
