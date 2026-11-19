// Sthamly AI Worker: POST /api/images (Blueprint 4.0, Phase 1, image banana)
// Sirf login user. Guest ko image nahi milti (Blueprint section 4).
// Order: login -> prompt -> daily limit -> budget -> pending row -> Gemini -> storage -> ready -> signed link.
// Nakaam hone par row 'failed' hoti hai, aur failed row limit mein nahi ginti (slot wapas aata hai).
// Image ka cost chat se alag, aur ye usage_logs mein feature 'image' se darj hota hai.
// Raw provider error, prompt aur image bytes kabhi log ya client tak nahi jaate.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { cleanImagePrompt, generateImage } from "../providers/image";
import { ProviderError } from "../providers/types";
import { assertPathBelongsTo, deleteObject, objectPathFor, signedDownloadUrl, uploadImage } from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

// Image model: model_registry mein 'image' tier wali row se aata hai. Abhi config se (verify karein).
const IMAGE_FEATURE = "image";
// Image ka kharcha rupees mein (estimate, open decision). Pehle price verify karein.
const IMAGE_COST_INR_ESTIMATE = 3.5;
const USD_TO_INR = 85;

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_ROUTE = "/api/images";
const FILE_ROUTE_RE = /^\/api\/images\/([0-9a-f-]{36})\/url$/i;

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

// Body: { prompt: string, title?: string }. Size chhota rakhte hain.
async function readBody(request: Request): Promise<{ prompt: string; title: string | null }> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8 * 1024) {
    throw invalid("अनुरोध बहुत बड़ा है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || typeof parsed.prompt !== "string") throw invalid();

  let title: string | null = null;
  if (parsed.title !== undefined && parsed.title !== null) {
    if (typeof parsed.title !== "string") throw invalid();
    const t = parsed.title.trim();
    title = t.length > 0 ? Array.from(t).slice(0, 60).join("") : null;
  }

  return { prompt: parsed.prompt, title };
}

function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null) return null;
  if (!IDEMPOTENCY_RE.test(raw)) throw invalid();
  return raw;
}

// Aaj ki image count DB function se (pending aur ready dono).
async function imagesToday(db: SupabaseClient, userId: string): Promise<number> {
  const used = await db.rpc<number | null>("user_images_today", { p_user: userId });
  return typeof used === "number" ? used : 0;
}

// Plan ki daily image limit. Plan row mein 'daily_images' column hai (migration 0003).
async function dailyImageLimit(db: SupabaseClient, plan: string): Promise<number> {
  const rows = await db.select<{ daily_images: number }>(
    "plans",
    `plan=eq.${encodeURIComponent(plan)}&select=daily_images`,
  );
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row.daily_images;
}

// Pending row banata hai. Ye limit ka slot pakadta hai.
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

