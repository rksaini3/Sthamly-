// Sthamly AI Worker: ek creation flow (Blueprint 4.0). Chaar kinds: image, slides, website, document.
// POST   /api/create            naya banao (body: { kind, prompt, title? })
// GET    /api/create            meri files ki list (failed ke bina)
// GET    /api/create/:id/url    signed download link (1 ghanta), sirf meri file
// DELETE /api/create/:id        meri file hatao (storage object bhi)
// Sirf login user. Guest ko nahi.
// Flow: login -> body -> duplicate check -> limit -> budget -> pending row -> banana -> storage -> ready -> link.
// Har failure par row 'failed' hoti hai, aur failed row limit mein nahi ginti (slot wapas aata hai).
// Slides ke andar ki images per deck max MAX_SLIDE_IMAGES, aur unka kharcha usage mein jud jaata hai.

import { authenticate } from "../auth";
import { assertBudget, type CostFeature } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { generateImage } from "../providers/image";
import { generateText } from "../providers/create-text";
import { ProviderError } from "../providers/types";
import {
  CREATE_TEXT_MODEL,
  MAX_SLIDE_IMAGES,
  SYSTEM_PROMPTS,
  TEXT_MAX_OUTPUT_TOKENS,
  WEBSITE_MAX_OUTPUT_TOKENS,
  buildSlidesHtml,
  bytesToBase64,
  cleanPrompt,
  cleanTitle,
  isCreateKind,
  parseDeck,
  sanitizeDocument,
  sanitizeWebsite,
  slideImagePrompt,
  userText,
  type CreateKind,
} from "../creators";
import {
  assertPathBelongsTo,
  deleteObject,
  signedDownloadUrl,
  textBytes,
  uploadObject,
} from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

const BASE_PATH = "/api/create";
const FILE_PATH_RE = /^\/api\/create\/([0-9a-f-]{36})$/i;
const URL_PATH_RE = /^\/api\/create\/([0-9a-f-]{36})\/url$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;

const MAX_BODY_BYTES = 16 * 1024;
const TITLE_FROM_PROMPT_CHARS = 40;

// Kharcha (rupees, estimate). Vendor price se verify karke badlein.
export const COST_INR = {
  image: 3.5,
  slides: 2,
  website: 2,
  document: 0.5,
} as const;

const USD_TO_INR_NOTE = "estimate";
void USD_TO_INR_NOTE;

interface FileRow {
  id: string;
  user_id: string;
  kind: CreateKind;
  status: "pending" | "ready" | "failed";
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  title: string;
  created_at: string;
  expires_at: string;
}

interface CreateBody {
  kind: CreateKind;
  prompt: string;
  title: string | null;
}

interface Produced {
  bytes: ArrayBuffer;
  mimeType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costInr: number;
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

async function readBody(request: Request): Promise<CreateBody> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("अनुरोध बहुत बड़ा है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || !isCreateKind(parsed.kind) || typeof parsed.prompt !== "string") {
    throw invalid("बनाने का प्रकार और विवरण दें।");
  }

  return {
    kind: parsed.kind,
    prompt: parsed.prompt,
    title: typeof parsed.title === "string" ? parsed.title : null,
  };
}

function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null) return null;
  if (!IDEMPOTENCY_RE.test(raw)) throw invalid();
  return raw;
}

// Budget feature: image ko 'vision' (mehnga) maante hain, baaki text-based ko 'document'.
export function budgetFeatureFor(kind: CreateKind): CostFeature {
  return kind === "image" ? "vision" : "document";
}

export async function planLimits(
  db: SupabaseClient,
  plan: string,
): Promise<{ dailyImages: number; dailyCreations: number }> {
  const rows = await db.select<{ daily_images: number; daily_creations: number }>(
    "plans",
    `plan=eq.${encodeURIComponent(plan)}&select=daily_images,daily_creations`,
  );
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return { dailyImages: row.daily_images, dailyCreations: row.daily_creations };
}

export async function countToday(
  db: SupabaseClient,
  fn: "user_images_today" | "user_creations_today",
  userId: string,
): Promise<number> {
  const used = await db.rpc<number | null>(fn, { p_user: userId });
  return typeof used === "number" ? used : 0;
}

export async function insertPending(
  db: SupabaseClient,
  userId: string,
  kind: CreateKind,
  title: string,
  requestId: string,
): Promise<FileRow> {
  const rows = await db.insert<FileRow>("generated_files", {
    user_id: userId,
    kind,
    status: "pending",
    title,
    request_id: requestId,
  });
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row;
}

