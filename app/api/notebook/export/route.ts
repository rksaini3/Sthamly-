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

interface Session {
  userId: string;
  supabase: DbClient;
}

const EXPORT_LIMIT = 5000;

const KIND_HI: Record<string, string> = {
  chat: "चैट से",
  poster: "पोस्टर",
  manual: "हाथ से लिखा",
};

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
    console.error("notebook export: bearer check failed", error);
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

// CSV में एक खाना: quotes और नई लाइन सही तरीके से
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// तारीख YYYY-MM-DD, भारत के समय के हिसाब से
function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    return withCors(await handleExport(req), origin);
  } catch (error) {
    console.error("notebook export: unexpected error", error);
    return withCors(
      NextResponse.json({ error: { code: "INTERNAL", message: "फ़ाइल नहीं बन पाई, दोबारा कोशिश करें" } }, { status: 500 }),
      origin,
    );
  }
}

async function handleExport(req: NextRequest): Promise<NextResponse> {
  const session = await sessionFor(req);
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  // 1. सिर्फ़ नोट (RLS से सिर्फ़ इसी user के), पुराने से नए क्रम में
  const { data, error } = await session.supabase
    .from("notebook_notes")
    .select("kind, title, question, content, tags, created_at")
    .order("created_at", { ascending: true })
    .limit(EXPORT_LIMIT);

  if (error) {
    console.error("notebook export: read failed", error);
    return NextResponse.json(
      { error: { code: "READ_FAILED", message: "फ़ाइल नहीं बन पाई, दोबारा कोशिश करें" } },
      { status: 500 },
    );
  }

  // 2. CSV: हेडर, फिर हर नोट एक लाइन में
  const header = ["तारीख", "प्रकार", "शीर्षक", "सवाल", "जवाब / नोट", "tags"];
  const rows = (data ?? []).map((note) =>
    [
      dateOnly(note.created_at),
      KIND_HI[note.kind] ?? note.kind,
      note.title,
      note.question ?? "",
      note.content,
      (note.tags ?? []).join(", "),
    ]
      .map((v) => csvCell(String(v)))
      .join(","),
  );

  // BOM ("\uFEFF"): Excel में हिंदी अक्षर सही दिखें
  const csv = "\uFEFF" + [header.map((h) => csvCell(h)).join(","), ...rows].join("\r\n");

  const today = dateOnly(new Date().toISOString());
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notebook-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}