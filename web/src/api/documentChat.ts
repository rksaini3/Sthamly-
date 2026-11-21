// Sthamly AI web: chat mein PDF bhejne ka API. Sirf login user.
// Worker: POST /api/document-chat/ask. Jawab mein AI ka text hota hai (sawal ka jawab ya summary).

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
  rate_limited: "आज PDF के सवालों की सीमा पूरी हो गई। कल फिर कोशिश करें।",
  budget_exceeded: "अभी सेवा व्यस्त है। थोड़ी देर बाद कोशिश करें।",
  provider_unavailable: "PDF अभी नहीं पढ़ी जा सकी। थोड़ी देर बाद कोशिश करें।",
  invalid_request: "यह PDF इस्तेमाल नहीं हो सकी।",
};

export interface DocumentChatResult {
  text: string;
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
      : (FALLBACK[code] ?? `PDF नहीं पढ़ी जा सकी। (त्रुटि ${res.status})`);
  const retryable = inner && typeof inner.retryable === "boolean" ? inner.retryable : false;
  const requestId = inner && typeof inner.request_id === "string" ? inner.request_id : null;
  return new ApiClientError(code, message, retryable, requestId);
}

// PDF (data URL) aur prompt bhejta hai. Jawab mein AI ka text milta hai.
export async function askDocument(
  token: string,
  input: { pdfDataUrl: string; prompt: string },
): Promise<DocumentChatResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/document-chat/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pdf: input.pdfDataUrl, prompt: input.prompt }),
    });
  } catch {
    throw new ApiClientError("internal", "नेटवर्क में दिक्कत है। दोबारा कोशिश करें।", true, null);
  }

  if (!res.ok) throw await errorFrom(res);

  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.text !== "string") {
    throw new ApiClientError("internal", "जवाब समझ नहीं आया। दोबारा कोशिश करें।", true, null);
  }
  return { text: body.text, request_id: typeof body.request_id === "string" ? body.request_id : "" };
}