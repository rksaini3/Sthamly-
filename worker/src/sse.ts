// Sthamly AI Worker — Server-Sent Events encoder (Blueprint 3.0, section 6)
// Event names fixed hain: delta, tool_call, confirm_required, done, error.
// Provider ka raw output yahan se nahi jaata, sirf in shapes mein.

import type { ApiErrorBody, ErrorCode } from "./errors";
import { ApiError } from "./errors";

export type SseEvent =
  | { event: "delta"; data: { text: string } }
  | {
      event: "tool_call";
      data: { tool: string; connector: string | null; status: "started" | "finished" | "failed" };
    }
  | {
      event: "confirm_required";
      data: { action_id: string; tool: string; connector: string; arguments: Record<string, unknown> };
    }
  | {
      event: "done";
      data: {
        request_id: string;
        provider: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        finish_reason: "stop" | "length" | "tool_calls" | "error";
      };
    }
  | {
      event: "error";
      data: { code: ErrorCode; message: string; retryable: boolean; request_id?: string };
    };

const encoder = new TextEncoder();

// Ek event ko SSE format mein likhta hai: "event: <name>\ndata: <json>\n\n"
export function encodeEvent(ev: SseEvent): Uint8Array {
  const payload = JSON.stringify(ev.data);
  return encoder.encode(`event: ${ev.event}\ndata: ${payload}\n\n`);
}

// Comment line. Connection zinda rakhne ke liye (proxies idle connection kaat dete hain).
export function encodeKeepAlive(): Uint8Array {
  return encoder.encode(`: keep-alive\n\n`);
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};

// Streaming response banata hai. Writer ko route pass karta hai.
// Writer ke andar koi bhi error aaye to 'error' event jaata hai, stream band hoti hai.
export function createSseResponse(
  run: (send: (ev: SseEvent) => Promise<void>) => Promise<void>,
  requestId: string,
): Response {
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  let closed = false;

  const send = async (ev: SseEvent): Promise<void> => {
    if (closed) return;
    await writer.write(encodeEvent(ev));
  };

  const keepAlive = setInterval(() => {
    if (!closed) void writer.write(encodeKeepAlive()).catch(() => {});
  }, 15_000);

  void (async () => {
    try {
      await run(send);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError("internal");
      // Raw error log hoga (agle step mein observability se), client ko sirf safe shape jaayega.
      await send({
        event: "error",
        data: {
          code: apiErr.code,
          message: apiErr.message,
          retryable: apiErr.retryable,
          request_id: requestId,
        },
      }).catch(() => {});
    } finally {
      closed = true;
      clearInterval(keepAlive);
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: { ...SSE_HEADERS, "X-Request-Id": requestId },
  });
}

// Type ke liye helper: ApiErrorBody ka shape SSE error se match karta hai ya nahi.
export type SseErrorData = Extract<SseEvent, { event: "error" }>["data"];
export type { ApiErrorBody };