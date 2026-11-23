// Sthamly AI Worker: typed environment (Blueprint 3.0 section 11, Blueprint 4.0 image)
// Secrets: `wrangler secret put` se set hote hain. Vars: wrangler.toml mein.

export interface Env {
  // ---- Vars (wrangler.toml) ----
  ENVIRONMENT: "local" | "dev" | "production";
  SUPABASE_URL: string;
  ALLOWED_ORIGINS: string;            // comma-separated
  LIVE_MODEL: string;                 // server config, app mein kabhi nahi
  IMAGE_MODEL: string;                // image banane ka model (Cloudflare Workers AI), server config
  DAILY_BUDGET_INR: string;           // number as string, loadConfig se number banega
  LIVE_MAX_SECONDS_PER_SESSION: string;

  // ---- KV (wrangler.toml) ----
  STATE: KVNamespace;                 // circuit breaker, budget counters, guest counters

  // ---- Secrets (wrangler secret put) ----
  SUPABASE_SERVICE_ROLE_KEY: string;
  GROQ_API_KEY: string;
  // GEMINI_API_KEY: type mein string rakha hai taaki purane Gemini code type-safe rahe. Runtime par ye khaali ho sakta hai:
  // billing ke baad hi zaroori hai, aur sirf us call par check hota hai jo ise use karta hai. Startup par nahi.
  GEMINI_API_KEY: string;
  OPENROUTER_API_KEY?: string;        // free vision (tasveer se sawal). Missing ho to saaf error, crash nahi.
  TAVILY_API_KEY?: string;            // live search (train, hotel, khabar). Missing ho to live search band, chat chalti rahti hai.
  TOKEN_ENCRYPTION_KEY: string;
  CRON_SECRET: string;

  // ---- WhatsApp OTP login (optional: sirf tab chahiye jab phone login chalu ho) ----
  SUPABASE_AUTH_HOOK_SECRET?: string; // Supabase Send SMS hook ka secret (v1,whsec_...)
  WHATSAPP_TOKEN?: string;            // Meta permanent access token
  WHATSAPP_PHONE_NUMBER_ID?: string;  // Meta WhatsApp phone number ID
  WHATSAPP_OTP_TEMPLATE?: string;     // approved authentication template ka naam
  WHATSAPP_OTP_LANG?: string;         // template ki language code, jaise "en" ya "hi"
}

// Parsed, typed config jo baaki code use karega.
export interface Config {
  environment: Env["ENVIRONMENT"];
  supabaseUrl: string;
  allowedOrigins: string[];
  liveModel: string;
  imageModel: string;
  dailyBudgetInr: number;
  liveMaxSecondsPerSession: number;
}

// Required vars ko check karke typed config banata hai.
// Agar koi value galat ho to request se pehle hi saaf error milta hai.
export function loadConfig(env: Env): Config {
  const dailyBudgetInr = Number(env.DAILY_BUDGET_INR);
  if (!Number.isFinite(dailyBudgetInr) || dailyBudgetInr <= 0) {
    throw new Error("DAILY_BUDGET_INR must be a positive number");
  }

  const liveMaxSeconds = Number(env.LIVE_MAX_SECONDS_PER_SESSION);
  if (!Number.isFinite(liveMaxSeconds) || liveMaxSeconds <= 0) {
    throw new Error("LIVE_MAX_SECONDS_PER_SESSION must be a positive number");
  }

  if (!env.IMAGE_MODEL || env.IMAGE_MODEL.trim().length === 0) {
    throw new Error("IMAGE_MODEL must be set in wrangler.toml");
  }

  if (!env.SUPABASE_URL.startsWith("https://") && env.ENVIRONMENT !== "local") {
    throw new Error("SUPABASE_URL must use https outside local");
  }

  return {
    environment: env.ENVIRONMENT,
    supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ""),
    allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    liveModel: env.LIVE_MODEL,
    imageModel: env.IMAGE_MODEL.trim(),
    dailyBudgetInr,
    liveMaxSecondsPerSession: liveMaxSeconds,
  };
}

// Secrets ki presence check. Value kabhi log nahi hoti, sirf naam.
// GEMINI_API_KEY aur WhatsApp wale secrets is list mein nahi: unki zaroorat sirf unke call par padegi.
export function assertSecretsPresent(env: Env): void {
  const required = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROQ_API_KEY",
    "TOKEN_ENCRYPTION_KEY",
    "CRON_SECRET",
  ] as const;

  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing secrets: ${missing.join(", ")}`);
  }
}