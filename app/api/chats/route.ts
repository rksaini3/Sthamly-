import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

// बातचीतों की सूची: पिन की हुई पहले, फिर सबसे नई
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const supabase = await dbClientFor(req);
  if (!supabase) {
    return withCors(
      NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 }),
      origin,
    );
  }

  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, title, pinned, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("chats list failed", error);
    return withCors(
      NextResponse.json({ error: { code: "LIST_FAILED", message: "इतिहास नहीं खुल पाया" } }, { status: 500 }),
      origin,
    );
  }
  return withCors(NextResponse.json({ chats: data ?? [] }), origin);
}

/**
 * Login जांचें और उसी user के token वाला DB client लौटाएं।
 * 1. Android app: Authorization: Bearer <token>
 * 2. Web app: login cookie (पुराना तरीका)
 * login न हो तो null।
 */
async function dbClientFor(req: NextRequest): Promise<DbClient | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("chats: bearer check failed", error);
    return null;
  });

  if (bearer) {
    const env = getPublicEnv();
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // type में फ़र्क है, पर runtime पर वही API है
    return client as unknown as DbClient;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}