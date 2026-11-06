import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// सिर्फ server पर (webhook, worker, billing)। RLS bypass करता है।
// इसे किसी "use client" file में import न करें।
export function createSupabaseAdminClient() {
  const env = getPublicEnv();
  const server = getServerEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    server.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}