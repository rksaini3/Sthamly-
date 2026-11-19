// Sthamly AI web: creation API client (Blueprint 4.0, ek creation flow)
// Chaar types: image, slides, website, document. Sab ek hi endpoint /api/create par.
// Sirf login user. Token zaroori hai (guest ko banane ki ijazat nahi).
// Download link Worker se aata hai (1 ghanta). Web kabhi Supabase storage ko seedha nahi chhoota.
// Website ka preview sandbox iframe mein hoga (CreatePage mein), yahan sirf HTML lautana.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export const CREATE_KINDS = ["image", "slides", "website", "document"] as const;
export type CreateKind = (typeof CREATE_KINDS)[number];

export const KIND_LABELS: Record<CreateKind, string> = {
  image: "तस्वीर",
  slides: "प्रेज़ेंटेशन",
  website: "वेबसाइट",
  document: "दस्तावेज़",
};

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
  unauthenticated: "बनाने के लिए पहले लॉग-इन करें।",
  rate_limited: "थोड़ी देर बाद कोशिश करें।",
  budget_exceeded: "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।",
  plan_required: "यह सुविधा आपके प्लान में नहीं है।",
  provider_unavailable: "अभी बन नहीं पा रहा। थोड़ी देर बाद कोशिश करें।",
  tool_denied: "यह कार्रवाई अनुमति नहीं है।",
  invalid_request: "अनुरोध सही नहीं है।",
  internal: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
};

export class CreateApiError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "CreateApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type CreateStatus = "pending" | "ready" | "failed";

export interface CreatedFile {
  id: string;
  kind: CreateKind;
  status: CreateStatus;
  title: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string;
}

export interface CreateResult {
  file: CreatedFile;
  download_url: string;
  request_id: string;
}

export interface CreateInput {
  kind: CreateKind;
  prompt: string;
  // Khaali ho to Worker prompt se title banata hai.
  title?: string;
  // Har baar naya key. Retry par dobara banana aur dobara paisa nahi lagta.
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function toErrorCode(value: unknown): ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : "internal";
}

// Worker ka error body: { error: { code, message, retryable } }. Galat ho to 'internal'.
async function errorFrom(res: Response): Promise<CreateApiError> {
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

  return new CreateApiError(code, message, retryable);
}

// Ek JSON request. Non-2xx par CreateApiError. Network fail par 'internal' (retry layak).
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
    throw new CreateApiError("internal", FALLBACK_MESSAGE.internal, true);
  }

  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

// Nayi cheez banata hai. Lamba time lag sakta hai (slides, website: kuch dekar minute tak).
// UI mein progress dikhayein, aur Stop ke liye signal dein.
export function createFile(
  token: string,
  input: CreateInput,
  signal?: AbortSignal,
): Promise<CreateResult> {
  return requestJson<CreateResult>("/api/create", {
    token,
    method: "POST",
    body: {
      kind: input.kind,
      prompt: input.prompt,
      ...(input.title !== undefined ? { title: input.title } : {}),
    },
    headers: { "Idempotency-Key": input.idempotencyKey },
    signal,
  });
}

// Meri files (failed aur hatai hui ke bina), naye pehle.
export function listFiles(
  token: string,
  signal?: AbortSignal,
): Promise<{ files: CreatedFile[] }> {
  return requestJson<{ files: CreatedFile[] }>("/api/create", {
    token,
    method: "GET",
    signal,
  });
}

// Signed download link. Har download ya preview se pehle naya lein, kyunki 1 ghante mein expire hota hai.
export async function getDownloadUrl(
  token: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await requestJson<{ download_url: string }>(`/api/create/${fileId}/url`, {
    token,
    method: "GET",
    signal,
  });
  return res.download_url;
}

// Meri file hatao. Worker database row aur storage object dono hatata hai.
export function deleteFile(
  token: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<{ deleted: boolean; file_id: string }> {
  return requestJson<{ deleted: boolean; file_id: string }>(`/api/create/${fileId}`, {
    token,
    method: "DELETE",
    signal,
  });
}

// Website aur slides ka preview: HTML text chahiye (sandbox iframe ke srcdoc mein dalne ke liye).
// Signed link se HTML fetch karte hain. Link Supabase ka hai, isliye ye browser se seedha fetch hota hai.
export async function fetchHtmlPreview(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    throw new CreateApiError("internal", FALLBACK_MESSAGE.internal, true);
  }
  return res.text();
}

// Document (markdown) ka text: same tarah signed link se.
export const fetchTextFile = fetchHtmlPreview;

// Download: signed link browser mein naye tab ya download ke roop mein kholta hai.
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

// Extension file type se: slides aur website html, document md, image uske mime se.
export function extensionFor(kind: CreateKind, mimeType: string | null): string {
  if (kind === "document") return "md";
  if (kind === "slides" || kind === "website") return "html";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}