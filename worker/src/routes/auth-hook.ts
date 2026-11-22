// Sthamly AI Worker: Supabase "Send SMS" hook (POST /api/auth/sms-hook).
// Supabase OTP yahan bhejta hai, aur hum use WhatsApp par bhejte hain.
// Ye Supabase ke server se aata hai, browser se nahi, isliye ismein CORS nahi hai.
// Standard Webhooks signature zaroor check hota hai. Bina sahi signature ke koi OTP nahi bhejta.
// OTP, phone number ya raw error kabhi log nahi hota.

import type { Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { sendWhatsAppOtp } from "../providers/whatsapp-otp";

const TOLERANCE_SECONDS = 300;
const MAX_BODY_BYTES = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Supabase ka secret "v1,whsec_<base64>" jaisa hota hai. Sirf base64 wala hissa HMAC key banta hai.
async function hookKey(secret: string): Promise<CryptoKey> {
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

// webhook-id.webhook-timestamp.body ka HMAC-SHA256 check karta hai, timestamp ki window ke saath.
async function verifySignature(request: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signatureHeader = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const sent = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > TOLERANCE_SECONDS) return false;

  const key = await hookKey(secret);
  const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);

  for (const part of signatureHeader.split(" ")) {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature) continue;
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64ToBytes(signature);
    } catch {
      continue;
    }
    if (await crypto.subtle.verify("HMAC", key, sigBytes, data)) return true;
  }
  return false;
}

// Payload: { user: { phone }, sms: { otp } }. Phone se sirf digits lete hain.
function readHookPayload(raw: string): { phone: string; otp: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("invalid_request");
  }
  const user = isRecord(parsed) ? parsed.user : undefined;
  const sms = isRecord(parsed) ? parsed.sms : undefined;
  const phone = isRecord(user) && typeof user.phone === "string" ? user.phone.replace(/\D/g, "") : "";
  const otp = isRecord(sms) && typeof sms.otp === "string" ? sms.otp : "";

  if (!/^\d{8,15}$/.test(phone) || !/^\d{4,8}$/.test(otp)) {
    throw new ApiError("invalid_request");
  }
  return { phone, otp };
}

export async function handleAuthHook(request: Request, env: Env): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    if (request.method !== "POST") throw new ApiError("invalid_request");

    const secret = env.SUPABASE_AUTH_HOOK_SECRET;
    if (!secret) {
      console.error(JSON.stringify({ event: "auth_hook_secret_missing", request_id: traceId }));
      throw new ApiError("internal");
    }

    const declared = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new ApiError("invalid_request");

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      throw new ApiError("invalid_request");
    }

    if (!(await verifySignature(request, raw, secret))) {
      console.error(JSON.stringify({ event: "auth_hook_bad_signature", request_id: traceId }));
      return new Response(JSON.stringify({ error: { message: "signature galat hai" } }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const { phone, otp } = readHookPayload(raw);
    await sendWhatsAppOtp(env, { phone, otp });

    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "auth_hook_failed",
        code: err instanceof ApiError ? err.code : "internal",
        request_id: traceId,
      }),
    );
    return toErrorResponse(err, traceId);
  }
}