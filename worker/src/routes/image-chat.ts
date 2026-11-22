// Sthamly AI Worker: POST /api/image-chat/edit (chat mein tasveer bhejo, edit ya background hatao, naya jawab)
// Sirf login user. Body: { image: "data:image/...;base64,...", prompt: string }.
// Order: login -> body check -> prompt check -> daily limit (images ka hi quota) -> budget -> pending row
//        -> Cloudflare edit (bria ya FLUX.2 klein) -> storage -> ready row -> signed link.
// Nakaam hone par row 'failed' hoti hai, aur failed row limit mein nahi ginti (slot wapas aata hai).
// Raw provider error, prompt aur image bytes kabhi log ya client tak nahi jaate.
// Log mein sirf error ka naam aur chhota message jaata hai (prompt ya image nahi).

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { cleanImagePrompt } from "../providers/image";
import type { InputImage } from "../providers/gemini-image";
import { isBackgroundRemoval, removeBackgroundWithCloudflare } from "../providers/cf-image";
import { CF_EDIT_MODEL, editImageWithCloudflare } from "../providers/cf-image-edit";
import { ProviderError } from "../providers/types";
import { signedDownloadUrl, uploadObject } from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

const ROUTE = "/api/image-chat/edit";
// Chat mein edit ka kharcha rupees mein (estimate). Image banane ke barabar hi maana hai.
const EDIT_COST_INR_ESTIMATE = 3.5;
const EDIT_FEATURE = "image";
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

  const mimeType = match[1] as InputImage["mimeType"];
  return {
    image: { mimeType, base64: match[2] },
    prompt: parsed.prompt,
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

// Usage: feature 'image', ek hi baar (request_id unique).
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

// Poora edit flow. Har failure par row 'failed' hoti hai, aur user ko saaf message.
async function editImage(
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
  const title = Array.from(prompt).slice(0, TITLE_CHARS).join("");
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
    // Sab edit Cloudflare Workers AI par (free tier). Background hatana: bria. Baaki: FLUX.2 klein.
    const edited = isBackgroundRemoval(prompt)
      ? await removeBackgroundWithCloudflare(
          env,
          `data:${body.image.mimeType};base64,${body.image.base64}`,
        )
      : await editImageWithCloudflare(env, { prompt, image: body.image });

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
    if (err instanceof ProviderError) {
      throw new ApiError("provider_unavailable");
    }
    throw err;
  }
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

    return await editImage(request, env, config, db, ctx, traceId, execCtx);
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