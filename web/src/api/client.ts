// Sthamly AI web: Worker API client (Blueprint 3.0, section 6 aur 10)
// Har request login token ke saath jaati hai (token caller deta hai, yahan store nahi hota).
// Chat streaming SSE se padhi jaati hai: delta, done, error. Baaki sab simple JSON.
// Worker ke error codes fixed hain. Unknown code 'internal' ban jaata hai.
// Raw server ya provider text console mein nahi, sirf code aur request id.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

const ERROR_CODES = [
  "unauthenticated",
  "rate_limited",
  "budget_exceeded",
  "plan_required",
  "provider_unavailable",
  "tool_denied",
  "invalid_request",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const FALLBACK_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: "पहले लॉग-इन करें।",
  rate_limited: "थोड़ी देर बाद कोशिश करें।",
  budget_exceeded: "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या टॉप-अप करें।",
  plan_required: "यह सुविधा आपके प्लान में नहीं है।",
  provider_unavailable: "अभी AI सेवा उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें।",
  tool_denied: "यह कार्रवाई अनुमति नहीं है।",
  invalid_request: "अनुरोध सही नहीं है।",
  internal: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
};

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(code: ErrorCode, message: string, retryable: boolean, requestId: string | null) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

function toErrorCode(value: unknown): ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : "internal";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Worker ka error body padhta hai: { error: { code, message, retryable, request_id } }.
// Body galat ho to 'internal'.
async function errorFromResponse(res: Response): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const inner = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = toErrorCode(inner?.code);
  const message =
    inner && typeof inner.message === "string" && inner.message.length > 0
      ? inner.message
      : FALLBACK_MESSAGE[code];
  const retryable = inner && typeof inner.retryable === "boolean" ? inner.retryable : false;
  const requestId = inner && typeof inner.request_id === "string" ? inner.request_id : null;

  return new ApiClientError(code, message, retryable, requestId);
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// Ek JSON request. Non-2xx par ApiClientError.
async function requestJson<T>(
  path: string,
  opts: {
    token: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(opts.token), Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError("internal", FALLBACK_MESSAGE.internal, true, null);
  }

  if (!res.ok) throw await errorFromResponse(res);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------
// Types (Worker ke response shapes se match karte hain)
// ---------------------------------------------------------------

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  finish_reason: string | null;
  created_at: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatDoneMeta {
  request_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  finish_reason: "stop" | "length" | "tool_calls" | "error";
}

export interface ProfileView {
  display_name: string | null;
  avatar_url: string | null;
  language: "hi" | "hinglish" | "en";
  history_enabled: boolean;
  memory_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  profile: ProfileView;
  plan: {
    name: string;
    status: "active" | "past_due" | "cancelled";
    daily_tokens: number;
    max_output_tokens: number;
  };
}

export interface UsageResponse {
  today: { tokens_used: number; tokens_limit: number; tokens_remaining: number };
  last_30_days: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    by_feature: Record<string, number>;
    truncated: boolean;
  };
}

// ---------------------------------------------------------------
// Chat streaming
// ---------------------------------------------------------------

export interface StreamChatInput {
  message: string;
  conversationId: string | null;
  // History sirf tab bheji jaati hai jab user ne history band rakhi ho.
  history?: ChatTurn[];
  // Har send ke liye naya key: retry ka double usage nahi banta.
  idempotencyKey: string;
}

export interface StreamChatHandlers {
  onDelta: (text: string) => void;
  onDone: (meta: ChatDoneMeta) => void;
}

// SSE block ek event hota hai: "event: <name>" aur "data: <json>" lines, phir khaali line.
// Lines ":" se shuru ho to comment (keep-alive) hai, use chhod dete hain.
function parseSseBlock(block: string): { name: string; data: string } | null {
  let name = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    if (rawLine.length === 0 || rawLine.startsWith(":")) continue;
    if (rawLine.startsWith("event:")) {
      name = rawLine.slice(6).trim();
    } else if (rawLine.startsWith("data:")) {
      dataLines.push(rawLine.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return { name, data: dataLines.join("\n") };
}

// Stream ko chunks mein padhta hai. Adhoore block agle chunk tak rukte hain.
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (name: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(block);
        if (parsed) onEvent(parsed.name, parsed.data);
      }
    }

    buffer += decoder.decode();
    const tail = parseSseBlock(buffer);
    if (tail) onEvent(tail.name, tail.data);
  } finally {
    reader.releaseLock();
  }
}

