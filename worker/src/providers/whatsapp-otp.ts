import type { Env } from "../env";
import { ApiError } from "../errors";

const GRAPH_VERSION = "v21.0";

export interface OtpPayloadInput {
  to: string;
  otp: string;
  template: string;
  lang: string;
  copyButton: boolean;
}

/** Meta चाहता है सिर्फ़ अंक, बिना + और स्पेस के। */
export function toMetaRecipient(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Authentication template का payload।
 * body में OTP {{1}} में जाता है।
 * copyButton true हो तो copy-code button का parameter भी जाता है।
 * यह तभी भेजें जब template में सच में copy-code button हो।
 */
export function buildOtpPayload(input: OtpPayloadInput) {
  const components: Array<Record<string, unknown>> = [
    {
      type: "body",
      parameters: [{ type: "text", text: input.otp }],
    },
  ];

  if (input.copyButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: input.otp }],
    });
  }

  return {
    messaging_product: "whatsapp",
    to: toMetaRecipient(input.to),
    type: "template",
    template: {
      name: input.template,
      language: { code: input.lang },
      components,
    },
  };
}

export async function sendWhatsAppOtp(
  env: Env,
  args: { phone: string; otp: string },
): Promise<void> {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const template = env.WHATSAPP_OTP_TEMPLATE;
  const lang = env.WHATSAPP_OTP_LANG || "en";
  const copyButton = env.WHATSAPP_OTP_COPY_BUTTON !== "false";

  const missing: string[] = [];
  if (!token) missing.push("WHATSAPP_TOKEN");
  if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!template) missing.push("WHATSAPP_OTP_TEMPLATE");

  if (missing.length > 0) {
    console.error(JSON.stringify({ event: "whatsapp_config_missing", missing }));
    throw new ApiError("provider_unavailable");
  }

  const body = buildOtpPayload({
    to: args.phone,
    otp: args.otp,
    template: template as string,
    lang,
    copyButton,
  });

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    let metaCode: number | undefined;
    let metaMessage: string | undefined;
    try {
      const data = (await res.json()) as {
        error?: { code?: number; message?: string };
      };
      metaCode = data.error?.code;
      metaMessage = data.error?.message;
    } catch {
      // Meta ने JSON नहीं भेजा, तो सिर्फ़ status लिखेंगे।
    }
    // OTP कभी log में नहीं जाता।
    console.error(
      JSON.stringify({
        event: "whatsapp_otp_failed",
        status: res.status,
        meta_code: metaCode,
        meta_message: metaMessage,
      }),
    );
    throw new ApiError("provider_unavailable");
  }
}