/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Vercel वाला API का पता, जैसे https://sthamly.com (build से पहले set करें)
  readonly VITE_API_BASE: string;
  // Supabase project का URL, जैसे https://xxxx.supabase.co
  readonly VITE_SUPABASE_URL: string;
  // Supabase की anon (public) key। service role key यहाँ कभी नहीं।
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}