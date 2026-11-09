import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(5, "कम से कम 5 अक्षर लिखें")
    .max(500, "500 अक्षर से ज़्यादा नहीं लिख सकते"),
});

type RouteContext = { params: Promise<{ id: string }> };

// सिर्फ़ अपनी घोषणा बदल सकते हैं (user_id और RLS दोनों जांचे जाते हैं)
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही जानकारी भेजें" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID", message: parsed.error.issues[0]?.message ?? "गलत जानकारी" } },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("announcements")
    .update({ body: parsed.data.body })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("announcement update failed", error.message);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "बदलाव सेव नहीं हो पाया" } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// सिर्फ़ अपनी घोषणा हटा सकते हैं
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("announcement delete failed", error.message);
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "घोषणा हट नहीं पाई" } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}