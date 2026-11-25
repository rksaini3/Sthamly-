// Sthamly AI web: Worker API client (Blueprint 3.0, section 6 aur 10, guest mode)
// Login hai to token jaata hai (Authorization). Nahi hai to guest ID jaati hai (X-Guest-Id).
// Guest ID browser mein ek baar banti hai aur save rehti hai. Ye secret nahi, bas pehchan hai.
// Chat streaming SSE se padhi jaati hai: delta, done, error. Baaki sab simple JSON.
// Worker ke error codes fixed hain. Unknown code 'internal' ban jaata hai.
// Raw server ya provider text kabhi console ya UI mein nahi, sirf code aur request id.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

const GUEST_ID_KEY = "sthamly_guest_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_CODES = [
  "unauthenticated",
  "rate_limited",
  "budget_exceeded",
  "credits_exhausted",
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
  credits_exhausted: "आपके क्रेडिट खत्म हो गए हैं। प्लान बदलें या बूस्टर लें।",
  plan_required: "यह सुविधा आपके प्लान में नहीं है।",
  provider_unavailable: "अभी AI सेवा उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें।",
  tool_denied: "यह कार्रवाई अनुमति नहीं है।",
  invalid_request: "अनुरोध सही नहीं है।",
  internal: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
};

// Network ही नहीं पहुंचा (इंटरनेट, API का पता, CORS): असली वजह छिपाने के बजाय साफ़ बताएं।
export const NETWORK_MESSAGE = "सर्वर से संपर्क नहीं हो पाया। इंटरनेट जांचें या थोड़ी देर बाद दोबारा कोशिश करें।";

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

// ---------------------------------------------------------------
// Guest ID
// ---------------------------------------------------------------

// Memory mein fallback, agar localStorage band ho (private mode ya kuch WebView).
let memoryGuestId: string | null = null;

// Guest ID lautata hai. Pehli baar ho to banati hai aur save karti hai.
export function getGuestId(): string {
  try {
    const saved = window.localStorage.getItem(GUEST_ID_KEY);
    if (saved !== null && UUID_RE.test(saved)) return saved;

    const fresh = crypto.randomUUID();
    window.localStorage.setItem(GUEST_ID_KEY, fresh);
    return fresh;
  } catch {
    // Storage nahi chal rahi: ek hi session ke liye memory mein rakhte hain.
    if (memoryGuestId === null) memoryGuestId = crypto.randomUUID();
    return memoryGuestId;
  }
}

// Ye error guest ke limit ya login maangne ka signal hai (Worker: unauthenticated).
export function isLoginRequired(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === "unauthenticated";
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function toErrorCode(value: unknown): ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : "internal";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
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
  // संरचित जवाब न हो (जैसे Vercel या proxy का HTML 404/502): असली status भी दिखाएं
  const message =
    inner && typeof inner.message === "string" && inner.message.length > 0
      ? inner.message
      : `${FALLBACK_MESSAGE[code]} (त्रुटि ${res.status})`;
  const retryable = inner && typeof inner.retryable === "boolean" ? inner.retryable : false;
  const requestId = inner && typeof inner.request_id === "string" ? inner.request_id : null;

  return new ApiClientError(code, message, retryable, requestId);
}

