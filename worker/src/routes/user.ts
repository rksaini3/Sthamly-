// Sthamly AI Worker — user routes (Blueprint 3.0, section 6 "User" aur section 9 "Privacy")
// GET    /api/user/profile   profile aur plan ka haal
// PATCH  /api/user/profile   naam, bhasha, history aur memory ka toggle (addition: RLS mein user ko ye allowed hai)
// GET    /api/user/usage     aaj ka token use aur pichhle 30 din ka summary (cost user ko nahi dikhta)
// GET    /api/user/export    user ka poora data JSON mein (DPDP export)
// DELETE /api/user/data      conversations aur messages hatana (account nahi, sirf data)
// Har query user_id se filter hoti hai. user_id hamesha login token se aata hai, body se nahi.

import { authenticate, type AuthUser } from "../auth";
import type { Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { createSupabase, type SupabaseClient } from "../supabase";

const MAX_BODY_BYTES = 4 * 1024;
const MAX_DISPLAY_NAME_CHARS = 60;
const USAGE_WINDOW_DAYS = 30;
const USAGE_ROW_LIMIT = 5000;
const EXPORT_CONVERSATION_LIMIT = 1000;
const EXPORT_MESSAGE_LIMIT = 10000;
const DELETE_CONFIRM_TEXT = "DELETE_MY_DATA";
const LANGUAGES = ["hi", "hinglish", "en"] as const;

type Language = (typeof LANGUAGES)[number];

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  language: Language;
  history_enabled: boolean;
  memory_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageExportRow {
  id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  finish_reason: string | null;
  created_at: string;
  conversations?: unknown;
}

interface UsageRow {
  feature: string;
  input_tokens: number;
  output_tokens: number;
}

interface UsageExportRow {
  feature: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

interface SubscriptionRow {
  plan: string;
  status: string;
  current_period_end: string | null;
}

function invalid(message?: string): ApiError {
  return new ApiError("invalid_request", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    },
  });
}

// JSON body padhta hai. Size, content type aur shape check karta hai.
async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
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
  if (!isRecord(parsed)) throw invalid();
  return parsed;
}

// Profile row user ke apne data ke roop mein. Plan ki jaankari loadUserContext se aati hai.
// Row na mile to log mein sirf event jaata hai (user id nahi).
async function readProfile(db: SupabaseClient, userId: string): Promise<ProfileRow> {
  const rows = await db.select<ProfileRow>(
    "profiles",
    `user_id=eq.${userId}&select=user_id,display_name,avatar_url,language,history_enabled,memory_enabled,created_at,updated_at`,
  );
  const row = rows[0];
  if (!row) {
    console.error(JSON.stringify({ event: "profile_row_missing" }));
    throw new ApiError("internal");
  }
  return row;
}

