// Sthamly AI web: Vite environment types (Blueprint 3.0, section 11)
// Sirf VITE_ prefix wale PUBLIC variables yahan declare hote hain.
// Yahan secret kabhi nahi: service role key, Groq, Gemini, encryption key Worker mein rehte hain.

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase project ka URL aur anon key (public, RLS ke andar safe)
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // Worker API ka base URL. Khaali ho to same origin par /api jaata hai (dev proxy ke saath).
  readonly VITE_API_BASE?: string;

  // Sirf dev mein: vite.config.ts ka proxy kis Worker par jaaye
  readonly VITE_WORKER_DEV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}