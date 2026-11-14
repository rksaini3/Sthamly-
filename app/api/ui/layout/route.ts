import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LayoutSchema, mergeLayout, type LayoutItem } from "@/lib/ui/catalog";
import { isRole } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// एक user एक मिनट में ज़्यादा से ज़्यादा 30 बार layout बदल सकता है (ज़्यादा होना गलत या दुरुपयोग है)
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_WRITES = 30;

// PUT का body: सिर्फ़ items, बाकी सब server तय करता है
const putSchema = LayoutSchema;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// user की भूमिका profiles से (layout भूमिका के हिसाब से छनता है)
async function roleOf(userId: string, supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<Role> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return isRole(data?.role) ? data.role : "shopkeeper";
}

// GET: मौजूदा layout (भूमिका और सेव की पसंद के मेल से)
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

    const role = await roleOf(user.id, supabase);

    const { data: row, error } = await supabase
      .from("user_layouts")
      .select("items")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("layout read failed", error);
      return errorResponse(500, "READ_FAILED", "पसंद नहीं पढ़ी जा सकी");
    }

    // सेव न हो तो भूमिका का शुरुआती layout; सेव हो तो उसे भूमिका के हिसाब से मिलाएं
    const items: LayoutItem[] = mergeLayout(role, row?.items ?? null);
    return NextResponse.json({ role, items });
  } catch (error) {
    console.error("layout GET: unexpected error", error);
    return errorResponse(500, "INTERNAL", "कुछ गड़बड़ हुई");
  }
}

// PUT: user की नई पसंद सेव करें
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

    // Rate limit: layout बार-बार बदलने की ज़रूरत नहीं, इसलिए सीमा रखी गई
    const { allowRequest } = await import("@/lib/rate-limit");
    const allowed = await allowRequest(`layout:${user.id}`, RATE_WINDOW_SECONDS, RATE_MAX_WRITES);
    if (!allowed) return errorResponse(429, "RATE_LIMITED", "थोड़ा रुकें, बहुत बार बदला जा रहा है");

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
    }

    const parsed = putSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(400, "VALIDATION_FAILED", "पसंद की जानकारी सही नहीं है");
    }

    // भूमिका के हिसाब से छानें और mandatory widgets तय करें, फिर सेव करें
    const role = await roleOf(user.id, supabase);
    const cleaned = mergeLayout(role, parsed.data);

    const { error } = await supabase
      .from("user_layouts")
      .upsert(
        {
          user_id: user.id,
          items: cleaned.map(({ type, hidden, pinned }) => ({ type, hidden, pinned })),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("layout save failed", error);
      return errorResponse(500, "SAVE_FAILED", "पसंद सेव नहीं हो पाई");
    }

    return NextResponse.json({ role, items: cleaned });
  } catch (error) {
    console.error("layout PUT: unexpected error", error);
    return errorResponse(500, "INTERNAL", "कुछ गड़बड़ हुई");
  }
}

// DELETE नहीं: reset के लिए PUT में खाली items भेजें, row रहती है (0010 migration देखें)