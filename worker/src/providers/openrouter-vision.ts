// Sthamly AI Worker: tasveer dekh kar sawal ka text jawab (OpenRouter, free vision models).
// Input: tasveer (data URL) + sawal. Output: jawab ka text aur kaun sa model chala.
// Sirf ":free" models hain, taaki koi paid model apne aap na chale.
// Ek model fail ho (rate limit, band, ya image support nahi) to agla model try hota hai.
// Key: OPENROUTER_API_KEY (wrangler secret). Raw provider error, prompt aur image kabhi log ya client tak nahi jaate.

import type { Env } from "../env";
import { ApiError } from "../errors";
import type { InputImage } from "./gemini-image";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SITE_TITLE = "Sthamly AI";

// Free vision models, pehla sabse pasand. Sirf :free IDs.
// Free models badalte rahte hain, isliye OpenRouter ki free list se time-time par check karein.
export const OPENROUTER_VISION_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
] as const;

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TOKENS = 800;
const MAX_ANSWER_CHARS = 4000;

const SYSTEM_HI =
  "तुम Sthamly AI हो। तस्वीर को ध्यान से देखकर सवाल का जवाब दो। " +
  "जवाब सरल हिंदी या Hinglish में दो। तस्वीर में जो दिख रहा है या लिखा है, वही बताओ, अंदाज़े से कुछ मत जोड़ो। " +
  "अगर कुछ साफ़ न दिखे तो साफ़ लिख दो। जवाब सीधा रखो, ज़रूरत हो तो बिंदुओं में लिखो। " +
  "पूरा खाता नंबर या पूरा ID दोबारा मत लिखो।";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// OpenAI-जैसे जवाब से पहला text निकालता है। Shape galat हो तो null.
function extractText(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) return null;
  const first: unknown = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  const content = first.message.content;
  if (typeof content !== "string") return null;
  const text = content.trim();
  return text.length > 0 ? text : null;
}

// Log mein sirf model naam और status. Prompt, image या raw body kabhi nahi.
function logModelFailure(model: string, status: number | null): void {
  console.warn(JSON.stringify({ event: "openrouter_model_failed", model, status }));
}

// Ek model ko call karta hai. Safal ho to text, warna null (agle model par jaayega).
async function askOneModel(
  apiKey: string,
  model: string,
  question: string,
  image: InputImage,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": SITE_TITLE,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_HI },
          {
            role: "user",
            content: [
              { type: "text", text: question },
              {
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
              },
            ],
          },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      logModelFailure(model, res.status);
      return null;
    }

    const text = extractText(await res.json());
    if (text === null) {
      logModelFailure(model, res.status);
      return null;
    }
    return text;
  } catch {
    // Network ya timeout: raw error log nahi karte, sirf model naam.
    logModelFailure(model, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tasveer + sawal bhejkar text jawab lautata hai. Sabhi models fail hon to saaf error.
export async function askImageWithOpenRouter(
  env: Env,
  opts: { question: string; image: InputImage },
): Promise<{ text: string; model: string }> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ event: "openrouter_key_missing" }));
    throw new ApiError(
      "provider_unavailable",
      "अभी तस्वीर समझने वाली सेवा उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
    );
  }

  for (const model of OPENROUTER_VISION_MODELS) {
    const answer = await askOneModel(apiKey, model, opts.question, opts.image);
    if (answer !== null) {
      return { text: Array.from(answer).slice(0, MAX_ANSWER_CHARS).join(""), model };
    }
  }

  throw new ApiError(
    "provider_unavailable",
    "अभी तस्वीर समझने वाली सेवा उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
  );
}