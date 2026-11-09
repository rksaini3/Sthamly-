import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { notifyUser } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  body: z.string().trim().min(1, "कमेंट लिखें").max(300, "300 अक्षर से ज़्यादा नहीं लिख सकते"),
});

type RouteContext = { params: Promise<{ id: string }> };

// लॉग-इन यूज़र घोषणा पर कमेंट करे। घोषणा के मालिक को सूचना जाती है (खुद के कमेंट पर नहीं)।
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "कमेंट करने के लिए लॉग-इन करें" } }, { status: 401 });
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

  const { data: announcement, error: annError } = await supabase
    .from("announcements")
    .select("id, user_id")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (annError) {
    console.error("comment: announcement read failed", annError.message);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "कमेंट नहीं हो पाया" } }, { status: 500 });
  }
  if (!announcement) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "घोषणा नहीं मिली" } }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const authorName = profile?.full_name?.trim() || "ग्राहक";

  const text = parsed.data.body;
  const { error: insertError } = await supabase
    .from("announcement_comments")
    .insert({
      announcement_id: id,
      user_id: user.id,
      author_name: authorName,
      body: text,
    });
  if (insertError) {
    console.error("comment insert failed", insertError.message);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "कमेंट नहीं हो पाया" } }, { status: 500 });
  }

  if (announcement.user_id !== user.id) {
    await notifyUser(announcement.user_id, {
      kind: "comment",
      title: `${authorName} ने आपकी घोषणा पर कमेंट किया`,
      body: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      link: "/feed",
    });
  }

  return NextResponse.json({ ok: true });
}