export async function markReady(
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

export async function markFailed(db: SupabaseClient, fileId: string): Promise<void> {
  await db
    .update("generated_files", `id=eq.${fileId}`, { status: "failed" })
    .catch(() => undefined);
}

// Har kind ka banane wala. Sab same Produced shape lautate hain.

async function produceImage(
  env: Env,
  config: Config,
  prompt: string,
  signal: AbortSignal,
): Promise<Produced> {
  const img = await generateImage(env, { model: config.imageModel, prompt, signal });
  return {
    bytes: img.bytes,
    mimeType: img.mimeType,
    model: config.imageModel,
    inputTokens: img.inputTokens,
    outputTokens: img.outputTokens,
    costInr: COST_INR.image,
  };
}

async function produceSlides(
  env: Env,
  config: Config,
  prompt: string,
  signal: AbortSignal,
): Promise<Produced> {
  const text = await generateText(env, {
    model: CREATE_TEXT_MODEL,
    system: SYSTEM_PROMPTS.slides,
    user: userText(prompt),
    json: true,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    signal,
  });

  const deck = parseDeck(text.text);

  // Slide images: har slide ke liye ek. Image fail ho to us slide mein image nahi, deck nahi rukta.
  const images: Array<string | null> = [];
  let imagesMade = 0;

  for (const slide of deck.slides) {
    if (signal.aborted) throw new ApiError("internal");

    const imagePrompt = slide.image_prompt;
    if (imagePrompt === null || imagesMade >= MAX_SLIDE_IMAGES) {
      images.push(null);
      continue;
    }

    try {
      const img = await generateImage(env, {
        model: config.imageModel,
        prompt: slideImagePrompt(imagePrompt),
        signal,
      });
      images.push(`data:${img.mimeType};base64,${bytesToBase64(img.bytes)}`);
      imagesMade += 1;
    } catch {
      images.push(null);
    }
  }

  const html = buildSlidesHtml(deck, images);
  return {
    bytes: textBytes(html),
    mimeType: "text/html",
    model: CREATE_TEXT_MODEL,
    inputTokens: text.inputTokens,
    outputTokens: text.outputTokens,
    costInr: COST_INR.slides + imagesMade * COST_INR.image,
  };
}

async function produceWebsite(
  env: Env,
  prompt: string,
  signal: AbortSignal,
): Promise<Produced> {
  const text = await generateText(env, {
    model: CREATE_TEXT_MODEL,
    system: SYSTEM_PROMPTS.website,
    user: userText(prompt),
    json: false,
    maxOutputTokens: WEBSITE_MAX_OUTPUT_TOKENS,
    signal,
  });
  const html = sanitizeWebsite(text.text);
  return {
    bytes: textBytes(html),
    mimeType: "text/html",
    model: CREATE_TEXT_MODEL,
    inputTokens: text.inputTokens,
    outputTokens: text.outputTokens,
    costInr: COST_INR.website,
  };
}

async function produceDocument(
  env: Env,
  prompt: string,
  signal: AbortSignal,
): Promise<Produced> {
  const text = await generateText(env, {
    model: CREATE_TEXT_MODEL,
    system: SYSTEM_PROMPTS.document,
    user: userText(prompt),
    json: false,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    signal,
  });
  const md = sanitizeDocument(text.text);
  return {
    bytes: textBytes(md),
    mimeType: "text/markdown",
    model: CREATE_TEXT_MODEL,
    inputTokens: text.inputTokens,
    outputTokens: text.outputTokens,
    costInr: COST_INR.document,
  };
}

export async function produce(
  kind: CreateKind,
  env: Env,
  config: Config,
  prompt: string,
  signal: AbortSignal,
): Promise<Produced> {
  if (kind === "image") return produceImage(env, config, prompt, signal);
  if (kind === "slides") return produceSlides(env, config, prompt, signal);
  if (kind === "website") return produceWebsite(env, prompt, signal);
  return produceDocument(env, prompt, signal);
}

export async function recordUsage(
  db: SupabaseClient,
  p: {
    userId: string;
    requestId: string;
    kind: CreateKind;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costInr: number;
  },
): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: p.userId,
      request_id: p.requestId,
      feature: `create_${p.kind}`,
      provider: "gemini",
      model: p.model,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      estimated_cost_inr: Number(p.costInr.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

// POST /api/create: poora flow.
async function createFile(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  const body = await readBody(request);
  const prompt = cleanPrompt(body.prompt);
  const title = cleanTitle(body.title, Array.from(prompt).slice(0, TITLE_FROM_PROMPT_CHARS).join(""));

  // Idempotency: same key se dobara aaye to naya file nahi banta.
  const idemKey = readIdempotencyKey(request);
  const requestId = `${ctx.userId}:create:${idemKey ?? traceId}`;

  const dupes = await db.select<{ id: string }>(
    "generated_files",
    `request_id=eq.${encodeURIComponent(requestId)}&select=id&limit=1`,
  );
  if (dupes.length > 0) throw invalid("यह अनुरोध पहले ही हो चुका है।");

  // Limit: image ki alag, baaki ki alag.
  const limits = await planLimits(db, ctx.plan.plan);
  const isImage = body.kind === "image";
  const used = isImage
    ? await countToday(db, "user_images_today", ctx.userId)
    : await countToday(db, "user_creations_today", ctx.userId);
  const limit = isImage ? limits.dailyImages : limits.dailyCreations;

  if (used >= limit) {
    throw new ApiError(
      "budget_exceeded",
      "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।",
    );
  }

  // Budget: 100% par free users band.
  await assertBudget(env, db, config, {
    feature: budgetFeatureFor(body.kind),
    isFreePlan: ctx.plan.plan === "free",
  });

  // Pending row: ab ye slot pakad chuka hai.
  const row = await insertPending(db, ctx.userId, body.kind, title, requestId);

  try {
    const produced = await produce(body.kind, env, config, prompt, request.signal);

    const stored = await uploadObject(env, {
      userId: ctx.userId,
      fileId: row.id,
      mimeType: produced.mimeType,
      bytes: produced.bytes,
    });

    await markReady(db, row.id, stored.path, stored.mimeType, stored.sizeBytes);

    execCtx.waitUntil(
      recordUsage(db, {
        userId: ctx.userId,
        requestId,
        kind: body.kind,
        model: produced.model,
        inputTokens: produced.inputTokens,
        outputTokens: produced.outputTokens,
        costInr: produced.costInr,
      }).catch(() => {
        console.error(JSON.stringify({ event: "create_usage_write_failed", request_id: traceId }));
      }),
    );

    const url = await signedDownloadUrl(env, stored.path);
    return json(
      {
        file: {
          id: row.id,
          kind: body.kind,
          title,
          mime_type: stored.mimeType,
          size_bytes: stored.sizeBytes,
          status: "ready",
          expires_at: row.expires_at,
        },
        download_url: url,
        request_id: traceId,
      },
      201,
    );
  } catch (err) {
    await markFailed(db, row.id);
    if (err instanceof ProviderError) {
      throw new ApiError("provider_unavailable");
    }
    throw err;
  }
}

// GET /api/create: meri files (failed aur hatai hui ke bina).
async function listFiles(db: SupabaseClient, userId: string): Promise<Response> {
  const rows = await db.select<FileRow>(
    "generated_files",
    `user_id=eq.${userId}&deleted_at=is.null&status=neq.failed` +
      `&select=id,kind,status,title,mime_type,size_bytes,created_at,expires_at` +
      `&order=created_at.desc&limit=50`,
  );
  return json({ files: rows });
}

// GET /api/create/:id/url: signed link, sirf meri file.
async function downloadUrl(
  db: SupabaseClient,
  env: Env,
  userId: string,
  fileId: string,
): Promise<Response> {
  const rows = await db.select<FileRow>(
    "generated_files",
    `id=eq.${fileId}&user_id=eq.${userId}&status=eq.ready&deleted_at=is.null&select=id,storage_path`,
  );
  const row = rows[0];
  if (!row || !row.storage_path) throw invalid("फ़ाइल नहीं मिली।");

  assertPathBelongsTo(row.storage_path, userId);
  return json({ download_url: await signedDownloadUrl(env, row.storage_path) });
}

// DELETE /api/create/:id: meri file hatao, storage object bhi.
async function deleteFile(
  db: SupabaseClient,
  env: Env,
  userId: string,
  fileId: string,
): Promise<Response> {
  const rows = await db.select<FileRow>(
    "generated_files",
    `id=eq.${fileId}&user_id=eq.${userId}&deleted_at=is.null&select=id,storage_path`,
  );
  const row = rows[0];
  if (!row) throw invalid("फ़ाइल नहीं मिली।");

  if (row.storage_path) {
    assertPathBelongsTo(row.storage_path, userId);
    await deleteObject(env, row.storage_path);
  }
  await db.update("generated_files", `id=eq.${fileId}&user_id=eq.${userId}`, {
    deleted_at: new Date().toISOString(),
  });
  return json({ deleted: true, file_id: fileId });
}

export async function handleCreate(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    // Login zaroori. Guest ko kuch banane ki ijazat nahi.
    const user = await authenticate(request, env);
    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === BASE_PATH) {
      if (method === "POST") {
        return await createFile(request, env, config, db, ctx, traceId, execCtx);
      }
      if (method === "GET") return await listFiles(db, user.id);
      throw invalid();
    }

    const urlMatch = URL_PATH_RE.exec(pathname);
    if (urlMatch && urlMatch[1] && method === "GET") {
      const id = urlMatch[1].toLowerCase();
      if (!UUID_RE.test(id)) throw invalid();
      return await downloadUrl(db, env, user.id, id);
    }

    const fileMatch = FILE_PATH_RE.exec(pathname);
    if (fileMatch && fileMatch[1] && method === "DELETE") {
      const id = fileMatch[1].toLowerCase();
      if (!UUID_RE.test(id)) throw invalid();
      return await deleteFile(db, env, user.id, id);
    }

    throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "create_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}