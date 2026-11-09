import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// अपनी सारी बिना पढ़ी सूचनाएं पढ़ी हुई कर दें
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("notifications read update failed", error.message);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "सूचनाएं अपडेट नहीं हो पाईं" } }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}