function profileView(row: ProfileRow): Record<string, unknown> {
  return {
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    language: row.language,
    history_enabled: row.history_enabled,
    memory_enabled: row.memory_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/user/profile
async function getProfile(db: SupabaseClient, ctx: UserContext): Promise<Response> {
  const row = await readProfile(db, ctx.userId);
  return json({
    profile: profileView(row),
    plan: {
      name: ctx.plan.plan,
      status: ctx.subscriptionStatus,
      daily_tokens: ctx.plan.dailyTokens,
      max_output_tokens: ctx.plan.maxOutputTokens,
    },
  });
}

// Body se sirf allowed fields uthaata hai. Baaki fields (plan, user_id, etc.) chupchaap nahi jaate: error.
function parseProfilePatch(body: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["display_name", "language", "history_enabled", "memory_enabled"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw invalid("यह फ़ील्ड बदला नहीं जा सकता।");
  }

  const patch: Record<string, unknown> = {};

  if ("display_name" in body) {
    const value = body.display_name;
    if (value === null) {
      patch.display_name = null;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (Array.from(trimmed).length > MAX_DISPLAY_NAME_CHARS) {
        throw invalid(`नाम ${MAX_DISPLAY_NAME_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`);
      }
      patch.display_name = trimmed.length === 0 ? null : trimmed;
    } else {
      throw invalid();
    }
  }

  if ("language" in body) {
    if (!isLanguage(body.language)) throw invalid();
    patch.language = body.language;
  }

  if ("history_enabled" in body) {
    if (typeof body.history_enabled !== "boolean") throw invalid();
    patch.history_enabled = body.history_enabled;
  }

  if ("memory_enabled" in body) {
    if (typeof body.memory_enabled !== "boolean") throw invalid();
    patch.memory_enabled = body.memory_enabled;
  }

  if (Object.keys(patch).length === 0) {
    throw invalid("बदलने के लिए कुछ नहीं दिया गया।");
  }

  patch.updated_at = new Date().toISOString();
  return patch;
}

// PATCH /api/user/profile
async function updateProfile(
  request: Request,
  db: SupabaseClient,
  ctx: UserContext,
): Promise<Response> {
  const patch = parseProfilePatch(await readJsonBody(request));
  const rows = await db.update<ProfileRow>("profiles", `user_id=eq.${ctx.userId}`, patch);
  if (rows.length === 0) throw new ApiError("internal");
  return json({ profile: profileView(rows[0] as ProfileRow) });
}

// GET /api/user/usage
// Cost ka hisaab yahan nahi dikhata: woh internal hai (blueprint 7).
async function getUsage(db: SupabaseClient, ctx: UserContext): Promise<Response> {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<UsageRow>(
    "usage_logs",
    `user_id=eq.${ctx.userId}` +
      `&created_at=gte.${encodeURIComponent(since)}` +
      `&select=feature,input_tokens,output_tokens` +
      `&limit=${USAGE_ROW_LIMIT}`,
  );

  let inputTokens = 0;
  let outputTokens = 0;
  const byFeature: Record<string, number> = {};
  for (const row of rows) {
    inputTokens += row.input_tokens;
    outputTokens += row.output_tokens;
    byFeature[row.feature] = (byFeature[row.feature] ?? 0) + 1;
  }

  const used = ctx.tokensUsedToday;
  const limit = ctx.plan.dailyTokens;

  return json({
    today: {
      tokens_used: used,
      tokens_limit: limit,
      tokens_remaining: Math.max(0, limit - used),
    },
    last_30_days: {
      requests: rows.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      by_feature: byFeature,
      truncated: rows.length >= USAGE_ROW_LIMIT,
    },
  });
}

// GET /api/user/export
// Sab data ek JSON mein. Sensitive internal fields (cost, provider keys, tokens) isme nahi hain.
async function exportData(
  db: SupabaseClient,
  ctx: UserContext,
  user: AuthUser,
): Promise<Response> {
  const profile = await readProfile(db, ctx.userId);

  const subscriptions = await db.select<SubscriptionRow>(
    "subscriptions",
    `user_id=eq.${ctx.userId}&select=plan,status,current_period_end`,
  );

  const conversationRows = await db.select<ConversationRow>(
    "conversations",
    `user_id=eq.${ctx.userId}` +
      `&select=id,title,created_at,updated_at` +
      `&order=created_at.asc&limit=${EXPORT_CONVERSATION_LIMIT + 1}`,
  );
  const conversationsTruncated = conversationRows.length > EXPORT_CONVERSATION_LIMIT;
  const conversations = conversationRows.slice(0, EXPORT_CONVERSATION_LIMIT);

  // Messages ko conversations ke zariye filter kiya jaata hai (embedded !inner join).
  const messageRows = await db.select<MessageExportRow>(
    "messages",
    `select=id,role,content,provider,model,input_tokens,output_tokens,finish_reason,created_at,conversations!inner(user_id)` +
      `&conversations.user_id=eq.${ctx.userId}` +
      `&order=created_at.asc&limit=${EXPORT_MESSAGE_LIMIT + 1}`,
  );
  const messagesTruncated = messageRows.length > EXPORT_MESSAGE_LIMIT;
  const messages = messageRows.slice(0, EXPORT_MESSAGE_LIMIT).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    provider: m.provider,
    model: m.model,
    input_tokens: m.input_tokens,
    output_tokens: m.output_tokens,
    finish_reason: m.finish_reason,
    created_at: m.created_at,
  }));

  const usage = await db.select<UsageExportRow>(
    "usage_logs",
    `user_id=eq.${ctx.userId}` +
      `&select=feature,provider,model,input_tokens,output_tokens,created_at` +
      `&order=created_at.asc&limit=${EXPORT_MESSAGE_LIMIT}`,
  );

  const exportedAt = new Date().toISOString();
  const payload = {
    exported_at: exportedAt,
    account: { user_id: user.id, email: user.email },
    profile: profileView(profile),
    subscription: subscriptions[0] ?? null,
    conversations,
    messages,
    usage,
    truncated: {
      conversations: conversationsTruncated,
      messages: messagesTruncated,
    },
  };

  const fileDate = exportedAt.slice(0, 10);
  return json(payload, 200, {
    "Content-Disposition": `attachment; filename="sthamly-export-${fileDate}.json"`,
  });
}

// DELETE /api/user/data
// Conversations hatate hain, messages cascade se jaate hain. Account aur billing rows nahi.
// Usage logs aur payment records accounting aur law ke liye rakhe jaate hain (blueprint 12).
async function deleteData(
  request: Request,
  db: SupabaseClient,
  ctx: UserContext,
  requestId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (body.confirm !== DELETE_CONFIRM_TEXT) {
    throw invalid(`पुष्टि के लिए "${DELETE_CONFIRM_TEXT}" भेजें।`);
  }

  const deleted = await db.delete<ConversationRow>(
    "conversations",
    `user_id=eq.${ctx.userId}&select=id`,
  );

  // Log mein sirf count aur request id. Naam, title ya message kabhi nahi.
  console.info(
    JSON.stringify({
      event: "user_data_deleted",
      conversations_deleted: deleted.length,
      request_id: requestId,
    }),
  );

  return json({
    deleted: true,
    conversations_deleted: deleted.length,
    kept: ["usage_logs", "payments", "invoices"],
  });
}

// Main entry: path ke hisaab se route chunta hai.
export async function handleUser(request: Request, env: Env): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const user = await authenticate(request, env);
    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/api/user/profile") {
      if (method === "GET") return await getProfile(db, ctx);
      if (method === "PATCH") return await updateProfile(request, db, ctx);
      throw invalid();
    }

    if (pathname === "/api/user/usage") {
      if (method === "GET") return await getUsage(db, ctx);
      throw invalid();
    }

    if (pathname === "/api/user/export") {
      if (method === "GET") return await exportData(db, ctx, user);
      throw invalid();
    }

    if (pathname === "/api/user/data") {
      if (method === "DELETE") return await deleteData(request, db, ctx, traceId);
      throw invalid();
    }

    throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    // Asli error ka naam bhi log mein jaata hai, taaki pata chale kahan fail hua. Message nahi.
    const errorName = err instanceof Error ? err.name : "non_error";
    console.error(
      JSON.stringify({ event: "user_request_failed", code, error_name: errorName, request_id: traceId }),
    );
    return toErrorResponse(err, traceId);
  }
}