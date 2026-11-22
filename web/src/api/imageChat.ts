// Sthamly AI web: chat mein tasveer bhejne ka API. Sirf login user.
// Worker: POST /api/image-chat/edit. intent: "ask" (sawal, text jawab), "edit" (tasveer badlo), "remove_bg" (background hatao).

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

export type ImageIntent = "ask" | "edit" | "remove_bg";

// Worker jawab ka shape. "ask" mein file और download_url null होते हैं, सिर्फ़ text आता है।
export interface ImageChatResult {
  file: {
    id: string;
    kind: "image";
    title: string;
    mime_type: string;
    size_bytes: number;
    status: "ready";
  } | null;
  download_url: string | null;
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

// Tasveer (data URL) aur prompt bhejta hai. intent ke hisaab se text jawab ya edit ki hui tasveer milti hai.
export async function editImageInChat(
  token: string,
  input: { imageDataUrl: string; prompt: string; intent: ImageIntent; signal?: AbortSignal },
): Promise<ImageChatResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/image-chat/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: input.imageDataUrl, prompt: input.prompt, intent: input.intent }),
      signal: input.signal,
    });
  } catch {
    throw new ApiClientError("internal", "नेटवर्क में दिक्कत है। दोबारा कोशिश करें।", true, null);
  }

  if (!res.ok) throw await errorFrom(res);

  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.request_id !== "string") {
    throw new ApiClientError("internal", "जवाब समझ नहीं आया। दोबारा कोशिश करें।", true, null);
  }

  const text = typeof body.text === "string" && body.text.length > 0 ? body.text : null;
  const downloadUrl = typeof body.download_url === "string" ? body.download_url : null;

  if (input.intent === "ask" && text === null) {
    throw new ApiClientError("internal", "जवाब समझ नहीं आया। दोबारा कोशिश करें।", true, null);
  }
  if (input.intent !== "ask" && downloadUrl === null) {
    throw new ApiClientError("internal", "जवाब समझ नहीं आया। दोबारा कोशिश करें।", true, null);
  }

  return {
    file: isRecord(body.file) ? (body.file as unknown as ImageChatResult["file"]) : null,
    download_url: downloadUrl,
    text,
    request_id: body.request_id,
  };
}