// Login wali requests ke liye token zaroori hai.
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// Ek JSON request. Non-2xx par ApiClientError.
export async function requestJson<T>(
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
    if (isAbort(err)) throw err;
    throw new ApiClientError("internal", NETWORK_MESSAGE, true, null);
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
// Chat streaming (guest ya login dono)
// ---------------------------------------------------------------

export interface StreamChatInput {
  message: string;
  // Guest ke liye hamesha null (guest ki chat server par save nahi hoti).
  conversationId: string | null;
  // History: guest ke liye zaroori (server yaad nahi rakhta). Login user ke liye sirf history off hone par.
  history?: ChatTurn[];
  // Har send ke liye naya key: retry ka double usage nahi banta.
  idempotencyKey: string;
  // Role mode. Na ho to server 'general' maanta hai.
  mode?: "general" | "shop" | "study" | "legal" | "creator";
  // Bhasha: auto ya chuni hui. Server is hisaab se jawab deta hai.
  language?: "hi" | "hinglish" | "en";
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

// Chat bhejta hai aur reply stream karta hai. Token ho to login user, nahi to guest.
// Abort (user ne roka) par AbortError throw hota hai, caller use chhod sakta hai.
export async function streamChat(
  token: string | null,
  input: StreamChatInput,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<{ conversationId: string | null }> {
  const payload: Record<string, unknown> = {
    message: input.message,
    conversation_id: input.conversationId,
  };
  if (input.history) payload.history = input.history;
  if (input.mode) payload.mode = input.mode;
  if (input.language) payload.language = input.language;

  // Login hai to token, nahi to guest ID. Dono ek saath nahi jaate.
  const identity: Record<string, string> =
    token !== null ? authHeaders(token) : { "X-Guest-Id": getGuestId() };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: {
        ...identity,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiClientError("internal", NETWORK_MESSAGE, true, null);
  }

  // Galat connection par JSON error aata hai (stream nahi), isliye yahin rok lete hain.
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) {
    throw new ApiClientError("internal", FALLBACK_MESSAGE.internal, true, null);
  }

  const conversationId = res.headers.get("X-Conversation-Id");

  // State object mein: callback ke andar badalne par TypeScript ka narrowing galat nahi hota.
  const state: { finished: boolean; error: ApiClientError | null } = {
    finished: false,
    error: null,
  };

  await consumeSse(res.body, (name, data) => {
    if (state.error !== null) return;
    const parsed = parseJsonSafe(data);
    const obj = isRecord(parsed) ? parsed : {};

    if (name === "delta") {
      if (typeof obj.text === "string") handlers.onDelta(obj.text);
      return;
    }
    if (name === "done") {
      state.finished = true;
      handlers.onDone(obj as unknown as ChatDoneMeta);
      return;
    }
    if (name === "error") {
      const code = toErrorCode(obj.code);
      const message =
        typeof obj.message === "string" && obj.message.length > 0
          ? obj.message
          : FALLBACK_MESSAGE[code];
      state.error = new ApiClientError(
        code,
        message,
        obj.retryable === true,
        typeof obj.request_id === "string" ? obj.request_id : null,
      );
    }
    // tool_call aur confirm_required abhi nahi chalte (Phase 3 mein aayenge).
  });

  if (state.error !== null) throw state.error;
  if (!state.finished) {
    throw new ApiClientError("internal", "जवाब अधूरा रह गया। दोबारा कोशिश करें।", true, null);
  }

  return { conversationId };
}

// ---------------------------------------------------------------
// Profile, usage aur history (sirf login user ke liye)
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

// ---------------------------------------------------------------
// Experts (FAB se khulne wali sheet). Endpoint na ho, net na ho ya galat jawab: khaali list.
// UI khaali list ko "अभी उपलब्ध नहीं" dikhata hai, error nahi.
// ---------------------------------------------------------------

export interface ExpertView {
  id: string;
  name: string;
  photoUrl: string | null;
  verified: boolean;
  specialty: string;
  rating: number;
  ratingCount: number;
  avgReplyMinutes: number;
  feeEstimate: string;
  // Sirf chune jaane par, consent ke baad, call ya WhatsApp ke liye. Khaali ho to button band.
  phone: string | null;
}

function isExpertView(value: unknown): value is ExpertView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.verified === "boolean" &&
    typeof v.specialty === "string" &&
    typeof v.rating === "number" &&
    typeof v.ratingCount === "number" &&
    typeof v.avgReplyMinutes === "number" &&
    typeof v.feeEstimate === "string" &&
    (typeof v.photoUrl === "string" || v.photoUrl === null) &&
    (typeof v.phone === "string" || v.phone === null)
  );
}

export async function getExperts(token: string | null, signal?: AbortSignal): Promise<ExpertView[]> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/experts`, { headers, signal });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return [];
    const list = (body as { experts?: unknown }).experts;
    return Array.isArray(list) ? list.filter(isExpertView) : [];
  } catch {
    return [];
  }
}