// Sthamly AI Worker: tasveer ko dekh kar sawal ka text jawab (Cloudflare Workers AI, vision model).
// Input: tasveer (data URL) + sawal. Output: jawab ka text. Koi API key nahi, sirf binding.
// Raw provider error, sawal aur tasveer ke bytes kabhi log ya client tak nahi jaate.

import type { Env } from "../env";
import { ApiError } from "../errors";
import type { InputImage } from "./gemini-image";

// Cloudflare ka vision model naam, exact.
export const CF_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const AI_TIMEOUT_MS = 90_000;
const MAX_ANSWER_CHARS = 4000;

const SYSTEM_HI =
  "तुम Sthamly AI हो। तस्वीर को ध्यान से देखकर सवाल का जवाब दो। " +
  "जवाब सरल हिंदी या Hinglish में दो। तस्वीर में जो दिख रहा है या लिखा है, वही बताओ, अंदाज़े से कुछ मत जोड़ो। " +
  "अगर कुछ साफ़ न दिखे तो साफ़ लिख दो। जवाब सीधा रखो, ज़रूरत हो तो बिंदुओं में लिखो। " +
  "पूरा खाता नंबर या पूरा ID दोबारा मत लिखो।";

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

// Model ka jawab kai shape mein aa sakta hai, isliye pehla string field uthate hain.
function extractText(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (isRecord(output)) {
    if (typeof output.response === "string") return output.response;
    if (typeof output.result === "string") return output.result;
  }
  return null;
}

// Tasveer + sawal bhejkar text jawab lautata hai.
export async function askImageWithCloudflare(
  env: Env,
  opts: { question: string; image: InputImage },
): Promise<string> {
  const ai = (env as AiEnv).AI;
  if (!ai) throw new ApiError("provider_unavailable");

  const output = await withTimeout(
    ai.run(CF_VISION_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_HI },
        { role: "user", content: opts.question },
      ],
      image: `data:${opts.image.mimeType};base64,${opts.image.base64}`,
    }),
    AI_TIMEOUT_MS,
  );

  const text = (extractText(output) ?? "").trim();
  if (text.length === 0) throw new ApiError("provider_unavailable");
  return Array.from(text).slice(0, MAX_ANSWER_CHARS).join("");
}