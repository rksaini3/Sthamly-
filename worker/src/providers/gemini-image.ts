// Sthamly AI Worker: Gemini image edit adapter (Interactions API).
// Ek tasveer + ek prompt bhejte hain (jaise "background hatao" ya "sky ko sunehra karo"),
// aur badli hui tasveer wapas aati hai. Koi SDK nahi, sirf REST.
// API key header mein jaati hai (URL mein nahi). Raw response, error body, prompt aur image bytes kabhi log nahi hote.
// Jawab mein image nahi mili to ProviderError('gemini') banta hai, taaki user ko saaf message mile.

import type { Env } from "../env";
import { ProviderError } from "./types";

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const EDIT_TIMEOUT_MS = 90_000;
// Output tasveer ka upper limit, taaki koi bahut badi response memory na bhar de.
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

const ALLOWED_OUTPUT_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
type OutputMime = (typeof ALLOWED_OUTPUT_MIME)[number];

export interface InputImage {
  // Sirf "image/jpeg", "image/png" ya "image/webp".
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  // Base64 bytes, bina "data:" prefix ke.
  base64: string;
}

export interface EditedImage {
  bytes: ArrayBuffer;
  mimeType: OutputMime;
  // Model ka chhota text (agar koi ho). Client ko dikhane ke liye.
  text: string | null;
}

interface EditOptions {
  model: string;
  prompt: string;
  image: InputImage;
  signal: AbortSignal;
}

// Unknown JSON ko object ki tarah padhne ke liye chhota helper.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOutputMime(value: unknown): OutputMime | null {
  if (typeof value !== "string") return null;
  return (ALLOWED_OUTPUT_MIME as readonly string[]).includes(value) ? (value as OutputMime) : null;
}

// Response: steps[] -> type 'model_output' -> content[] -> 'image' (data = base64) aur 'text' (text).
// Pura structure fix nahi maante: jo milega wahi uthate hain, baaki ignore.
function parseEdited(body: unknown): EditedImage {
  if (!isRecord(body) || !Array.isArray(body.steps)) {
    throw new ProviderError("gemini", null, false);
  }

  let imageData: string | null = null;
  let imageMime: OutputMime | null = null;
  const texts: string[] = [];

  for (const step of body.steps) {
    if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const block of step.content) {
      if (!isRecord(block)) continue;
      if (block.type === "image" && typeof block.data === "string") {
        imageData = block.data;
        imageMime = asOutputMime(block.mime_type) ?? "image/png";
      } else if (block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
        texts.push(block.text.trim());
      }
    }
  }

  if (imageData === null || imageMime === null) {
    throw new ProviderError("gemini", null, false);
  }

  const bytes = decodeBase64(imageData);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new ProviderError("gemini", null, false);
  }

  return {
    bytes,
    mimeType: imageMime,
    text: texts.length > 0 ? texts.join("\n") : null,
  };
}

function decodeBase64(payload: string): ArrayBuffer {
  let binary: string;
  try {
    binary = atob(payload.replace(/\s/g, ""));
  } catch {
    throw new ProviderError("gemini", null, false);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Ek tasveer ko prompt ke hisaab se badalta hai. Chhote, saaf jawab: bytes + mime + text.
export async function editImageWithGemini(env: Env, opts: EditOptions): Promise<EditedImage> {
  const connectController = new AbortController();
  const timer = setTimeout(() => connectController.abort(), EDIT_TIMEOUT_MS);
  const signal = AbortSignal.any([opts.signal, connectController.signal]);

  let res: Response;
  try {
    res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        input: [
          { type: "text", text: opts.prompt },
          { type: "image", mime_type: opts.image.mimeType, data: opts.image.base64 },
        ],
      }),
      signal,
    });
  } catch {
    throw new ProviderError("gemini", null, true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429;
    await res.body?.cancel().catch(() => {});
    throw new ProviderError("gemini", res.status, retryable);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError("gemini", res.status, false);
  }

  return parseEdited(body);
}