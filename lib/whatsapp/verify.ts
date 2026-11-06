import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Meta का X-Hub-Signature-256 header verify करें।
 * rawBody: request का कच्चा text (JSON.parse से पहले का)।
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const { WHATSAPP_APP_SECRET } = getServerEnv();
  const expected = createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}