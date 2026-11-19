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

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.uuid();

// जो बदलना हो वही भेजें। कम से कम एक चीज़ ज़रूरी है।
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    question: z.string().trim().max(4000).nullable().optional(),
    content: z.string().trim().min(1).max(50000).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    pinned: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.question !== undefined ||
      v.content !== undefined ||
      v.tags !== undefined ||
      v.pinned !== undefined,
    { message: "कुछ बदलने को दें" },
  );

const SELECT_COLUMNS = "id, kind, thread_id, title, question, content, tags, pinned, created_at, updated_at";

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
 * 2. Web app: login cookie
 */
async function sessionFor(req: NextRequest): Promise<Session | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("notebook note: bearer check failed", error);
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
function cleanTags(tags: string[]): string[] {
  const set = new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0));
  return [...set].slice(0, 10);
}

// ---- एक नोट पढ़ना ----

export async function GET(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleGet(req, ctx);
  } catch (error) {
    console.error("notebook note: get unexpected", error);
    res = errorResponse(500, "INTERNAL", "नोट नहीं खुल पाया");
  }
  return withCors(res, origin);
}

async function handleGet(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "नोट नहीं मिला");

  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  const { data, error } = await session.supabase
    .from("notebook_notes")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("notebook note: get failed", error);
    return errorResponse(500, "READ_FAILED", "नोट नहीं खुल पाया");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "नोट नहीं मिला");
  return NextResponse.json({ note: data });
}

// ---- बदलना (शीर्षक, सवाल, सामग्री, tags, pin) ----

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handlePatch(req, ctx);
  } catch (error) {
    console.error("notebook note: patch unexpected", error);
    res = errorResponse(500, "INTERNAL", "बदलाव सेव नहीं हो पाया, दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

async function handlePatch(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "नोट नहीं मिला");

  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "सही जानकारी भेजें");
  }
  const body = parsed.data;

  // सिर्फ़ भेजे गए फ़ील्ड बदलें
  const patch: {
    title?: string;
    question?: string | null;
    content?: string;
    tags?: string[];
    pinned?: boolean;
  } = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.question !== undefined) patch.question = body.question;
  if (body.content !== undefined) patch.content = body.content;
  if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
  if (body.pinned !== undefined) patch.pinned = body.pinned;

  // RLS: दूसरे का नोट यहां नहीं मिलेगा, इसलिए update भी नहीं होगा
  const { data, error } = await session.supabase
    .from("notebook_notes")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("notebook note: update failed", error);
    return errorResponse(500, "UPDATE_FAILED", "बदलाव सेव नहीं हो पाया");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "नोट नहीं मिला");
  return NextResponse.json({ note: data });
}

// ---- हटाना (सिर्फ़ इस नोट को, चैट या बाकी नोट पर असर नहीं) ----

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleDelete(req, ctx);
  } catch (error) {
    console.error("notebook note: delete unexpected", error);
    res = errorResponse(500, "INTERNAL", "नोट हटाया नहीं जा सका");
  }
  return withCors(res, origin);
}

async function handleDelete(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "नोट नहीं मिला");

  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // RLS से सिर्फ़ अपना नोट हटेगा। हटा तो id लौटेगी, नहीं तो नोट नहीं मिला।
  const { data, error } = await session.supabase
    .from("notebook_notes")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("notebook note: delete failed", error);
    return errorResponse(500, "DELETE_FAILED", "नोट हटाया नहीं जा सका");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "नोट नहीं मिला");
  return NextResponse.json({ ok: true, id: data.id });
}