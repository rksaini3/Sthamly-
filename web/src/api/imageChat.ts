// Sthamly AI web: chat mein tasveer edit karwane ka API. Sirf login user.
// Worker: POST /api/image-chat/edit. Jawab mein naya file ka link (download_url) aur chhota text hota hai.

import { ApiClientError, type ErrorCode } from "./client";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

const KNOWN_CODES: readonly ErrorCode[] = [
  "unauthenticated",
  "rate_limited",
  "budget_exceeded",
  "plan_required",
  "provider_unavailable",
  "tool_denied",
  "invalid_request",
  "internal",
];

const FALLBACK: Partial<Record<ErrorCode, string>> = {
  unauthenticated: "पहले लॉग-इन करें।",
  budget_exceeded: "आज की तस्वीरों की सीमा पूरी हो गई। कल फिर कोशिश करें।",
  provider_unavailable: "तस्वीर अभी नहीं बन पाई। थोड़ी देर बाद कोशिश करें।",
  invalid_request: "यह तस्वीर इस्तेमाल नहीं हो सकती।",
};

// Worker jawab ka shape: file ki jaankari, signed link, aur model ka chhota text.
export interface ImageChatResult {
  file: {
    id: string;
    kind: "image";
    title: string;
    mime_type: string;
    size_bytes: number;
    status: "ready";
  };
  download_url: string;
  text: string | null;
  request_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCode(value: unknown): ErrorCode {
  return KNOWN_CODES.find((c) => c === value) ?? "internal";
}

// Worker ka error body: { error: { code, message, retryable, request_id } }.
async function errorFrom(res: Response): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const inner = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = toCode(inner?.code);
  const message =
    inner && typeof inner.message === "string" && inner.message.length > 0
      ? inner.message
      : (FALLBACK[code] ?? `तस्वीर नहीं बन सकी। (त्रुटि ${res.status})`);
  const retryable = inner && typeof inner.retryable === "boolean" ? inner.retryable : false;
  const requestId = inner && typeof inner.request_id === "string" ? inner.request_id : null;
  return new ApiClientError(code, message, retryable, requestId);
}

// Tasveer (data URL) aur prompt bhejta hai. Jawab mein edit ki hui tasveer ka link milta hai.
export async function editImageInChat(
  token: string,
  input: { imageDataUrl: string; prompt: string },
): Promise<ImageChatResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/image-chat/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: input.imageDataUrl, prompt: input.prompt }),
    });
  } catch {
    throw new ApiClientError("internal", "नेटवर्क में दिक्कत है। दोबारा कोशिश करें।", true, null);
  }

  if (!res.ok) throw await errorFrom(res);

  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.download_url !== "string" || !isRecord(body.file)) {
    throw new ApiClientError("internal", "जवाब समझ नहीं आया। दोबारा कोशिश करें।", true, null);
  }
  return body as unknown as ImageChatResult;
}