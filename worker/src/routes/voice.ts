// Sthamly AI Worker: voice routes (Blueprint 3.0, section 4 aur 6 "Voice")
// POST /api/voice/session           Live session: daily time reserve, single-use token
// POST /api/voice/session/:id/end   session band. Asli time SERVER tay karta hai, client ka bheja time nahi
// POST /api/voice/turn              push-to-talk: audio in, transcript out
// Push-to-talk ka reply /api/ai/chat par jaata hai, taaki ek hi pipeline rahe (quota, budget, history, usage).
// Audio kahin store nahi hota. Transcript bhi kabhi log nahi hota.
// TTS (reply ki awaz) is file mein nahi hai: Hindi ke liye Gemini TTS ya Android on-device voice, baad mein.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { ProviderError } from "../providers/types";
import { AudioInputError, MAX_AUDIO_BYTES, transcribe } from "../providers/whisper";
import { createSupabase, type SupabaseClient } from "../supabase";
import { issueLiveToken } from "../voice/live-token";

// Groq Whisper turbo. Speed ke liye. Accuracy ke liye whisper-large-v3 (blueprint 7).
const WHISPER_MODEL = "whisper-large-v3-turbo";
// Whisper ki keemat per ghanta (USD). VERIFY vendor pricing se pehle.
const WHISPER_USD_PER_HOUR = 0.04;
// Chat route ke saath same. Baad mein config mein ek hi jagah se aayega.
const USD_TO_INR = 85;

const MAX_CONTROL_BODY_BYTES = 1024;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const SESSION_END_RE =
  /^\/api\/voice\/session\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/end$/i;

interface VoiceSessionRow {
  id: string;
  status: "open" | "ended" | "expired" | "failed";
  max_seconds: number;
  seconds: number;
  started_at: string;
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

// Body optional hai (session start bina body ke bhi ho sakta hai). Khaali ho to {}.
async function readControlBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  if (new TextEncoder().encode(raw).byteLength > MAX_CONTROL_BODY_BYTES) {
    throw invalid("अनुरोध बहुत बड़ा है।");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed)) throw invalid();
  return parsed;
}

// requested_seconds: null ya gayab ho to server poori limit deta hai. Galat value par invalid.
function parseRequestedSeconds(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalid();
  }
  return Math.floor(value);
}

// Whisper ko language ka hint. Hinglish ke liye hint nahi, model khud decide karega.
function readLanguageHint(request: Request): "hi" | "en" | undefined {
  const raw = request.headers.get("X-Language");
  if (raw === "hi" || raw === "en") return raw;
  return undefined;
}

function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null) return null;
  if (!IDEMPOTENCY_RE.test(raw)) throw invalid();
  return raw;
}

async function usageExists(db: SupabaseClient, usageRequestId: string): Promise<boolean> {
  const rows = await db.select<{ request_id: string }>(
    "usage_logs",
    `request_id=eq.${encodeURIComponent(usageRequestId)}&select=request_id&limit=1`,
  );
  return rows.length > 0;
}

function sessionSummary(row: VoiceSessionRow): Record<string, unknown> {
  return {
    session_id: row.id,
    status: row.status,
    seconds: row.seconds,
    max_seconds: row.max_seconds,
  };
}

// POST /api/voice/session
// Plan, budget aur daily time check karke session reserve karta hai, phir single-use token deta hai.
async function startSession(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  userCtx: UserContext,
): Promise<Response> {
  const body = await readControlBody(request);
  const requested = parseRequestedSeconds(body.requested_seconds);

  const result = await issueLiveToken(env, config, db, userCtx, {
    requestedSeconds: requested,
    language: userCtx.language,
  });

  return json(
    {
      session_id: result.sessionId,
      token: result.token,
      model: result.model,
      max_seconds: result.maxSeconds,
      start_by: result.startBy,
      expires_at: result.expiresAt,
    },
    201,
  );
}

