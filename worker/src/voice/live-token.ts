// Sthamly AI Worker: Gemini Live single-use token (Blueprint 3.0, section 4)
// Worker token jaari karta hai, audio nahi chalata. App is token se seedha Gemini se judti hai.
// Token: ek hi use, chhota start window (~1 minute), session ki max length tak valid.
// Model, system prompt aur setup server par lock hote hain. App inhe badal nahi sakta.
// Daily Live minutes DB se, reserve karke. Free plan par Live band (plan_required).
// Token kabhi log nahi hota.

import { assertBudget } from "../budget";
import type { Config, Env } from "../env";
import { ApiError } from "../errors";
import type { UserContext } from "../plan";
import type { SupabaseClient } from "../supabase";

// Gemini ephemeral token endpoint. Blueprint ke hisaab se Live API v1beta par.
// Ye preview feature hai: deploy se pehle Google docs se endpoint aur response shape verify karein.
const GEMINI_AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
const TOKEN_CALL_TIMEOUT_MS = 10_000;

// Limits (seconds)
const MIN_SESSION_SECONDS = 30;
const HARD_MAX_SESSION_SECONDS = 1800;
// Token start karne ki khidki (blueprint: about 1 minute)
const START_WINDOW_SECONDS = 60;

export type LiveLanguage = "hi" | "hinglish" | "en";

// System prompt har turn par billed hota hai, isliye chhota rakha hai (blueprint 4).
const LIVE_SYSTEM_PROMPTS: Record<LiveLanguage, string> = {
  hi: "आप Sthamly AI हैं, छोटे दुकानदारों के लिए सहायक। छोटे, सरल वाक्यों में सरल हिंदी में बोलें। जो न पता हो, साफ़ कहें।",
  hinglish:
    "You are Sthamly AI, an assistant for small shopkeepers. Speak simple Hinglish in short sentences. If you do not know something, say so.",
  en: "You are Sthamly AI, an assistant for small shopkeepers. Speak simple English in short sentences. If you do not know something, say so.",
};

export interface LiveSetup {
  model: string;
  generationConfig: { responseModalities: ["AUDIO"] };
  systemInstruction: { parts: Array<{ text: string }> };
  // Blueprint 4: compression aur session resumption hamesha on
  contextWindowCompression: { slidingWindow: Record<string, never> };
  sessionResumption: Record<string, never>;
}

// Server par lock hone wala setup. Gemini ko model ka naam "models/" ke saath chahiye.
export function buildLiveSetup(model: string, language: LiveLanguage): LiveSetup {
  return {
    model: model.startsWith("models/") ? model : `models/${model}`,
    generationConfig: { responseModalities: ["AUDIO"] },
    systemInstruction: { parts: [{ text: LIVE_SYSTEM_PROMPTS[language] }] },
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: {},
  };
}

// Requested seconds ko limits mein rakhta hai.
// Return 0 ka matlab: aaj ka Live time bacha hi nahi, ya cap itna chhota hai ki session na ban sake.
export function clampLiveSeconds(
  requested: number | null,
  remainingDailySeconds: number,
  perSessionCap: number,
): number {
  const ceiling = Math.min(remainingDailySeconds, perSessionCap, HARD_MAX_SESSION_SECONDS);
  if (ceiling < MIN_SESSION_SECONDS) return 0;
  const wanted = requested === null ? ceiling : Math.floor(requested);
  return Math.max(MIN_SESSION_SECONDS, Math.min(wanted, ceiling));
}

export interface LiveTokenResult {
  sessionId: string;
  token: string;
  model: string;
  maxSeconds: number;
  // Is time tak session shuru karna zaroori hai, warna token expire.
  startBy: string;
  // Session ki max life. Iske baad token kaam nahi karta.
  expiresAt: string;
}

interface VoiceSessionRow {
  id: string;
}

interface TokenRequestBody {
  uses: number;
  expiresAt: string;
  startBy: string;
  setup: LiveSetup;
}

interface TokenResponse {
  name?: unknown;
}

// Gemini se single-use token maangta hai. Koi bhi failure par ApiError.
async function requestEphemeralToken(env: Env, body: TokenRequestBody): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GEMINI_AUTH_TOKENS_URL, {
      method: "POST",
      headers: {
        // Key header mein, URL mein nahi (logs mein na aaye)
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uses: body.uses,
        expireTime: body.expiresAt,
        newSessionExpireTime: body.startBy,
        bidiGenerateContentSetup: body.setup,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Status code sirf log mein. Body nahi (usme key ya setup ka hissa ho sakta hai).
    console.error(JSON.stringify({ event: "live_token_failed", status: res.status }));
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError("provider_unavailable");
  }

  let parsed: TokenResponse;
  try {
    parsed = (await res.json()) as TokenResponse;
  } catch {
    throw new ApiError("provider_unavailable");
  }

  if (typeof parsed.name !== "string" || parsed.name.length === 0) {
    throw new ApiError("provider_unavailable");
  }
  return parsed.name;
}

// Aaj ke reserved aur used Live seconds (DB function: open session ka max, band ka asli time).
async function readLiveSecondsToday(db: SupabaseClient, userId: string): Promise<number> {
  const used = await db.rpc<number | null>("live_seconds_today", { p_user: userId });
  return typeof used === "number" ? used : 0;
}

// Main entry: plan, budget aur daily time check karke session reserve karta hai, phir token jaari karta hai.
export async function issueLiveToken(
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  opts: { requestedSeconds: number | null; language: LiveLanguage },
): Promise<LiveTokenResult> {
  if (ctx.plan.dailyLiveMinutes <= 0) {
    throw new ApiError("plan_required");
  }

  await assertBudget(env, db, config, {
    feature: "voice_live",
    isFreePlan: ctx.plan.plan === "free",
  });

  const usedToday = await readLiveSecondsToday(db, ctx.userId);
  const remaining = ctx.plan.dailyLiveMinutes * 60 - usedToday;
  const maxSeconds = clampLiveSeconds(
    opts.requestedSeconds,
    remaining,
    config.liveMaxSecondsPerSession,
  );
  if (maxSeconds === 0) {
    throw new ApiError(
      "budget_exceeded",
      "आज का लाइव समय पूरा हो गया है। पुश-टू-टॉक से बात जारी रख सकते हैं।",
    );
  }

  // Pehle session reserve karte hain, taaki ye time daily cap mein gin jaaye.
  const rows = await db.insert<VoiceSessionRow>("voice_sessions", {
    user_id: ctx.userId,
    mode: "live",
    model: config.liveModel,
    status: "open",
    max_seconds: maxSeconds,
  });
  const session = rows[0];
  if (!session) throw new ApiError("internal");

  const now = Date.now();
  const expiresAt = new Date(now + maxSeconds * 1000).toISOString();
  const startBy = new Date(now + START_WINDOW_SECONDS * 1000).toISOString();
  const setup = buildLiveSetup(config.liveModel, opts.language);

  let token: string;
  try {
    token = await requestEphemeralToken(env, { uses: 1, expiresAt, startBy, setup });
  } catch (err) {
    // Token nahi bana: reserve hua time wapas (failed session cap mein nahi ginta).
    await db
      .update("voice_sessions", `id=eq.${session.id}`, {
        status: "failed",
        ended_at: new Date().toISOString(),
      })
      .catch(() => undefined);
    throw err;
  }

  return {
    sessionId: session.id,
    token,
    model: setup.model,
    maxSeconds,
    startBy,
    expiresAt,
  };
}