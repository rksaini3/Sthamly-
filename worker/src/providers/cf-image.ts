// Sthamly AI Worker: Cloudflare Workers AI image adapter (background hatana).
// Model: 'bria/remove-background' (Workers AI binding, koi API key nahi).
// Input: data URI (data:image/...;base64,...). Output: model PNG ka https URL deta hai, usko download karke bytes lete hain.
// Raw error, image bytes aur provider ka URL kabhi log ya client tak nahi jaate.

import type { Env } from "../env";
import { ApiError } from "../errors";
import type { EditedImage } from "./gemini-image";

const MODEL = "bria/remove-background";
const AI_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;

// Workers AI binding ka structural type. env.ts badalne ki zaroorat nahi.
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
type AiEnv = Env & { AI?: AiBinding };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

// Model ka output: { image: "https://..." }. Sirf https URL manzoor.
function resultUrl(output: unknown): string {
  if (!isRecord(output) || typeof output.image !== "string") {
    throw new ApiError("provider_unavailable");
  }
  let url: URL;
  try {
    url = new URL(output.image);
  } catch {
    throw new ApiError("provider_unavailable");
  }
  if (url.protocol !== "https:") throw new ApiError("provider_unavailable");
  return url.toString();
}

async function downloadPng(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new ApiError("provider_unavailable");

  const type = res.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("image/")) throw new ApiError("provider_unavailable");

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESULT_BYTES) {
    throw new ApiError("provider_unavailable");
  }
  return bytes;
}

// Tasveer ka background hatata hai. Result PNG hai (transparency ke saath).
export async function removeBackgroundWithCloudflare(
  env: Env,
  dataUri: string,
): Promise<EditedImage> {
  const ai = (env as AiEnv).AI;
  if (!ai) throw new ApiError("provider_unavailable");

  const output = await withTimeout(
    ai.run(MODEL, { image: dataUri, preserve_alpha: true }),
    AI_TIMEOUT_MS,
  );
  const bytes = await downloadPng(resultUrl(output));

  return {
    bytes,
    mimeType: "image/png",
    text: "बैकग्राउंड हटा दिया गया है।",
  };
}

// Prompt mein background hatane ki baat hai? (Hindi ya English dono)
export function isBackgroundRemoval(prompt: string): boolean {
  return /(बैकग्राउंड|background)/i.test(prompt) && /(हटा|remove|delete|clean)/i.test(prompt);
}