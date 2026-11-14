import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// बातचीतों की सूची: पिन की हुई पहले, फिर सबसे नई
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, title, pinned, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("chats list failed", error);
    return NextResponse.json({ error: { code: "LIST_FAILED", message: "इतिहास नहीं खुल पाया" } }, { status: 500 });
  }
  return NextResponse.json({ chats: data ?? [] });
}