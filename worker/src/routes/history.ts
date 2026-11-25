// Sthamly AI Worker — chat history routes (Blueprint 3.0, section 6 "Conversations")
// GET    /api/chat/history                        conversations ki list (naya pehle, cursor se paginate)
// GET    /api/chat/history?conversation_id=<id>   ek conversation ke messages
// POST   /api/chat/history                        nayi khaali conversation banao
// DELETE /api/chat/history?conversation_id=<id>   conversation delete (messages cascade se jaate hain)
// Har query user_id se filter hoti hai. Ownership pehle check hoti hai.
// History band ho to list khaali aati hai, aur baaki routes 'invalid_request' dete hain.
// Delete hamesha allowed hai: user apna data hata sakta hai.

import { authenticate, type AuthUser } from "../auth";
import type { Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext } from "../plan";
import { createSupabase, type SupabaseClient } from "../supabase";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const MAX_MESSAGES = 200;
const TITLE_CHARS = 40;
const DEFAULT_TITLE = "नई बातचीत";
const MAX_TITLE_BODY_BYTES = 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  finish_reason: string | null;
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

// ?limit=  1 se 50 ke beech, default 30.
function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) throw invalid();
  return n;
}

// ?before=  pichhle page ka cursor (ISO time). Galat format par invalid.
function parseBefore(url: URL): string | null {
  const raw = url.searchParams.get("before");
  if (raw === null) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) throw invalid();
  return new Date(t).toISOString();
}

function parseConversationId(url: URL): string {
  const raw = url.searchParams.get("conversation_id");
  if (raw === null || !UUID_RE.test(raw)) throw invalid();
  return raw.toLowerCase();
}

// Conversation us user ki hi hai ya nahi. Nahi to 'nahi mili' (kisi aur ka data nahi dikhta).
async function ownConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const rows = await db.select<ConversationRow>(
    "conversations",
    `id=eq.${conversationId}&user_id=eq.${userId}&select=id,title,created_at,updated_at`,
  );
  const row = rows[0];
  if (!row) throw invalid("बातचीत नहीं मिली।");
  return row;
}

// Conversations ki list. Ek extra row mangte hain, taaki pata chale aur page hai ya nahi.
async function listConversations(
  db: SupabaseClient,
  userId: string,
  limit: number,
  before: string | null,
): Promise<Response> {
  const beforeFilter = before !== null ? `&updated_at=lt.${encodeURIComponent(before)}` : "";
  const rows = await db.select<ConversationRow>(
    "conversations",
    `user_id=eq.${userId}${beforeFilter}` +
      `&select=id,title,created_at,updated_at` +
      `&order=updated_at.desc&limit=${limit + 1}`,
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return json({
    conversations: page,
    next_cursor: hasMore && last ? last.updated_at : null,
  });
}

// Ek conversation ke messages. Sabse naye 200 lekar purane se naye ke order mein dikhaate hain.
async function listMessages(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<Response> {
  const conversation = await ownConversation(db, userId, conversationId);
  const rows = await db.select<MessageRow>(
    "messages",
    `conversation_id=eq.${conversationId}` +
      `&select=id,role,content,provider,model,finish_reason,created_at` +
      // role.asc: ek hi time ki user + assistant rows mein assistant pehle aata hai,
      // reverse ke baad user pehle dikhta hai.
      `&order=created_at.desc,role.asc&limit=${MAX_MESSAGES}`,
  );

  return json({
    conversation,
    messages: rows.reverse(),
  });
}

// Body optional hai. Title na ho to default. Title 40 characters tak.
async function readTitle(request: Request): Promise<string> {
  const raw = await request.text();
  if (raw.trim() === "") return DEFAULT_TITLE;

  if (new TextEncoder().encode(raw).byteLength > MAX_TITLE_BODY_BYTES) throw invalid();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed)) throw invalid();

  const title = parsed.title;
  if (title === undefined || title === null) return DEFAULT_TITLE;
  if (typeof title !== "string") throw invalid();

  const trimmed = title.trim();
  if (trimmed.length === 0) return DEFAULT_TITLE;
  return Array.from(trimmed).slice(0, TITLE_CHARS).join("");
}

async function createConversation(
  request: Request,
  db: SupabaseClient,
  userId: string,
): Promise<Response> {
  const title = await readTitle(request);
  const rows = await db.insert<ConversationRow>("conversations", {
    user_id: userId,
    title,
  });
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return json({ conversation: row }, 201);
}

// Pehle ownership check, phir delete. Dono filter mein user_id hai (double safety).
async function deleteConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<Response> {
  await ownConversation(db, userId, conversationId);
  await db.delete<ConversationRow>(
    "conversations",
    `id=eq.${conversationId}&user_id=eq.${userId}`,
  );
  return json({ deleted: true, conversation_id: conversationId });
}

// Log mein sirf code aur request id. Title, message ya user data kabhi nahi.
function logHistoryFailure(requestId: string, err: unknown): void {
  const code = err instanceof ApiError ? err.code : "internal";
  console.error(JSON.stringify({ event: "history_request_failed", code, request_id: requestId }));
}

export async function handleHistory(request: Request, env: Env): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const user: AuthUser = await authenticate(request, env);
    const db = createSupabase(env);
    const userCtx = await loadUserContext(db, user);
    const url = new URL(request.url);

    switch (request.method) {
      case "GET": {
        const hasConversationId = url.searchParams.has("conversation_id");
        if (!hasConversationId) {
          if (!userCtx.historyEnabled) return json({ conversations: [], next_cursor: null });
          return await listConversations(db, user.id, parseLimit(url), parseBefore(url));
        }
        if (!userCtx.historyEnabled) throw invalid("इतिहास बंद है।");
        return await listMessages(db, user.id, parseConversationId(url));
      }

      case "POST": {
        if (!userCtx.historyEnabled) throw invalid("इतिहास बंद है।");
        return await createConversation(request, db, user.id);
      }

      case "DELETE": {
        return await deleteConversation(db, user.id, parseConversationId(url));
      }

      default:
        throw invalid();
    }
  } catch (err) {
    logHistoryFailure(traceId, err);
    return toErrorResponse(err, traceId);
  }
}