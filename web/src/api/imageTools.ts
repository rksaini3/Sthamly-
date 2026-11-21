// Sthamly AI web: tasveer ke tools ka API (background hatana). Sirf login user.
// Worker: POST /api/image-tools/remove-background. Jawab seedha PNG hota hai, koi JSON nahi.

import { ApiClientError, type ErrorCode } from "./client";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

const FALLBACK: Record<string, string> = {
  unauthenticated: "पहले लॉग-इन करें।",
  rate_limited: "आज की सीमा पूरी हो गई। कल फिर कोशिश करें।",
  budget_exceeded: "अभी सेवा व्यस्त है। थोड़ी देर बाद कोशिश करें।",
  invalid_request: "यह तस्वीर इस्तेमाल नहीं हो सकती।",
};

function toCode(value: unknown): ErrorCode {
  const known: ErrorCode[] = [
    "unauthenticated",
    "rate_limited",
    "budget_exceeded",
    "plan_required",
    "provider_unavailable",
    "tool_denied",
    "invalid_request",
    "internal",
  ];
  return known.find((c) => c === value) ?? "internal";
}

// Worker ka error body: { error: { code, message, retryable, request_id } }.
async function errorFrom(res: Response): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const inner =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error: unknown }).error
      : null;
  const obj = typeof inner === "object" && inner !== null ? (inner as Record<string, unknown>) : null;
  const code = toCode(obj?.code);
  const message =
    obj && typeof obj.message === "string" && obj.message.length > 0
      ? obj.message
      : (FALLBACK[code] ?? `फ़ोटो नहीं बदली जा सकी। (त्रुटि ${res.status})`);
  const retryable = obj && typeof obj.retryable === "boolean" ? obj.retryable : false;
  const requestId = obj && typeof obj.request_id === "string" ? obj.request_id : null;
  return new ApiClientError(code, message, retryable, requestId);
}

// Data URL (JPEG/PNG/WEBP) bhejta hai, aur background hata kar PNG Blob wapas laata hai.
export async function removeBackground(token: string, imageDataUrl: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/image-tools/remove-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: imageDataUrl }),
    });
  } catch {
    throw new ApiClientError("internal", "नेटवर्क में दिक्कत है। दोबारा कोशिश करें।", true, null);
  }

  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}