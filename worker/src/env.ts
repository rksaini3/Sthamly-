// Sthamly AI Worker: typed environment (Blueprint 3.0 section 11, Blueprint 4.0 image)
// Secrets: `wrangler secret put` se set hote hain. Vars: wrangler.toml mein.

export interface Env {
  // ---- Vars (wrangler.toml) ----
  ENVIRONMENT: "local" | "dev" | "production";
  SUPABASE_URL: string;
  ALLOWED_ORIGINS: string;            // comma-separated
  LIVE_MODEL: string;                 // server config, app mein kabhi nahi
  IMAGE_MODEL: string;                // image banane ka Gemini model, server config
  DAILY_BUDGET_INR: string;           // number as string, loadConfig se number banega
  LIVE_MAX_SECONDS_PER_SESSION: string;

  // ---- KV (wrangler.toml) ----
  STATE: KVNamespace;                 // circuit breaker, budget counters, guest counters

  // ---- Secrets (wrangler secret put) ----
  SUPABASE_SERVICE_ROLE_KEY: string;
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
  CRON_SECRET: string;
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
export function assertSecretsPresent(env: Env): void {
  const required = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "TOKEN_ENCRYPTION_KEY",
    "CRON_SECRET",
  ] as const;

  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing secrets: ${missing.join(", ")}`);
  }
}