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

const patchSchema = z.object({
  notebookAuto: z.boolean(),
});

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface Session {
  userId: string;
  supabase: DbClient;
}

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
    console.error("notebook settings: bearer check failed", error);
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

// मौजूदा सेटिंग: चैट से अपने आप नोटबुक में जुड़ना चालू है या नहीं
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const session = await sessionFor(req);
  if (!session) return withCors(errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें"), origin);

  const { data, error } = await session.supabase
    .from("profiles")
    .select("notebook_auto")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("notebook settings: read failed", error);
    return withCors(errorResponse(500, "READ_FAILED", "सेटिंग नहीं खुल पाई"), origin);
  }

  // प्रोफ़ाइल न मिले तो डिफ़ॉल्ट: चालू (जैसा पहले था)
  return withCors(NextResponse.json({ notebookAuto: data?.notebook_auto ?? true }), origin);
}

// सेटिंग बदलना। यह सिर्फ़ आगे के चैट वाले कामों पर असर करता है,
// पुराने कामों की दृश्यता नहीं बदलती (वो हर job पर अलग से हटते हैं)।
export async function PATCH(req: NextRequest) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleSettings(req);
  } catch (error) {
    console.error("notebook settings: unexpected error", error);
    res = errorResponse(500, "INTERNAL", "सेटिंग सेव नहीं हो पाई, दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

async function handleSettings(req: NextRequest) {
  const session = await sessionFor(req);
  if (!session) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "सही जानकारी भेजें");

  // Admin client पर RLS नहीं लगता, इसलिए id खुद user के id से फ़िल्टर करते हैं
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ notebook_auto: parsed.data.notebookAuto })
    .eq("id", session.userId)
    .select("notebook_auto")
    .maybeSingle();

  if (error) {
    console.error("notebook settings: update failed", error);
    return errorResponse(500, "UPDATE_FAILED", "सेटिंग सेव नहीं हो पाई");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "प्रोफ़ाइल नहीं मिली");

  return NextResponse.json({ ok: true, notebookAuto: data.notebook_auto });
}