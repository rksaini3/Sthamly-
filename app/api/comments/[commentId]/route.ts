import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

type RouteContext = { params: Promise<{ commentId: string }> };

// सिर्फ़ अपना कमेंट हटा सकते हैं (user_id और RLS दोनों जांचे जाते हैं)
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { commentId } = await params;
  if (!idSchema.safeParse(commentId).success) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "कमेंट नहीं मिला" } }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("announcement_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("comment delete failed", error.message);
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "कमेंट हट नहीं पाया" } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "कमेंट नहीं मिला" } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}