// Sthamly AI Worker: POST /api/image-tools/remove-background (tasveer ka background hatana)
// Sirf login user. Guest ko nahi milta. Model: Workers AI 'bria/remove-background' (approx $0.018 per image).
// Photo kahin save nahi hoti: input Workers AI ko jaata hai, output seedha user ko PNG mein jaata hai.
// Order: login -> body check -> daily limit (KV) -> budget -> AI -> result download -> usage -> PNG.
// Raw provider error, image bytes aur provider ka URL kabhi log ya client tak nahi jaate.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext } from "../plan";
import { createSupabase, type SupabaseClient } from "../supabase";

const MODEL = "bria/remove-background";
// Budget ka bucket wahi 'image' hai jo image banane mein hai, taaki global budget sahi chale.
const BUDGET_FEATURE = "image";
// $0.018 ~ Rs 1.5 (estimate). Rate badle to yahan update karein.
const COST_INR_ESTIMATE = 1.5;
// Ek user ke liye din mein kitni baar. KV par count hota hai (approximate, kaafi hai abuse rokne ke liye).
const DAILY_LIMIT = 20;
const SLOT_TTL_SECONDS = 2 * 24 * 60 * 60;
const SLOT_PREFIX = "bgr";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const AI_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const ROUTE = "/api/image-tools/remove-background";

// data:image/jpeg|png|webp;base64,...  (sirf yahi formats)
const DATA_URI_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

// Workers AI binding ka structural type. env.ts badalne ki zaroorat nahi.
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
type AiEnv = Env & { AI?: AiBinding };

function invalid(message?: string): ApiError {
  return new ApiError("invalid_request", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotKey(userId: string): string {
  return `${SLOT_PREFIX}:${userId}:${utcDay()}`;
}

// Body: { image: "data:image/...;base64,..." }. Check ke baad hi data aage jaata hai.
async function readImage(request: Request): Promise<string> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("फ़ोटो बहुत बड़ी है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || typeof parsed.image !== "string") throw invalid();

  const match = DATA_URI_RE.exec(parsed.image);
  if (!match || !match[2]) throw invalid("सिर्फ़ JPEG, PNG या WEBP फ़ोटो चल सकती है।");

  const decodedBytes = Math.floor((match[2].length * 3) / 4);
  if (decodedBytes > MAX_IMAGE_BYTES) throw invalid("फ़ोटो बहुत बड़ी है। छोटी फ़ोटो चुनें।");

  return parsed.image;
}

// Daily limit: slot pakdo. Limit par pahunch gaye to saaf message.
async function takeSlot(env: Env, userId: string): Promise<void> {
  const key = slotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current >= DAILY_LIMIT) {
    throw new ApiError(
      "rate_limited",
      "आज बैकग्राउंड हटाने की सीमा पूरी हो गई। कल फिर कोशिश करें।",
    );
  }
  await env.STATE.put(key, String(current + 1), { expirationTtl: SLOT_TTL_SECONDS });
}

// Slot wapas: jab AI ya budget ki wajah se kaam nahi hua.
async function releaseSlot(env: Env, userId: string): Promise<void> {
  const key = slotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current > 0) {
    await env.STATE.put(key, String(current - 1), { expirationTtl: SLOT_TTL_SECONDS });
  }
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

// Model ka output: { image: "https://..." } (PNG ka URL). Sirf https url manzoor.
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

// PNG download, server se. Size aur type dono check.
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

// Usage: feature 'image', ek hi baar (request_id unique). Cost estimate rupees mein.
async function recordUsage(db: SupabaseClient, userId: string, requestId: string): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: userId,
      request_id: requestId,
      feature: BUDGET_FEATURE,
      provider: "cloudflare",
      model: MODEL,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_inr: Number(COST_INR_ESTIMATE.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

export async function handleImageTools(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    // Login zaroori. Guest ko ye tool nahi milta.
    const user = await authenticate(request, env);

    const { pathname } = new URL(request.url);
    if (pathname !== ROUTE || request.method !== "POST") throw invalid();

    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    const image = await readImage(request);
    await takeSlot(env, user.id);

    try {
      await assertBudget(env, db, config, {
        feature: BUDGET_FEATURE,
        isFreePlan: ctx.plan.plan === "free",
      });

      const ai = (env as AiEnv).AI;
      if (!ai) throw new ApiError("provider_unavailable");

      const output = await withTimeout(
        ai.run(MODEL, { image, preserve_alpha: true }),
        AI_TIMEOUT_MS,
      );
      const png = await downloadPng(resultUrl(output));

      execCtx.waitUntil(
        recordUsage(db, user.id, `${user.id}:bgr:${traceId}`).catch(() => {
          console.error(JSON.stringify({ event: "bgr_usage_write_failed", request_id: traceId }));
        }),
      );

      return new Response(png, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      await releaseSlot(env, user.id);
      if (err instanceof ApiError) throw err;
      throw new ApiError("provider_unavailable");
    }
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "image_tools_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}