// Sthamly AI Worker: entry point (Blueprint 3.0, section 3, 6, 9, 11)
// Routes:
//   GET    /health                       uptime monitor (bina secret ke, sirf ok ya degraded)
//   POST   /api/ai/chat                  streaming chat, logged-in user ya guest (routes/chat.ts)
//   *      /api/chat/history             conversations (routes/history.ts)
//   *      /api/user/*                   profile, usage, export, delete (routes/user.ts)
//   POST   /api/voice/session            Live session token (routes/voice.ts)
//   POST   /api/voice/session/:id/end    Live session band (routes/voice.ts)
//   POST   /api/voice/turn               push-to-talk audio -> transcript (routes/voice.ts)
// CORS: sirf ALLOWED_ORIGINS wale origins. Baaki origins ko koi ACAO header nahi jaata.
// Capacitor (Android) ke origins ALLOWED_ORIGINS mein hone chahiye, jaise https://localhost.
// Scheduled: har 15 minute budget check, taaki alert traffic ke bina bhi chale.

import { budgetStatus } from "./budget";
import { loadConfig, type Config, type Env } from "./env";
import { ApiError, toErrorResponse } from "./errors";
import { handleChat } from "./routes/chat";
import { handleHistory } from "./routes/history";
import { handleUser } from "./routes/user";
import { handleVoice } from "./routes/voice";
import { createSupabase } from "./supabase";

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
// X-Guest-Id: login se pehle ke guest requests ke liye (guest.ts).
const ALLOWED_HEADERS =
  "Authorization, Content-Type, Idempotency-Key, X-Language, Content-Length, X-Guest-Id";
const EXPOSED_HEADERS = "X-Request-Id, X-Conversation-Id";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

// Request ke Origin ko allowed list se milata hai. Na mile to null.
function allowedOrigin(request: Request, config: Config): string | null {
  const origin = request.headers.get("Origin");
  if (origin === null) return null;
  return config.allowedOrigins.includes(origin) ? origin : null;
}

// Response mein CORS headers jodta hai. Origin allowed na ho to response waisa hi rehta hai.
function withCors(res: Response, origin: string | null): Response {
  if (origin === null) return res;
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  headers.set("Vary", "Origin");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// Browser ka preflight (OPTIONS). Allowed origin ko hi 204 milta hai.
function preflight(origin: string | null): Response {
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": PREFLIGHT_MAX_AGE_SECONDS,
      Vary: "Origin",
    },
  });
}

// Health: sirf ye batata hai ki config theek hai. Koi secret ya detail nahi.
function health(env: Env): Response {
  try {
    loadConfig(env);
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    console.error(JSON.stringify({ event: "health_config_invalid" }));
    return new Response(JSON.stringify({ status: "degraded" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

// Cron ka kaam: budget ka haal dekhna, jisse 50/80/100% ke alert traffic ke bina bhi jaayein.
async function runBudgetCheck(env: Env): Promise<void> {
  try {
    const config = loadConfig(env);
    const db = createSupabase(env);
    const status = await budgetStatus(env, db, config);
    console.info(
      JSON.stringify({
        event: "budget_cron",
        stage: status.stage,
        percent: Math.round(status.ratio * 100),
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: "budget_cron_failed" }));
  }
}

// Path ke hisaab se route chunta hai. Voice routes ka path /api/voice/ se shuru hota hai.
function routeFor(pathname: string): "chat" | "history" | "user" | "voice" | null {
  if (pathname === "/api/ai/chat") return "chat";
  if (pathname === "/api/chat/history") return "history";
  if (pathname.startsWith("/api/user/")) return "user";
  if (pathname.startsWith("/api/voice/")) return "voice";
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health config load se pehle, taaki config galat hone par bhi uptime monitor ko jawab mile.
    if (url.pathname === "/health" && request.method === "GET") {
      return health(env);
    }

    const traceId = crypto.randomUUID();

    let config: Config;
    try {
      config = loadConfig(env);
    } catch {
      console.error(JSON.stringify({ event: "config_invalid", request_id: traceId }));
      return toErrorResponse(new ApiError("internal"), traceId);
    }

    const origin = allowedOrigin(request, config);

    if (request.method === "OPTIONS") {
      return preflight(origin);
    }

    try {
      let response: Response;

      switch (routeFor(url.pathname)) {
        case "chat":
          response = await handleChat(request, env, ctx);
          break;
        case "history":
          response = await handleHistory(request, env);
          break;
        case "user":
          response = await handleUser(request, env);
          break;
        case "voice":
          response = await handleVoice(request, env, ctx);
          break;
        default:
          throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
      }

      return withCors(response, origin);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          code: err instanceof ApiError ? err.code : "internal",
          request_id: traceId,
        }),
      );
      return withCors(toErrorResponse(err, traceId), origin);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBudgetCheck(env));
  },
} satisfies ExportedHandler<Env>;