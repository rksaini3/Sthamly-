// Sthamly AI Worker: POST /api/document-chat/ask (chat mein PDF bhejo, sawal ya summary lo)
// Sirf login user. Body: { pdf: "data:application/pdf;base64,...", prompt: string }.
// Order: login -> body check -> prompt check -> daily limit (KV) -> budget -> PDF text (Cloudflare) -> jawab (Groq) -> usage -> text.
// Nakaam hone par slot wapas aata hai. Raw provider error, prompt aur PDF bytes kabhi log ya client tak nahi jaate.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext } from "../plan";
import { pdfToText } from "../providers/cf-document";
import { askGroqText } from "../providers/groq-text";
import { cleanImagePrompt } from "../providers/image";
import { ProviderError } from "../providers/types";
import { createSupabase, type SupabaseClient } from "../supabase";

const ROUTE = "/api/document-chat/ask";
// Groq text model (PDF ke text par jawab). Groq ki list mein model naam badle to yahin badlein.
const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
// Model ko bheja jaane wala PDF text ka upper limit (characters).
const PDF_TEXT_CHARS = 24000;
// PDF ka kharcha rupees mein (estimate). Verify karke update karein.
const DOCUMENT_COST_INR_ESTIMATE = 1.0;
const DOCUMENT_FEATURE = "document";
// Ek user ke liye din mein kitne PDF sawal. KV par count (approximate).
const DAILY_LIMIT = 10;
const SLOT_TTL_SECONDS = 2 * 24 * 60 * 60;
const SLOT_PREFIX = "docq";
const MAX_BODY_BYTES = 14 * 1024 * 1024;
// PDF ki upper limit (apni taraf se), taaki cost aur memory kaabu mein rahe.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// data:application/pdf;base64,...
const PDF_DATA_URI_RE = /^data:application\/pdf;base64,([A-Za-z0-9+/]+=*)$/;

interface ParsedBody {
  pdfBase64: string;
  prompt: string;
}

function invalid(message?: string): ApiError {
  return new ApiError("invalid_request", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotKey(userId: string): string {
  return `${SLOT_PREFIX}:${userId}:${utcDay()}`;
}

async function readBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("PDF बहुत बड़ी है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || typeof parsed.pdf !== "string" || typeof parsed.prompt !== "string") {
    throw invalid();
  }

  const match = PDF_DATA_URI_RE.exec(parsed.pdf);
  if (!match || !match[1]) throw invalid("सिर्फ़ PDF फ़ाइल चल सकती है।");

  const decodedBytes = Math.floor((match[1].length * 3) / 4);
  if (decodedBytes > MAX_PDF_BYTES) throw invalid("PDF बहुत बड़ी है। छोटी PDF चुनें।");

  return { pdfBase64: match[1], prompt: parsed.prompt };
}

async function takeSlot(env: Env, userId: string): Promise<void> {
  const key = slotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current >= DAILY_LIMIT) {
    throw new ApiError(
      "rate_limited",
      "आज PDF के सवालों की सीमा पूरी हो गई। कल फिर कोशिश करें।",
    );
  }
  await env.STATE.put(key, String(current + 1), { expirationTtl: SLOT_TTL_SECONDS });
}

async function releaseSlot(env: Env, userId: string): Promise<void> {
  const key = slotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current > 0) {
    await env.STATE.put(key, String(current - 1), { expirationTtl: SLOT_TTL_SECONDS });
  }
}

async function recordUsage(db: SupabaseClient, userId: string, requestId: string): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: userId,
      request_id: requestId,
      feature: DOCUMENT_FEATURE,
      provider: "groq",
      model: GROQ_TEXT_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_inr: Number(DOCUMENT_COST_INR_ESTIMATE.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

export async function handleDocumentChat(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    // Login zaroori. Guest ko PDF nahi milta.
    const user = await authenticate(request, env);

    const { pathname } = new URL(request.url);
    if (pathname !== ROUTE || request.method !== "POST") throw invalid();

    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    const body = await readBody(request);
    const prompt = cleanImagePrompt(body.prompt);

    await takeSlot(env, user.id);

    try {
      await assertBudget(env, db, config, {
        feature: DOCUMENT_FEATURE,
        isFreePlan: ctx.plan.plan === "free",
      });

      // Step 1: PDF se text (Cloudflare Workers AI, free). Step 2: text par jawab (Groq, free).
      const pdfText = await pdfToText(env, body.pdfBase64);
      const clipped = Array.from(pdfText).slice(0, PDF_TEXT_CHARS).join("");

      const text = await askGroqText(env, {
        model: GROQ_TEXT_MODEL,
        system:
          "तुम एक सहायक हो। नीचे दिए PDF के text के आधार पर ही जवाब दो। जवाब सरल हिंदी या Hinglish में दो। " +
          "अगर जवाब PDF में नहीं है तो साफ़ लिख दो।",
        user: `${prompt}\n\n--- PDF का text ---\n${clipped}`,
        maxTokens: 2048,
        // Client ne request band ki (Stop) to model ka call bhi band ho.
        signal: request.signal,
      });

      execCtx.waitUntil(
        recordUsage(db, user.id, `${user.id}:doc:${traceId}`).catch(() => {
          console.error(JSON.stringify({ event: "doc_usage_write_failed", request_id: traceId }));
        }),
      );

      return json({ text, request_id: traceId });
    } catch (err) {
      await releaseSlot(env, user.id);
      if (err instanceof ProviderError) throw new ApiError("provider_unavailable");
      throw err;
    }
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "document_chat_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}