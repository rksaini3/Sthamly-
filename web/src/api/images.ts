// Sthamly AI web: image API client (Blueprint 4.0, Phase 1, image banana)
// Sirf login user. Token zaroori hai (guest ke liye image nahi, Blueprint section 4).
// Image banana, list, download link (1 ghante wala signed link Worker se), aur delete.
// Web kabhi Supabase storage ko seedha nahi chhoota. Sab Worker ke zariye.
// Worker ke error codes wahi hain jo api/client.ts mein hain: unknown code 'internal' ban jaata hai.

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

type ErrorCode = (typeof ERROR_CODES)[number];

const FALLBACK_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: "पहले लॉग-इन करें।",
  rate_limited: "थोड़ी देर बाद कोशिश करें।",
  budget_exceeded: "आज की सीमा पूरी हो गई। कल फिर कोशिश करें।",
  plan_required: "यह सुविधा आपके प्लान में नहीं है।",
  provider_unavailable: "अभी तस्वीर नहीं बन पा रही। थोड़ी देर बाद कोशिश करें।",
  tool_denied: "यह कार्रवाई अनुमति नहीं है।",
  invalid_request: "अनुरोध सही नहीं है।",
  internal: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
};

export class ImageApiError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "ImageApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type ImageStatus = "pending" | "ready" | "failed";

export interface ImageFile {
  id: string;
  kind: "image";
  status: ImageStatus;
  title: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string;
}

export interface CreateImageResult {
  file: ImageFile;
  download_url: string;
  request_id: string;
}

export interface CreateImageInput {
  prompt: string;
  title?: string;
  // Har bار naya key: retry par Gemini dobara nahi chalta, aur paisa dobara nahi lagta.
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorCode(value: unknown): ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : "internal";
}

// Worker ka error body: { error: { code, message, retryable } }. Galat ho to 'internal'.
async function errorFrom(res: Response): Promise<ImageApiError> {
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
  const retryable = inner !== null && inner.retryable === true;

  return new ImageApiError(code, message, retryable);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// Ek JSON request. Non-2xx par ImageApiError.
async function requestJson<T>(
  path: string,
  opts: {
    token: string;
    method: "GET" | "POST" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
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
    throw new ImageApiError("internal", FALLBACK_MESSAGE.internal, true);
  }

  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

// Nayi image banata hai. Ek hi call, jo poora flow Worker par chalata hai.
// Lamba time lag sakta hai (kuch seconds), isliye UI mein loading dikhayein.
export function createImage(
  token: string,
  input: CreateImageInput,
  signal?: AbortSignal,
): Promise<CreateImageResult> {
  return requestJson<CreateImageResult>("/api/images", {
    token,
    method: "POST",
    body: {
      prompt: input.prompt,
      ...(input.title !== undefined ? { title: input.title } : {}),
    },
    headers: { "Idempotency-Key": input.idempotencyKey },
    signal,
  });
}

// User ki sari images (failed ke bina). Naya pehle.
export function listImages(
  token: string,
  signal?: AbortSignal,
): Promise<{ files: ImageFile[] }> {
  return requestJson<{ files: ImageFile[] }>("/api/images", {
    token,
    method: "GET",
    signal,
  });
}

// Signed download link lene ke liye. Link 1 ghante mein expire hota hai,
// isliye dekhne ya download se pehle naya link maangein.
export async function getDownloadUrl(
  token: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await requestJson<{ download_url: string }>(`/api/images/${fileId}/url`, {
    token,
    method: "GET",
    signal,
  });
  return res.download_url;
}

// Image hatana. Worker database row aur storage object dono hatata hai.
export function deleteImage(
  token: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<{ deleted: boolean; file_id: string }> {
  return requestJson<{ deleted: boolean; file_id: string }>(`/api/images/${fileId}`, {
    token,
    method: "DELETE",
    signal,
  });
}

// Download: link lekar browser mein naye tab mein kholta hai (signed link, koi header nahi chahiye).
export async function openDownload(token: string, fileId: string, filename: string): Promise<void> {
  const url = await getDownloadUrl(token, fileId);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}