// POST /api/voice/session/:id/end
// Asli time server tay karta hai: shuru hone ka waqt aur abhi ka waqt, max_seconds tak.
// Client jo bhi bheje, use nahi maana jaata (blueprint 4: client-reported minutes trust nahi).
async function endSession(
  db: SupabaseClient,
  userCtx: UserContext,
  sessionId: string,
): Promise<Response> {
  const select =
    `id=eq.${sessionId}&user_id=eq.${userCtx.userId}` +
    `&select=id,status,max_seconds,seconds,started_at`;

  const rows = await db.select<VoiceSessionRow>("voice_sessions", select);
  const row = rows[0];
  if (!row) throw invalid("सत्र नहीं मिला।");

  // Pehle se band hai (dobara end call, ya cron ne expire kar diya): jo hai woh lautao.
  if (row.status !== "open") return json(sessionSummary(row));

  const now = Date.now();
  const elapsed = Math.floor((now - Date.parse(row.started_at)) / 1000);
  const seconds = Math.max(0, Math.min(elapsed, row.max_seconds));

  // status=open filter: do requests ek saath aayein to sirf pehli update karegi.
  const updated = await db.update<VoiceSessionRow>(
    "voice_sessions",
    `id=eq.${sessionId}&user_id=eq.${userCtx.userId}&status=eq.open`,
    {
      status: "ended",
      seconds,
      ended_at: new Date(now).toISOString(),
    },
  );

  const finalRow = updated[0];
  if (finalRow) return json(sessionSummary(finalRow));

  // Doosri request ne pehle band kar diya: uska jawab dikhao.
  const again = await db.select<VoiceSessionRow>("voice_sessions", select);
  const current = again[0];
  if (!current) throw new ApiError("internal");
  return json(sessionSummary(current));
}

// POST /api/voice/turn
// Body: raw audio (Content-Type: audio/webm, audio/mp4, audio/wav, etc.). Max ~6 MB.
// Jawab: transcript. Reply ke liye app ko transcript /api/ai/chat par bhejna hai.
async function pushToTalk(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  userCtx: UserContext,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  // Pehle size check: Content-Length se, phir asli bytes se (Content-Length jhooth bhi ho sakta hai).
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    throw invalid("ऑडियो बहुत बड़ा है।");
  }

  const mimeType = request.headers.get("Content-Type") ?? "";
  const audio = await request.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw invalid("ऑडियो बहुत बड़ा है।");
  }

  // Budget: 100% par free users bandh, paid users ke liye chalta hai.
  await assertBudget(env, db, config, {
    feature: "voice_turn",
    isFreePlan: userCtx.plan.plan === "free",
  });

  // Same key se dobara aaye to Whisper dobara nahi chalta (paisa bachta hai).
  const idemKey = readIdempotencyKey(request);
  const usageRequestId = `${userCtx.userId}:voice:${idemKey ?? traceId}`;
  if (await usageExists(db, usageRequestId)) {
    throw invalid("यह अनुरोध पहले ही हो चुका है।");
  }

  let result: { text: string; durationSeconds: number };
  try {
    result = await transcribe(env, {
      audio,
      mimeType,
      language: readLanguageHint(request),
      signal: request.signal,
      model: WHISPER_MODEL,
    });
  } catch (err) {
    if (err instanceof AudioInputError) {
      throw invalid(
        err.reason === "unsupported_audio"
          ? "यह ऑडियो फ़ॉर्मेट सपोर्ट नहीं है।"
          : "ऑडियो खाली है या बहुत बड़ा है।",
      );
    }
    if (err instanceof ProviderError) {
      throw new ApiError("provider_unavailable");
    }
    throw err;
  }

  // Usage: sirf cost aur seconds. Token nahi, kyunki Whisper token nahi ginta.
  const seconds = Math.max(0, result.durationSeconds);
  const costInr = (seconds / 3600) * WHISPER_USD_PER_HOUR * USD_TO_INR;

  execCtx.waitUntil(
    db
      .insert(
        "usage_logs",
        {
          user_id: userCtx.userId,
          request_id: usageRequestId,
          feature: "voice_turn",
          provider: "groq",
          model: WHISPER_MODEL,
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost_inr: Number(costInr.toFixed(4)),
        },
        { onConflict: "request_id", conflict: "ignore" },
      )
      .catch(() => {
        console.error(JSON.stringify({ event: "voice_usage_write_failed", request_id: traceId }));
      }),
  );

  return json({
    transcript: result.text,
    duration_seconds: seconds,
    request_id: traceId,
  });
}

export async function handleVoice(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    const user = await authenticate(request, env);
    const db = createSupabase(env);
    const userCtx = await loadUserContext(db, user);
    const { pathname } = new URL(request.url);

    if (request.method !== "POST") throw invalid();

    if (pathname === "/api/voice/session") {
      return await startSession(request, env, config, db, userCtx);
    }

    if (pathname === "/api/voice/turn") {
      return await pushToTalk(request, env, config, db, userCtx, traceId, execCtx);
    }

    const endMatch = SESSION_END_RE.exec(pathname);
    if (endMatch && endMatch[1]) {
      return await endSession(db, userCtx, endMatch[1].toLowerCase());
    }

    throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "voice_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}