// Sthamly AI Worker: WhatsApp par OTP bhejna (Meta WhatsApp Cloud API, authentication template).
// DLT ki zaroorat nahi, kyunki ye SMS nahi hai. Phone number, OTP ya Meta ka raw response kabhi log nahi hota.
// Sirf status aur Meta ka error code log hota hai.

import type { Env } from "../env";
import { ApiError } from "../errors";

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 15_000;
const LOG_MESSAGE_CHARS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Meta ke error body se sirf code aur chhota message nikalta hai.
async function metaErrorInfo(res: Response): Promise<{ code: unknown; message: string | null }> {
  try {
    const parsed: unknown = JSON.parse(await res.text());
    const err = isRecord(parsed) ? parsed.error : undefined;
    if (isRecord(err)) {
      const message = typeof err.message === "string" ? err.message.slice(0, LOG_MESSAGE_CHARS) : null;
      return { code: err.code ?? null, message };
    }
  } catch {
    // body JSON nahi tha: sirf status log hoga
  }
  return { code: null, message: null };
}

export async function sendWhatsAppOtp(
  env: Env,
  input: { phone: string; otp: string },
): Promise<void> {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const template = env.WHATSAPP_OTP_TEMPLATE;
  const lang = env.WHATSAPP_OTP_LANG ?? "en";

  if (!token || !phoneNumberId || !template) {
    console.error(JSON.stringify({ event: "whatsapp_config_missing" }));
    throw new ApiError("provider_unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.phone,
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
      signal: controller.signal,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "whatsapp_otp_network_failed",
        error_name: err instanceof Error ? err.name : "unknown",
      }),
    );
    throw new ApiError("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const meta = await metaErrorInfo(res);
    console.error(
      JSON.stringify({
        event: "whatsapp_otp_failed",
        status: res.status,
        meta_code: meta.code,
        meta_message: meta.message,
      }),
    );
    throw new ApiError("provider_unavailable");
  }

  // Jawab ki zaroorat nahi, sirf safal hona kaafi hai.
  await res.body?.cancel().catch(() => undefined);
}