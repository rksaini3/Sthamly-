// Sthamly AI Worker: Groq Whisper speech-to-text (Blueprint 3.0, section 4 aur 7)
// Model: whisper-large-v3-turbo (speed) ya whisper-large-v3 (accuracy). Model registry se aata hai.
// Audio sirf is request ke dauran memory mein rehta hai, kahin store nahi (blueprint 4 aur 9).
// Groq ka raw error body, API key aur audio kabhi log ya client tak nahi jaate.

import type { Env } from "../env";
import { ProviderError } from "./types";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const TIMEOUT_MS = 30_000;

// Allowed audio types. Dusre types par request hi nahi jaati.
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
]);

// Ek turn ka maximum audio. Ye ~60 second hai, push-to-talk ke liye kaafi hai.
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

export interface TranscribeInput {
  audio: ArrayBuffer;
  mimeType: string;
  // Hindi ya Hinglish ke liye hint. Model language detect karta hai, par hint se accuracy badhti hai.
  language?: "hi" | "en";
  signal: AbortSignal;
  model: string;
}

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
}

// Mime type ko file extension se milaate hain, Groq ko filename chahiye.
function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    default:
      return "bin";
  }
}

// Input check: type aur size. Galat input par ProviderError nahi, seedha exception.
export function assertAudioAllowed(mimeType: string, byteLength: number): void {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_MIME.has(base)) {
    throw new AudioInputError("unsupported_audio");
  }
  if (byteLength <= 0 || byteLength > MAX_AUDIO_BYTES) {
    throw new AudioInputError("audio_too_large_or_empty");
  }
}

// Galat audio input ka alag error: ye provider ki galti nahi, user ki hai.
export class AudioInputError extends Error {
  readonly reason: "unsupported_audio" | "audio_too_large_or_empty";

  constructor(reason: "unsupported_audio" | "audio_too_large_or_empty") {
    super(reason);
    this.name = "AudioInputError";
    this.reason = reason;
  }
}

// Audio ko Groq par bhejta hai. Success par text aur duration deta hai.
export async function transcribe(env: Env, input: TranscribeInput): Promise<TranscribeResult> {
  assertAudioAllowed(input.mimeType, input.audio.byteLength);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const signal = AbortSignal.any([input.signal, controller.signal]);

  const form = new FormData();
  const blob = new Blob([input.audio], { type: input.mimeType.split(";")[0] });
  form.append("file", blob, `speech.${extensionFor(input.mimeType)}`);
  form.append("model", input.model);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (input.language) form.append("language", input.language);

  let res: Response;
  try {
    res = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal,
    });
  } catch {
    throw new ProviderError("groq", null, true);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 5xx aur 429 dobara try karne layak. Baaki (galat audio, auth) nahi.
    const retryable = res.status >= 500 || res.status === 429;
    await res.body?.cancel().catch(() => {});
    throw new ProviderError("groq", res.status, retryable);
  }

  let body: { text?: unknown; duration?: unknown };
  try {
    body = (await res.json()) as { text?: unknown; duration?: unknown };
  } catch {
    throw new ProviderError("groq", res.status, true);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const durationSeconds = typeof body.duration === "number" ? body.duration : 0;
  return { text, durationSeconds };
}