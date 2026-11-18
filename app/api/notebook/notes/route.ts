import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface Session {
  userId: string;
  supabase: DbClient;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  // खोज: शीर्षक और सामग्री में
  q: z.string().trim().min(1).max(200).optional(),
  // एक tag से छानना
  tag: z.string().trim().toLowerCase().min(1).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

const createSchema = z.object({
  // "chat" = चैट के जवाब से, "manual" = हाथ से लिखा
  kind: z.enum(["chat", "manual"]).default("manual"),
  title: z.string().trim().min(1).max(200).optional(),
  question: z.string().trim().min(1).max(4000).nullable().optional(),
  content: z.string().trim().min(1).max(50000),
  // चैट से हो तो उस बातचीत की id (RLS से जांची जाएगी)
  threadId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  pinned: z.boolean().optional(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * user और उसका DB client पहचानें:
 * 1. Android app: Authorization: Bearer <token> (client भी उसी token से बनता है)
 * 2. Web app: login cookie
 */
async function sessionFor(req: NextRequest): Promise<Session | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("notebook notes: bearer check failed", error);
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

// tags: छोटे अक्षर, खाली जगह हटे, दोहराव नहीं
function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const set = new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0));
  return [...set].slice(0, 10);
}

// शीर्षक न दिया हो तो सवाल या जवाब की पहली लाइन से
function titleFrom(title: string | undefined, question: string | null | undefined, content: string): string {
  if (title && title.trim()) return title.trim().slice(0, 200);
  const base = (question && question.trim()) || content.split("\n")[0] || "बिना नाम";
  return base.trim().slice(0, 60);
}

// ---- सूची ----

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    return withCors(await handleList(req), origin);
  } catch (error) {
    console.error("notebook notes: list unexpected", error);
    return withCors(errorResponse(500, "INTERNAL", "नोट्स नहीं खुल पाए, दोबारा कोशिश करें"), origin);
  }
}

async function handleList(req: NextRequest): Promise<NextResponse> {
  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "खोज सही नहीं है");
  const { q, tag, limit } = parsed.data;

  // पिन किए नोट पहले, फिर सबसे नए बदले हुए (RLS से सिर्फ़ अपने)
  let query = session.supabase
    .from("notebook_notes")
    .select("id, kind, thread_id, title, question, content, tags, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit ?? DEFAULT_LIMIT);

  if (q) {
    // Full text खोज: शीर्षक और सामग्री दोनों में, migration 0012 के 'simple' config से मेल
    query = query.textSearch("search", q, { type: "websearch", config: "simple" });
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("notebook notes: list failed", error);
    return errorResponse(500, "READ_FAILED", "नोट्स नहीं खुल पाए");
  }

  return NextResponse.json({ notes: data ?? [] });
}

// ---- नया नोट ----

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleCreate(req);
  } catch (error) {
    console.error("notebook notes: create unexpected", error);
    res = errorResponse(500, "INTERNAL", "नोट सेव नहीं हो पाया, दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

async function handleCreate(req: NextRequest): Promise<NextResponse> {
  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "सही जानकारी भेजें");
  }
  const body = parsed.data;

  const { data, error } = await session.supabase
    .from("notebook_notes")
    .insert({
      user_id: session.userId,
      kind: body.kind,
      thread_id: body.threadId ?? null,
      title: titleFrom(body.title, body.question, body.content),
      question: body.question ?? null,
      content: body.content,
      tags: cleanTags(body.tags),
      pinned: body.pinned ?? false,
    })
    .select("id, kind, thread_id, title, question, content, tags, pinned, created_at, updated_at")
    .single();

  if (error) {
    console.error("notebook notes: insert failed", error);
    // thread_id किसी और की बातचीत का हो तो RLS/FK यहां पकड़ में आएगा
    return errorResponse(500, "INSERT_FAILED", "नोट सेव नहीं हो पाया");
  }

  return NextResponse.json({ note: data }, { status: 201 });
}