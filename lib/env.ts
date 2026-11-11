import { z } from "zod";

// env सिर्फ तभी validate होगा जब getServerEnv() पहली बार बुलाया जाए।
// इससे build के समय missing keys से crash नहीं होगा।
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  FAL_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_TEXT_MODEL: z.string().optional(),
  GROQ_VOICE_MODEL: z.string().optional(),
  // एडमिन के Supabase user id (UUID), कॉमा से अलग। केवल Vercel में सेट करें।
  ADMIN_USER_IDS: z.string().optional(),
  MAX_COST_PAISE_PER_JOB: z.coerce.number().int().positive().default(1500),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(2),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cachedServer: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedServer ??= serverSchema.parse(process.env);
  return cachedServer;
}

export function getPublicEnv(): PublicEnv {
  // NEXT_PUBLIC_ वाले variables को Next.js build में सीधे पढ़ना ज़रूरी है
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}