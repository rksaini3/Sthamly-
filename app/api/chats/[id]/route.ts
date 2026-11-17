import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

const patchSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => v.pinned !== undefined || v.title !== undefined, { message: "कुछ बदलने को दें" });

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface Session {
  userId: string;
  supabase: DbClient;
}

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * user और उसका DB client पहचानें:
 * 1. Android app: Authorization: Bearer <token>
 * 2. Web app: login cookie (पुराना तरीका)
 */
async function sessionFor(req: NextRequest): Promise<Session | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("chat id: bearer check failed", error);
    return null;
  });

  if (bearer) {
    const env = getPublicEnv();
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return { userId: bearer.id, supabase: supabase as unknown as DbClient };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, supabase } : null;
}

// इस बातचीत की वे मंज़ूरियां जो अभी pending हैं (समय सीमा के अंदर)।
// विफल हो तो खाली सूची: संदेश फिर भी खुलने चाहिए।
async function pendingActionsFor(threadId: string, session: Session) {
  try {
    const { data: runs, error: runsError } = await session.supabase
      .from("agent_runs")
      .select("id")
      .eq("thread_id", threadId)
      .eq("user_id", session.userId)
      .eq("status", "waiting_confirm")
      .order("created_at", { ascending: false })
      .limit(10);
    if (runsError) throw runsError;

    const runIds = (runs ?? []).map((r) => r.id);
    if (runIds.length === 0) return [];

    const { data: actions, error: actionsError } = await session.supabase
      .from("agent_actions")
      .select("id, tool, summary, expires_at")
      .eq("user_id", session.userId)
      .in("run_id", runIds)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    if (actionsError) throw actionsError;

    return (actions ?? []).map((a) => ({
      id: a.id,
      tool: a.tool,
      summary: a.summary,
      expiresAt: a.expires_at,
    }));
  } catch (error) {
    console.error("chat read: pending actions failed", error);
    return [];
  }
}

// एक बातचीत के संदेश, उसकी जानकारी और pending मंज़ूरियां। सिर्फ़ अपनी बातचीत: RLS से।
export async function GET(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return withCors(errorResponse(400, "BAD_ID", "बातचीत नहीं मिली"), origin);

  const session = await sessionFor(req);
  if (!session) return withCors(errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें"), origin);

  // 1. बातचीत मिलती है या नहीं (RLS: दूसरे की बातचीत यहां नहीं मिलेगी)
  const { data: thread, error: threadError } = await session.supabase
    .from("chat_threads")
    .select("id, title, pinned, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (threadError) {
    console.error("chat read: thread failed", threadError);
    return withCors(errorResponse(500, "READ_FAILED", "इतिहास नहीं खुल पाया"), origin);
  }
  if (!thread) return withCors(errorResponse(404, "NOT_FOUND", "बातचीत नहीं मिली"), origin);

  // 2. संदेश पुराने से नए क्रम में
  const { data: rows, error: msgError } = await session.supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgError) {
    console.error("chat read: messages failed", msgError);
    return withCors(errorResponse(500, "READ_FAILED", "संदेश नहीं खुल पाए"), origin);
  }

  // 3. अभी की pending मंज़ूरियां
  const pendingActions = await pendingActionsFor(id, session);

  return withCors(
    NextResponse.json({
      chat: thread,
      messages: (rows ?? []).map((r) => ({
        role: r.role,
        content: r.content,
        createdAt: r.created_at,
      })),
      pendingActions,
    }),
    origin,
  );
}

// पिन करना या नाम बदलना
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return withCors(errorResponse(400, "BAD_ID", "बातचीत नहीं मिली"), origin);

  const session = await sessionFor(req);
  if (!session) return withCors(errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें"), origin);

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return withCors(errorResponse(400, "VALIDATION_FAILED", "सही जानकारी भेजें"), origin);

  // RLS से सिर्फ़ अपनी बातचीत बदलती है; दूसरे की id पर कोई row नहीं मिलेगी
  const { data, error: dbError } = await session.supabase
    .from("chat_threads")
    .update(body.data)
    .eq("id", id)
    .select("id, title, pinned, updated_at")
    .maybeSingle();

  if (dbError) {
    console.error("chat update failed", dbError);
    return withCors(errorResponse(500, "UPDATE_FAILED", "बदलाव सेव नहीं हो पाया"), origin);
  }
  if (!data) return withCors(errorResponse(404, "NOT_FOUND", "बातचीत नहीं मिली"), origin);
  return withCors(NextResponse.json({ chat: data }), origin);
}

// बातचीत हटाना (संदेश पहले हटते हैं, फिर बातचीत)।
// पहले जांचते हैं कि बातचीत इसी user की है, फिर admin client से हटाते हैं।
// Admin client पर RLS लागू नहीं होता, इसलिए हर delete में user_id का फ़िल्टर ज़रूरी है।
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return withCors(errorResponse(400, "BAD_ID", "बातचीत नहीं मिली"), origin);

  const session = await sessionFor(req);
  if (!session) return withCors(errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें"), origin);
  const { userId, supabase } = session;

  // 1. मालिकाना हक़ की जांच
  const { data: owned, error: ownError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownError) {
    console.error("chat delete: ownership check failed", ownError);
    return withCors(errorResponse(500, "DELETE_FAILED", "हटाया नहीं जा सका"), origin);
  }
  if (!owned) return withCors(errorResponse(404, "NOT_FOUND", "बातचीत नहीं मिली"), origin);

  // 2. संदेश हटाएं (thread_id की जांच ऊपर हो चुकी है)
  const admin = createSupabaseAdminClient();
  const { error: msgError } = await admin.from("chat_messages").delete().eq("thread_id", id);
  if (msgError) {
    console.error("chat delete: messages delete failed", msgError);
    return withCors(errorResponse(500, "DELETE_FAILED", "हटाया नहीं जा सका"), origin);
  }

  // 3. बातचीत हटाएं, और जांचें कि सच में कोई row हटी
  const { data: removed, error: threadError } = await admin
    .from("chat_threads")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (threadError) {
    console.error("chat delete: thread delete failed", threadError);
    return withCors(errorResponse(500, "DELETE_FAILED", "हटाया नहीं जा सका"), origin);
  }
  if (!removed || removed.length === 0) {
    // कुछ नहीं हटा: यह "हटा दिया" नहीं है, इसलिए गड़बड़ बताएं
    return withCors(errorResponse(500, "DELETE_FAILED", "हटाया नहीं जा सका"), origin);
  }

  return withCors(NextResponse.json({ ok: true }), origin);
}