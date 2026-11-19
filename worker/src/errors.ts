// Sthamly AI Worker — fixed error contract (Blueprint 3.0, section 6)
// Client ko kabhi raw provider (Groq / Gemini / Supabase) error nahi jaata.
// Har error ka code fixed hai. App har code ka alag, saaf message dikhata hai.

export const ERROR_CODES = [
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

// HTTP status har code ke liye fixed hai.
const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  rate_limited: 429,
  budget_exceeded: 402,
  plan_required: 403,
  provider_unavailable: 503,
  tool_denied: 403,
  invalid_request: 400,
  internal: 500,
};

// Kaun se codes dobara try karne layak hain.
const RETRYABLE: Record<ErrorCode, boolean> = {
  unauthenticated: false,
  rate_limited: true,
  budget_exceeded: false,
  plan_required: false,
  provider_unavailable: true,
  tool_denied: false,
  invalid_request: false,
  internal: false,
};

// Hindi message app dikhayega. Yeh server par bhi default hai, client chahe to apna rakhe.
const MESSAGE_HI: Record<ErrorCode, string> = {
  unauthenticated: "पहले लॉग-इन करें।",
  rate_limited: "थोड़ी देर बाद कोशिश करें।",
  budget_exceeded: "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या टॉप-अप करें।",
  plan_required: "यह सुविधा आपके प्लान में नहीं है।",
  provider_unavailable: "अभी AI सेवा उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें।",
  tool_denied: "यह कार्रवाई अनुमति नहीं है।",
  invalid_request: "अनुरोध सही नहीं है।",
  internal: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    request_id?: string;
  };
}

// Gateway ke andar throw karne ke liye. Route ise pakad kar JSON error bhejega.
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? MESSAGE_HI[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.retryable = RETRYABLE[code];
  }
}

// Kisi bhi unknown error ko safe response mein badalta hai.
// Raw message client ko nahi jaata, sirf 'internal' code.
export function toErrorResponse(err: unknown, requestId?: string): Response {
  const apiErr =
    err instanceof ApiError ? err : new ApiError("internal");

  const body: ApiErrorBody = {
    error: {
      code: apiErr.code,
      message: apiErr.message,
      retryable: apiErr.retryable,
      ...(requestId ? { request_id: requestId } : {}),
    },
  };

  return new Response(JSON.stringify(body), {
    status: apiErr.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Type guard: provider ka error app tak jaane se pehle yahin normalize hota hai.
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}