function parseJsonSafe(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Chat bhejta hai aur reply stream karta hai. Resolve hone par conversation id milta hai.
// Abort (user ne band kiya) par AbortError throw hota hai, caller use chhod sakta hai.
export async function streamChat(
  token: string,
  input: StreamChatInput,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<{ conversationId: string | null }> {
  const payload: Record<string, unknown> = {
    message: input.message,
    conversation_id: input.conversationId,
  };
  if (input.history) payload.history = input.history;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError("internal", FALLBACK_MESSAGE.internal, true, null);
  }

  // Galat connection par JSON error aata hai (stream nahi), isliye yahin rok lete hain.
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) {
    throw new ApiClientError("internal", FALLBACK_MESSAGE.internal, true, null);
  }

  const conversationId = res.headers.get("X-Conversation-Id");
  let finished = false;
  let streamError: ApiClientError | null = null;

  await consumeSse(res.body, (name, data) => {
    if (streamError) return;
    const parsed = parseJsonSafe(data);
    const obj = isRecord(parsed) ? parsed : {};

    if (name === "delta") {
      if (typeof obj.text === "string") handlers.onDelta(obj.text);
      return;
    }
    if (name === "done") {
      finished = true;
      handlers.onDone(obj as unknown as ChatDoneMeta);
      return;
    }
    if (name === "error") {
      const code = toErrorCode(obj.code);
      const message =
        typeof obj.message === "string" && obj.message.length > 0
          ? obj.message
          : FALLBACK_MESSAGE[code];
      streamError = new ApiClientError(
        code,
        message,
        obj.retryable === true,
        typeof obj.request_id === "string" ? obj.request_id : null,
      );
    }
    // tool_call aur confirm_required abhi nahi chalte (Phase 3 mein aayenge).
  });

  if (streamError) throw streamError;
  if (!finished) {
    throw new ApiClientError("internal", "जवाब अधूरा रह गया। दोबारा कोशिश करें।", true, null);
  }

  return { conversationId };
}

// ---------------------------------------------------------------
// Profile, usage aur history
// ---------------------------------------------------------------

export function getProfile(token: string, signal?: AbortSignal): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>("/api/user/profile", { token, method: "GET", signal });
}

export function updateProfile(
  token: string,
  patch: Partial<Pick<ProfileView, "display_name" | "language" | "history_enabled" | "memory_enabled">>,
): Promise<{ profile: ProfileView }> {
  return requestJson<{ profile: ProfileView }>("/api/user/profile", {
    token,
    method: "PATCH",
    body: patch,
  });
}

export function getUsage(token: string, signal?: AbortSignal): Promise<UsageResponse> {
  return requestJson<UsageResponse>("/api/user/usage", { token, method: "GET", signal });
}

export function listConversations(
  token: string,
  opts: { limit?: number; before?: string } = {},
  signal?: AbortSignal,
): Promise<{ conversations: ConversationSummary[]; next_cursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.before !== undefined) params.set("before", opts.before);
  const query = params.toString();
  return requestJson(`/api/chat/history${query ? `?${query}` : ""}`, {
    token,
    method: "GET",
    signal,
  });
}

export function listMessages(
  token: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<{ conversation: ConversationSummary; messages: StoredMessage[] }> {
  const params = new URLSearchParams({ conversation_id: conversationId });
  return requestJson(`/api/chat/history?${params.toString()}`, {
    token,
    method: "GET",
    signal,
  });
}

export function createConversation(
  token: string,
  title?: string,
): Promise<{ conversation: ConversationSummary }> {
  return requestJson("/api/chat/history", {
    token,
    method: "POST",
    body: title !== undefined ? { title } : {},
  });
}

export function deleteConversation(
  token: string,
  conversationId: string,
): Promise<{ deleted: boolean; conversation_id: string }> {
  const params = new URLSearchParams({ conversation_id: conversationId });
  return requestJson(`/api/chat/history?${params.toString()}`, {
    token,
    method: "DELETE",
  });
}