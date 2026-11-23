// Sthamly AI Worker: POST /api/image-chat/edit (chat mein tasveer bhejo)
// Sirf login user. Body: { image: "data:image/...;base64,...", prompt: string, intent?: "auto" | "ask" | "edit" | "remove_bg" }.
// intent "auto" (default): server prompt padh kar tay karta hai. "ask": tasveer dekh kar text jawab (OpenRouter free vision).
// "edit": tasveer badlo ya banao (Cloudflare FLUX.2 klein). "remove_bg": background hatao (Cloudflare bria).
// Edit ke order: login -> body -> intent -> daily limit -> budget -> pending row -> edit -> storage -> ready row -> signed link.
// Nakaam hone par row 'failed' hoti hai, aur failed row limit mein nahi ginti (slot wapas aata hai).
// Raw provider error, prompt aur image bytes kabhi log ya client tak nahi jaate. Log mein sirf error ka naam aur chhota message.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { cleanImagePrompt } from "../providers/image";
import type { InputImage } from "../providers/gemini-image";
import { removeBackgroundWithCloudflare } from "../providers/cf-image";
import { CF_EDIT_MODEL, editImageWithCloudflare } from "../providers/cf-image-edit";
import { askImageWithOpenRouter } from "../providers/openrouter-vision";
import { classifyImageRequest, type ImageDecision, type ResolvedIntent } from "../providers/intent";
import { ProviderError } from "../providers/types";
import { signedDownloadUrl, uploadObject } from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

const ROUTE = "/api/image-chat/edit";
type RequestIntent = "auto" | ResolvedIntent;
type EditIntent = Exclude<ResolvedIntent, "ask">;
const INTENTS: readonly RequestIntent[] = ["auto", "ask", "edit", "remove_bg"];

// Edit ka kharcha rupees mein (estimate). Image banane ke barabar hi maana hai.
const EDIT_COST_INR_ESTIMATE = 3.5;
const EDIT_FEATURE = "image";
const DEFAULT_EDIT = "इस तस्वीर को बेहतर बनाओ।";
// Sawal (vision) ka kharcha aur daily limit. OpenRouter free models par ye kharcha 0 hai,
// lekin budget ginti ke liye chhota estimate rakha hai.
const ASK_COST_INR_ESTIMATE = 0.5;
const ASK_FEATURE = "vision";
const ASK_DAILY_LIMIT = 30;
const ASK_SLOT_TTL_SECONDS = 2 * 24 * 60 * 60;
const ASK_SLOT_PREFIX = "visq";
const DEFAULT_QUESTION = "इस तस्वीर में क्या है? विस्तार से बताओ।";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TITLE_CHARS = 40;
const DETAIL_CHARS = 300;

// data:image/jpeg|png|webp;base64,...  (sirf yahi formats)
const DATA_URI_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

interface GeneratedFileRow {
  id: string;
  user_id: string;
  kind: string;
  status: "pending" | "ready" | "failed";
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  title: string;
  created_at: string;
}

