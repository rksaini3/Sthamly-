// Sthamly AI Worker: PDF ko text (markdown) mein badalna, Cloudflare Workers AI se (env.AI.toMarkdown).
// Koi API key nahi, sirf binding. Scanned PDF (jisme text na ho) par result khaali ho sakta hai.
// PDF bytes aur extracted text kabhi log nahi hote.

import type { Env } from "../env";
import { ApiError } from "../errors";

interface MarkdownResult {
  format?: string;
  data?: string;
}

interface AiMarkdownBinding {
  toMarkdown(
    files: { name: string; blob: Blob },
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}
type AiEnv = Env & { AI?: AiMarkdownBinding };

const CONVERT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function pdfToText(env: Env, pdfBase64: string): Promise<string> {
  const ai = (env as AiEnv).AI;
  if (!ai) throw new ApiError("provider_unavailable");

  const blob = new Blob([base64ToBytes(pdfBase64)], { type: "application/pdf" });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError("provider_unavailable")), CONVERT_TIMEOUT_MS);
  });

  let output: unknown;
  try {
    output = await Promise.race([ai.toMarkdown({ name: "document.pdf", blob }), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (!isRecord(output)) throw new ApiError("provider_unavailable");
  const result = output as MarkdownResult;
  if (result.format === "error" || typeof result.data !== "string") {
    throw new ApiError("provider_unavailable", "PDF से text नहीं निकल सका। क्या यह स्कैन की हुई PDF है?");
  }
  const text = result.data.trim();
  if (text.length === 0) {
    throw new ApiError("provider_unavailable", "PDF में पढ़ने लायक text नहीं मिला।");
  }
  return text;
}