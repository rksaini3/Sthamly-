// Sthamly AI Worker: image provider, Cloudflare Workers AI (FLUX.1 schnell).
// Koi alag API key nahi. Worker ke wrangler.toml mein [ai] binding = "AI" hona zaroori hai.
// Model Workers AI se base64 image deta hai, use decode karke bytes wapas dete hain.
// Prompt, raw response aur koi bhi secret log ya client tak nahi jaate.
// Koi bhi failure ApiError('provider_unavailable') banta hai, taaki user ko saaf message mile.

import type { Env } from "../env";
import { ApiError } from "../errors";

// Workers AI ka FLUX model. Source: Cloudflare Workers AI model catalog.
const WORKERS_AI_MODEL = "@cf/black-forest-labs/flux-1-schnell";
// Schnell model ke liye chhote steps kaafi hain: kam time, kam kharcha.
const IMAGE_STEPS = 4;
// Image banane mein time lagta hai, isliye lamba timeout.
const IMAGE_TIMEOUT_MS = 60_000;
// Output ka upper limit, taaki koi bahut badi file memory na bhar de.
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

// Prompt ki limit. Bahut lamba prompt kharcha badhata hai aur abuse ka rasta hai.
export const MAX_IMAGE_PROMPT_CHARS = 1000;

export interface GeneratedImage {
  bytes: ArrayBuffer;
  mimeType: string;
  // Workers AI se tokens nahi aate, isliye 0.
  inputTokens: number;
  outputTokens: number;
}

// Workers AI binding ka structural type. Isse env.ts badalne ki zaroorat nahi.
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

type AiEnv = Env & { AI?: AiBinding };

// FLUX schnell ka response: image base64 string mein.
interface FluxResponse {
  image?: unknown;
}

// Prompt ko saaf karta hai: khaali nahi, limit ke andar, aur control characters nahi.
export function cleanImagePrompt(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (cleaned.length === 0) {
    throw new ApiError("invalid_request", "तस्वीर के लिए कुछ लिखें।");
  }
  if (Array.from(cleaned).length > MAX_IMAGE_PROMPT_CHARS) {
    throw new ApiError(
      "invalid_request",
      `तस्वीर का विवरण ${MAX_IMAGE_PROMPT_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`,
    );
  }
  return cleaned;
}

// Bytes ke shuru (magic bytes) se image type pehchanta hai. Pehchan na ho to null.
function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// base64 (data: prefix ke saath ya bina) ko bytes mein badalta hai.
function decodeBase64Image(input: string): Uint8Array {
  const commaIndex = input.indexOf(",");
  const payload = input.startsWith("data:") && commaIndex !== -1 ? input.slice(commaIndex + 1) : input;
  const binary = atob(payload.replace(/\s/g, ""));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Promise ko timeout aur abort signal ke saath chalata hai.
// Timer ko finally mein clear karte hain, taaki koi timer lataka na rahe.
function withTimeout<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  return Promise.race([work, timeout, aborted]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// Workers AI se image banwati hai. Ek hi image wapas aati hai.
// opts.model yahan use nahi hota: model fixed hai (WORKERS_AI_MODEL).
export async function generateImage(
  env: Env,
  opts: { model: string; prompt: string; signal: AbortSignal },
): Promise<GeneratedImage> {
  const ai = (env as AiEnv).AI;
  if (!ai) {
    // AI binding nahi hai: image band, chat par koi asar nahi.
    throw new ApiError("provider_unavailable");
  }

  let result: unknown;
  try {
    result = await withTimeout(
      ai.run(WORKERS_AI_MODEL, { prompt: opts.prompt, steps: IMAGE_STEPS }),
      IMAGE_TIMEOUT_MS,
      opts.signal,
    );
  } catch {
    throw new ApiError("provider_unavailable");
  }

  const encoded = (result as FluxResponse | null | undefined)?.image;
  if (typeof encoded !== "string" || encoded.length === 0) {
    // Output mein image nahi aayi: user ko clean message, retry ke liye prompt badalna hoga.
    throw new ApiError(
      "invalid_request",
      "तस्वीर नहीं बन सकी। कृपया विवरण बदलकर दोबारा कोशिश करें।",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Image(encoded);
  } catch {
    throw new ApiError("provider_unavailable");
  }

  if (bytes.length === 0 || bytes.length > MAX_OUTPUT_BYTES) {
    throw new ApiError("provider_unavailable");
  }

  const mimeType = detectImageMime(bytes);
  if (!mimeType) {
    throw new ApiError("provider_unavailable");
  }

  return {
    bytes: bytes.buffer as ArrayBuffer,
    mimeType,
    inputTokens: 0,
    outputTokens: 0,
  };
}