interface ParsedBody {
  image: InputImage;
  prompt: string;
  intent: RequestIntent;
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

// Error ka naam aur chhota message, log ke liye. Prompt ya image yahan nahi aate.
function errorDetail(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`.slice(0, DETAIL_CHARS);
  }
  return "non-error";
}

// Kis kadam par kya galat hua: "ask" (OpenRouter vision) ya "edit" (Cloudflare). Provider ka naam aur status bhi.
function logStageFailure(stage: "ask" | "edit", err: unknown, traceId: string): void {
  const provider = err instanceof ProviderError ? err.provider : null;
  const status = err instanceof ProviderError ? err.status : null;
  console.error(
    JSON.stringify({
      event: "image_chat_stage_failed",
      stage,
      provider,
      status,
      detail: errorDetail(err),
      request_id: traceId,
    }),
  );
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function askSlotKey(userId: string): string {
  return `${ASK_SLOT_PREFIX}:${userId}:${utcDay()}`;
}

// Sawal ki daily ginti (KV par, approximate).
async function takeAskSlot(env: Env, userId: string): Promise<void> {
  const key = askSlotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current >= ASK_DAILY_LIMIT) {
    throw new ApiError("rate_limited", "आज तस्वीर के सवालों की सीमा पूरी हो गई। कल फिर कोशिश करें।");
  }
  await env.STATE.put(key, String(current + 1), { expirationTtl: ASK_SLOT_TTL_SECONDS });
}

async function releaseAskSlot(env: Env, userId: string): Promise<void> {
  const key = askSlotKey(userId);
  const current = Number((await env.STATE.get(key)) ?? "0");
  if (current > 0) {
    await env.STATE.put(key, String(current - 1), { expirationTtl: ASK_SLOT_TTL_SECONDS });
  }
}

// Body padhta hai aur image ko check karta hai. Galat ho to saaf Hindi message.
async function readBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("तस्वीर बहुत बड़ी है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || typeof parsed.image !== "string" || typeof parsed.prompt !== "string") {
    throw invalid();
  }

  const match = DATA_URI_RE.exec(parsed.image);
  if (!match || !match[1] || !match[2]) {
    throw invalid("सिर्फ़ JPEG, PNG या WEBP तस्वीर चल सकती है।");
  }

  const decodedBytes = Math.floor((match[2].length * 3) / 4);
  if (decodedBytes > MAX_IMAGE_BYTES) throw invalid("तस्वीर बहुत बड़ी है। छोटी तस्वीर चुनें।");

  // intent na ho to "auto": server prompt padh kar khud tay karega.
  let intent: RequestIntent = "auto";
  if (parsed.intent !== undefined) {
    const found = INTENTS.find((i) => i === parsed.intent);
    if (!found) throw invalid();
    intent = found;
  }

  const mimeType = match[1] as InputImage["mimeType"];
  return {
    image: { mimeType, base64: match[2] },
    prompt: parsed.prompt,
    intent,
  };
}

// Aaj ki image count DB function se (pending aur ready dono).
async function imagesToday(db: SupabaseClient, userId: string): Promise<number> {
  const used = await db.rpc<number | null>("user_images_today", { p_user: userId });
  return typeof used === "number" ? used : 0;
}

// Plan ki daily image limit. Plan row mein 'daily_images' column hai.
async function dailyImageLimit(db: SupabaseClient, plan: string): Promise<number> {
  const rows = await db.select<{ daily_images: number }>(
    "plans",
    `plan=eq.${encodeURIComponent(plan)}&select=daily_images`,
  );
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row.daily_images;
}

// Pending row: ye limit ka slot pakadti hai.
async function insertPending(
  db: SupabaseClient,
  userId: string,
  title: string,
  requestId: string,
): Promise<GeneratedFileRow> {
  const rows = await db.insert<GeneratedFileRow>("generated_files", {
    user_id: userId,
    kind: "image",
    status: "pending",
    title,
    request_id: requestId,
  });
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row;
}

async function markReady(
  db: SupabaseClient,
  fileId: string,
  path: string,
  mimeType: string,
  sizeBytes: number,
): Promise<void> {
  await db.update("generated_files", `id=eq.${fileId}`, {
    status: "ready",
    storage_path: path,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  });
}

async function markFailed(db: SupabaseClient, fileId: string): Promise<void> {
  await db
    .update("generated_files", `id=eq.${fileId}`, { status: "failed" })
    .catch(() => undefined);
}

// Usage: edit ka record, ek hi baar (request_id unique).
async function recordEditUsage(
  db: SupabaseClient,
  p: { userId: string; requestId: string },
): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: p.userId,
      request_id: p.requestId,
      feature: EDIT_FEATURE,
      provider: "cloudflare",
      model: CF_EDIT_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_inr: Number(EDIT_COST_INR_ESTIMATE.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

// Usage: sawal (vision) ka record. Model wahi jo jawab de paya.
async function recordAskUsage(
  db: SupabaseClient,
  userId: string,
  traceId: string,
  model: string,
): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: userId,
      request_id: `${userId}:vision:${traceId}`,
      feature: ASK_FEATURE,
      provider: "openrouter",
      model,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_inr: Number(ASK_COST_INR_ESTIMATE.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

// Intent "ask": tasveer dekh kar text jawab. Koi image nahi banti.
async function askImage(
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  image: InputImage,
  question: string,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  await takeAskSlot(env, ctx.userId);
  try {
    await assertBudget(env, db, config, {
      feature: ASK_FEATURE,
      isFreePlan: ctx.plan.plan === "free",
    });

    const answer = await askImageWithOpenRouter(env, { question, image });

    execCtx.waitUntil(
      recordAskUsage(db, ctx.userId, traceId, answer.model).catch(() => {
        console.error(JSON.stringify({ event: "vision_usage_write_failed", request_id: traceId }));
      }),
    );

    return json({ file: null, download_url: null, text: answer.text, request_id: traceId }, 200);
  } catch (err) {
    await releaseAskSlot(env, ctx.userId);
    logStageFailure("ask", err, traceId);
    if (err instanceof ProviderError) throw new ApiError("provider_unavailable");
    throw err;
  }
}

// Intent "edit" ya "remove_bg": tasveer banti hai, storage mein jaati hai, link milta hai.
async function editImage(
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  image: InputImage,
  prompt: string,
  intent: EditIntent,
  modelPrompt: string | null,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  // Title user ke apne shabdon se. Image model ko English nirdesh (modelPrompt) mil sakta hai.
  const editPrompt = modelPrompt ?? (prompt.trim().length > 0 ? prompt : DEFAULT_EDIT);
  const titleSource = prompt.trim().length > 0 ? prompt : editPrompt;
  const title = Array.from(titleSource).slice(0, TITLE_CHARS).join("");
  const requestId = `${ctx.userId}:imgedit:${traceId}`;

  // Daily limit: images ka wahi quota jo tasveer banane par lagta hai.
  const limit = await dailyImageLimit(db, ctx.plan.plan);
  const used = await imagesToday(db, ctx.userId);
  if (used >= limit) {
    throw new ApiError(
      "budget_exceeded",
      "आज की तस्वीरों की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।",
    );
  }

  await assertBudget(env, db, config, {
    feature: "image",
    isFreePlan: ctx.plan.plan === "free",
  });

  const row = await insertPending(db, ctx.userId, title, requestId);

  try {
    // Background hatana: bria. Baaki edit: FLUX.2 klein. Dono Cloudflare Workers AI par (free tier).
    const edited =
      intent === "remove_bg"
        ? await removeBackgroundWithCloudflare(env, `data:${image.mimeType};base64,${image.base64}`)
        : await editImageWithCloudflare(env, { prompt: editPrompt, image });

    const stored = await uploadObject(env, {
      userId: ctx.userId,
      fileId: row.id,
      mimeType: edited.mimeType,
      bytes: edited.bytes,
    });

    await markReady(db, row.id, stored.path, stored.mimeType, stored.sizeBytes);

    execCtx.waitUntil(
      recordEditUsage(db, { userId: ctx.userId, requestId }).catch(() => {
        console.error(JSON.stringify({ event: "image_edit_usage_write_failed", request_id: traceId }));
      }),
    );

    const url = await signedDownloadUrl(env, stored.path);
    return json(
      {
        file: {
          id: row.id,
          kind: "image",
          title,
          mime_type: stored.mimeType,
          size_bytes: stored.sizeBytes,
          status: "ready",
        },
        download_url: url,
        text: edited.text,
        request_id: traceId,
      },
      201,
    );
  } catch (err) {
    await markFailed(db, row.id);
    logStageFailure("edit", err, traceId);
    if (err instanceof ProviderError) {
      throw new ApiError("provider_unavailable");
    }
    throw err;
  }
}

// Prompt (ya chuna hua intent) dekh kar sahi raasta chunta hai.
async function runImageChat(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  const body = await readBody(request);
  const prompt = cleanImagePrompt(body.prompt);
  const question = prompt.trim().length > 0 ? prompt : DEFAULT_QUESTION;

  // "auto": server prompt padhkar tay karta hai ki sawal hai ya tasveer banani hai.
  const decision: ImageDecision =
    body.intent === "auto"
      ? await classifyImageRequest(env, question, request.signal)
      : { intent: body.intent, imagePrompt: null };

  if (decision.intent === "ask") {
    return askImage(env, config, db, ctx, body.image, question, traceId, execCtx);
  }
  return editImage(
    env,
    config,
    db,
    ctx,
    body.image,
    prompt,
    decision.intent,
    decision.imagePrompt,
    traceId,
    execCtx,
  );
}

export async function handleImageChat(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    // Login zaroori. Guest ko ye feature nahi milta.
    const user = await authenticate(request, env);

    const { pathname } = new URL(request.url);
    if (pathname !== ROUTE || request.method !== "POST") throw invalid();

    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    return await runImageChat(request, env, config, db, ctx, traceId, execCtx);
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(
      JSON.stringify({
        event: "image_chat_request_failed",
        code,
        detail: code === "internal" ? errorDetail(err) : undefined,
        request_id: traceId,
      }),
    );
    return toErrorResponse(err, traceId);
  }
}