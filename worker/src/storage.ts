// Sthamly AI Worker: Supabase Storage helper (Blueprint 4.0, ek creation flow)
// Bucket: outputs (private, supabase/migrations/0006 aur 0007 se bana). Client ko direct access nahi, sirf Worker ka signed link (1 ghanta).
// Path: <user_id>/<file_id>.<ext>. user_id Worker ke verify kiye token se aata hai, client se nahi.
// Upload, signed link aur delete sirf Worker karta hai (service role key se). Key kabhi client tak nahi.

import type { Env } from "./env";
import { ApiError } from "./errors";

// Migration 0006 se bana 'outputs' bucket. Pehle "sthamly-generated" tha, jo kisi migration mein nahi bana.
const BUCKET = "outputs";
const UPLOAD_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 8_000;

export const SIGNED_URL_SECONDS = 60 * 60;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Slides ki HTML mein images base64 ke roop mein hoti hain (lagbhag 33% bada), isliye text files ki limit alag.
// Bucket ki limit 16 MB hai (migration 0007), usse neeche rakho.
export const MAX_TEXT_FILE_BYTES = 15 * 1024 * 1024;

// Allowed types. Dusre types par upload hi nahi hota.
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/html": "html",
  "text/markdown": "md",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoredObject {
  path: string;
  mimeType: string;
  sizeBytes: number;
}

// Object path: sirf user_id, file_id aur allowed extension se. User ka text kabhi path mein nahi jaata.
export function objectPathFor(userId: string, fileId: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType];
  if (ext === undefined) throw new ApiError("internal");
  if (!UUID_RE.test(userId) || !UUID_RE.test(fileId)) throw new ApiError("internal");
  return `${userId.toLowerCase()}/${fileId.toLowerCase()}.${ext}`;
}

// Download aur delete se pehle: path is user ka hi hona chahiye.
export function assertPathBelongsTo(path: string, userId: string): void {
  if (!path.startsWith(`${userId.toLowerCase()}/`)) {
    throw new ApiError("invalid_request", "फ़ाइल नहीं मिली।");
  }
}

// Text ko bytes mein (HTML aur Markdown ke liye).
export function textBytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer;
}

function baseUrl(env: Env): string {
  return env.SUPABASE_URL.replace(/\/+$/, "");
}

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

// Timeout wala fetch. Network error par 'internal', raw error kabhi bahar nahi.
async function storageFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError("internal");
  } finally {
    clearTimeout(timer);
  }
}

// Bytes ko private bucket mein upload karta hai. Existing file overwrite nahi hoti.
export async function uploadObject(
  env: Env,
  p: { userId: string; fileId: string; mimeType: string; bytes: ArrayBuffer },
): Promise<StoredObject> {
  const limit = p.mimeType.startsWith("text/") ? MAX_TEXT_FILE_BYTES : MAX_FILE_BYTES;
  if (p.bytes.byteLength <= 0 || p.bytes.byteLength > limit) {
    throw new ApiError("provider_unavailable");
  }

  const path = objectPathFor(p.userId, p.fileId, p.mimeType);
  const res = await storageFetch(
    `${baseUrl(env)}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(env),
        "Content-Type": p.mimeType,
        "x-upsert": "false",
        "Cache-Control": "private, max-age=3600",
      },
      body: p.bytes,
    },
    UPLOAD_TIMEOUT_MS,
  );

  if (!res.ok) {
    console.error(JSON.stringify({ event: "storage_upload_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }

  return { path, mimeType: p.mimeType, sizeBytes: p.bytes.byteLength };
}

// Private file ka signed download link. 1 ghante mein expire.
export async function signedDownloadUrl(env: Env, path: string): Promise<string> {
  const res = await storageFetch(
    `${baseUrl(env)}/storage/v1/object/sign/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: { ...serviceHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
    },
    CALL_TIMEOUT_MS,
  );

  if (!res.ok) {
    console.error(JSON.stringify({ event: "storage_sign_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }

  const body = (await res.json()) as { signedURL?: unknown };
  if (typeof body.signedURL !== "string" || body.signedURL.length === 0) {
    throw new ApiError("internal");
  }

  // Supabase relative URL deta hai, isliye poora URL banate hain.
  return `${baseUrl(env)}/storage/v1${body.signedURL}`;
}

// Object hatata hai. 404 ka matlab pehle se nahi hai: theek hai.
export async function deleteObject(env: Env, path: string): Promise<void> {
  const res = await storageFetch(
    `${baseUrl(env)}/storage/v1/object/${BUCKET}/${path}`,
    { method: "DELETE", headers: serviceHeaders(env) },
    CALL_TIMEOUT_MS,
  );

  if (!res.ok && res.status !== 404) {
    console.error(JSON.stringify({ event: "storage_delete_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }
  await res.body?.cancel().catch(() => undefined);
}