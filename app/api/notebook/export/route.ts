import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { loadLibrary, type LibraryItem } from "@/lib/library";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface Session {
  userId: string;
  supabase: DbClient;
}

const STATUS_HI: Record<LibraryItem["status"], string> = {
  queued: "कतार में",
  running: "बन रहा है",
  done: "तैयार",
  failed: "नहीं बन पाया",
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

  // 1. सारे काम (RLS से सिर्फ़ अपनी दुकान के)
  const items = await loadLibrary(session.supabase, 500);

  // 2. नोटबुक से हटाए गए काम फ़ाइल में नहीं जाएंगे (वही दिखेगा जो नोटबुक में है)
  const ids = items.map((i) => i.jobId);
  let hiddenIds = new Set<string>();
  if (ids.length > 0) {
    // admin client से, पर user_id वाला फ़िल्टर पहले loadLibrary की RLS वाली सूची से आ चुका है
    const admin = createSupabaseAdminClient();
    const { data: hiddenRows, error: hiddenError } = await admin
      .from("jobs")
      .select("id")
      .eq("hidden_from_notebook", true)
      .in("id", ids);
    if (hiddenError) {
      console.error("notebook export: hidden lookup failed", hiddenError);
    } else {
      hiddenIds = new Set((hiddenRows ?? []).map((r) => r.id));
    }
  }
  const visible = items.filter((item) => !hiddenIds.has(item.jobId));

  // 3. CSV: हेडर, फिर हर काम एक लाइन में
  const header = ["तारीख", "मौका", "ऑफ़र", "स्थिति", "नोट/कैप्शन"];
  const rows = visible.map((item) =>
    [
      dateOnly(item.createdAt),
      item.occasion ?? "",
      item.offerText,
      STATUS_HI[item.status],
      item.caption,
    ]
      .map((v) => csvCell(v))
      .join(","),
  );

  // BOM: Excel में हिंदी अक्षर सही दिखें
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