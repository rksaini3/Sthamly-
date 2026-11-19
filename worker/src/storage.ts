// Sthamly AI Worker: Supabase Storage helper (Blueprint 4.0, Phase 1, image)
// Bucket: sthamly-generated (private). Client ko direct access nahi, sirf Worker ke signed link.
// Path har user ke folder mein: <user_id>/<file_id>.<ext>. Dusre user ka path banana possible nahi
// (user_id Worker ke verify kiye hue token se aata hai, client se nahi).
// Upload aur signed link sirf Worker karta hai, service role key se. Key kabhi client tak nahi jaati.

import type { Env } from "./env";
import { ApiError } from "./errors";

const BUCKET = "sthamly-generated";
const UPLOAD_TIMEOUT_MS = 30_000;
const SIGN_TIMEOUT_MS = 8_000;

// Signed link 1 ghante tak chalega (blueprint section 6, generated files).
export const SIGNED_URL_SECONDS = 60 * 60;

// Allowed image types. Dusre types par upload hi nahi hota.
const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Ek image ka maximum size. Gemini ka output isse chhota hi aata hai.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface StoredObject {
  path: string;
  mimeType: string;
  sizeBytes: number;
}

// Object path banata hai. Sirf user_id, file_id aur allowed extension se.
// Kisi bhi aur input (jaise title ya prompt) ko path mein nahi jodte, taaki path traversal na ho.
export function objectPathFor(userId: string, fileId: string, mimeType: string): string {
  const ext = IMAGE_MIME_TO_EXT[mimeType];
  if (!ext) throw new ApiError("invalid_request", "यह फ़ाइल प्रकार सपोर्ट नहीं है।");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(fileId)) {
    throw new ApiError("internal");
  }
  return `${userId.toLowerCase()}/${fileId.toLowerCase()}.${ext}`;
}

// Path ka pehla hissa user ka id hona chahiye. Ye check download aur delete se pehle hota hai.
export function assertPathBelongsTo(path: string, userId: string): void {
  if (!path.startsWith(`${userId.toLowerCase()}/`)) {
    throw new ApiError("invalid_request", "फ़ाइल नहीं मिली।");
  }
}

function baseUrl(env: Env): string {
  return env.SUPABASE_URL.replace(/\/+$/, "");
}

// Storage ka common header: service role key. Ye sirf server par hai.
function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

// Image bytes ko private bucket mein upload karta hai. Existing file ko overwrite nahi karta.
export async function uploadImage(
  env: Env,
  p: { userId: string; fileId: string; mimeType: string; bytes: ArrayBuffer },
): Promise<StoredObject> {
  if (p.bytes.byteLength <= 0 || p.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ApiError("provider_unavailable");
  }

  const path = objectPathFor(p.userId, p.fileId, p.mimeType);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl(env)}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        ...serviceHeaders(env),
        "Content-Type": p.mimeType,
        // false: agar path pehle se ho to overwrite nahi, error aata hai.
        "x-upsert": "false",
        "Cache-Control": "private, max-age=3600",
      },
      body: p.bytes,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("internal");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Raw body log mein nahi (usme path ho sakta hai). Sirf status code.
    console.error(JSON.stringify({ event: "storage_upload_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }

  return { path, mimeType: p.mimeType, sizeBytes: p.bytes.byteLength };
}

// Private file ka signed download link banata hai. 1 ghante mein expire.
export async function signedDownloadUrl(env: Env, path: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl(env)}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        ...serviceHeaders(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("internal");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error(JSON.stringify({ event: "storage_sign_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }

  const body = (await res.json()) as { signedURL?: unknown };
  if (typeof body.signedURL !== "string" || body.signedURL.length === 0) {
    throw new ApiError("internal");
  }

  // Supabase signedURL relative deta hai (/object/sign/...?token=...). Poora URL banate hain.
  return `${baseUrl(env)}/storage/v1${body.signedURL}`;
}

// Object hatata hai. User ke delete request par aur expiry cron par use hota hai.
export async function deleteObject(env: Env, path: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl(env)}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: serviceHeaders(env),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("internal");
  } finally {
    clearTimeout(timer);
  }

  // 404 ka matlab object pehle se nahi hai: ye bhi theek hai.
  if (!res.ok && res.status !== 404) {
    console.error(JSON.stringify({ event: "storage_delete_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("internal");
  }
  await res.body?.cancel().catch(() => undefined);
}