// Usage: feature 'image', cost rupees mein. Ek hi baar (request_id unique).
async function recordImageUsage(
  db: SupabaseClient,
  p: { userId: string; requestId: string; model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: p.userId,
      request_id: p.requestId,
      feature: IMAGE_FEATURE,
      provider: "gemini",
      model: p.model,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      estimated_cost_inr: Number((IMAGE_COST_INR_ESTIMATE * (USD_TO_INR / USD_TO_INR)).toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

// Poora image flow. Har failure par row 'failed' hoti hai, aur user ko saaf message.
async function createImage(
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
  const title = body.title ?? prompt.slice(0, 40);

  // Idempotency: same key se dobara aaye to naya image nahi banta.
  const idemKey = readIdempotencyKey(request);
  const requestId = `${ctx.userId}:image:${idemKey ?? traceId}`;

  const dupes = await db.select<{ id: string }>(
    "generated_files",
    `request_id=eq.${encodeURIComponent(requestId)}&select=id&limit=1`,
  );
  if (dupes.length > 0) throw invalid("यह अनुरोध पहले ही हो चुका है।");

  // Daily limit: pending aur ready dono ginte hain.
  const limit = await dailyImageLimit(db, ctx.plan.plan);
  const used = await imagesToday(db, ctx.userId);
  if (used >= limit) {
    throw new ApiError(
      "budget_exceeded",
      "आज की तस्वीरों की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।",
    );
  }

  // Budget (global, 100% par free users band).
  await assertBudget(env, db, config, {
    feature: "image",
    isFreePlan: ctx.plan.plan === "free",
  });

  // Pending row: ab ye slot pakad chuka hai.
  const row = await insertPending(db, ctx.userId, title, requestId);

  try {
    const generated = await generateImage(env, {
      model: config.imageModel,
      prompt,
      signal: new AbortController().signal,
    });

    const stored = await uploadImage(env, {
      userId: ctx.userId,
      fileId: row.id,
      mimeType: generated.mimeType,
      bytes: generated.bytes,
    });

    await markReady(db, row.id, stored.path, stored.mimeType, stored.sizeBytes);

    execCtx.waitUntil(
      recordImageUsage(db, {
        userId: ctx.userId,
        requestId,
        model: config.imageModel,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      }).catch(() => {
        console.error(JSON.stringify({ event: "image_usage_write_failed", request_id: traceId }));
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
          expires_at: row.created_at,
        },
        download_url: url,
        request_id: traceId,
      },
      201,
    );
  } catch (err) {
    // Koi bhi step fail: slot wapas (row failed), aur user ko saaf message.
    await markFailed(db, row.id);
    if (err instanceof ProviderError) {
      throw new ApiError("provider_unavailable");
    }
    throw err;
  }
}

// GET /api/images: user ki files ki list (ready aur pending).
async function listImages(db: SupabaseClient, userId: string): Promise<Response> {
  const rows = await db.select<GeneratedFileRow>(
    "generated_files",
    `user_id=eq.${userId}&deleted_at=is.null&status=neq.failed` +
      `&select=id,kind,status,title,mime_type,size_bytes,created_at,expires_at` +
      `&order=created_at.desc&limit=50`,
  );
  return json({ files: rows });
}

// GET /api/images/:id/url: signed download link (1 ghanta). Sirf apni file.
async function downloadUrl(db: SupabaseClient, env: Env, userId: string, fileId: string): Promise<Response> {
  const rows = await db.select<GeneratedFileRow>(
    "generated_files",
    `id=eq.${fileId}&user_id=eq.${userId}&status=eq.ready&deleted_at=is.null&select=id,storage_path`,
  );
  const row = rows[0];
  if (!row || !row.storage_path) throw invalid("फ़ाइल नहीं मिली।");

  assertPathBelongsTo(row.storage_path, userId);
  const url = await signedDownloadUrl(env, row.storage_path);
  return json({ download_url: url });
}

// DELETE /api/images/:id: user apni file hata sake. Storage object bhi hatata hai.
async function deleteImage(db: SupabaseClient, env: Env, userId: string, fileId: string): Promise<Response> {
  const rows = await db.select<GeneratedFileRow>(
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

export async function handleImages(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    // Login zaroori. Guest ko image nahi milti.
    const user = await authenticate(request, env);
    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === IMAGE_ROUTE) {
      if (method === "POST") return await createImage(request, env, config, db, ctx, traceId, execCtx);
      if (method === "GET") return await listImages(db, user.id);
      throw invalid();
    }

    const urlMatch = FILE_ROUTE_RE.exec(pathname);
    if (urlMatch && urlMatch[1] && method === "GET") {
      const fileId = urlMatch[1].toLowerCase();
      if (!UUID_RE.test(fileId)) throw invalid();
      return await downloadUrl(db, env, user.id, fileId);
    }

    const idMatch = /^\/api\/images\/([0-9a-f-]{36})$/i.exec(pathname);
    if (idMatch && idMatch[1] && method === "DELETE") {
      return await deleteImage(db, env, user.id, idMatch[1].toLowerCase());
    }

    throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "images_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}