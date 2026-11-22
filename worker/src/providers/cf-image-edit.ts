// Sthamly AI Worker: Cloudflare Workers AI se tasveer edit (FLUX.2 klein).
// Input: multipart/form-data. Tasveer 'input_image_0' mein, prompt 'prompt' mein.
// Output: base64 image (env.AI.run ka 'image' field). Koi API key nahi, sirf binding.
// Raw provider error, prompt aur image bytes kabhi log ya client tak nahi jaate.
// Multipart: FormData ko Response mein daal kar asli body aur boundary wala content-type lete hain.

import type { Env } from "../env";
import { ApiError } from "../errors";
import type { EditedImage, InputImage } from "./gemini-image";

// Cloudflare ka model naam, exact.
export const CF_EDIT_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const AI_TIMEOUT_MS = 90_000;
const MAX_RESULT_BYTES = 10 * 1024 * 1024;

// Workers AI binding ka structural type. env.ts badalne ki zaroorat nahi.
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
type AiEnv = Env & { AI?: AiBinding };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Output ka type bytes se pehchante hain (PNG ya JPEG ya WEBP).
function sniffMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return "image/png";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError("provider_unavailable")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// FormData ko sahi multipart body mein badalta hai: body stream aur boundary wala content-type.
function buildMultipart(form: FormData): { body: ReadableStream<Uint8Array> | null; contentType: string } {
  const serialized = new Response(form);
  const contentType = serialized.headers.get("content-type");
  if (!contentType || !contentType.startsWith("multipart/form-data")) {
    throw new ApiError("provider_unavailable");
  }
  return { body: serialized.body, contentType };
}

// Tasveer + prompt bhejkar edit ki hui tasveer lautata hai.
export async function editImageWithCloudflare(
  env: Env,
  opts: { prompt: string; image: InputImage },
): Promise<EditedImage> {
  const ai = (env as AiEnv).AI;
  if (!ai) throw new ApiError("provider_unavailable");

  const form = new FormData();
  const inputBytes = base64ToBytes(opts.image.base64);
  form.append(
    "input_image_0",
    new Blob([inputBytes], { type: opts.image.mimeType }),
    "input.png",
  );
  form.append("prompt", opts.prompt);

  const multipart = buildMultipart(form);

  const output = await withTimeout(
    ai.run(CF_EDIT_MODEL, {
      multipart: { body: multipart.body, contentType: multipart.contentType },
    }),
    AI_TIMEOUT_MS,
  );

  if (!isRecord(output) || typeof output.image !== "string" || output.image.length === 0) {
    throw new ApiError("provider_unavailable");
  }

  const bytes = base64ToBytes(output.image.replace(/\s/g, ""));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESULT_BYTES) {
    throw new ApiError("provider_unavailable");
  }

  return {
    bytes: bytes.buffer as ArrayBuffer,
    mimeType: sniffMime(bytes),
    text: null,
  };
}