import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(5, "कम से कम 5 अक्षर लिखें")
    .max(500, "500 अक्षर से ज़्यादा नहीं लिख सकते"),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "सही जानकारी भेजें" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID", message: parsed.error.issues[0]?.message ?? "गलत जानकारी" } },
      { status: 400 },
    );
  }

  // घोषणा पर दुकान का नाम दिखेगा, इसलिए दुकान ज़रूरी है
  const { data: shop } = await supabase
    .from("shops")
    .select("name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!shop) {
    return NextResponse.json(
      { error: { code: "NO_SHOP", message: "पहले अपनी दुकान की जानकारी भरें" } },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({ user_id: user.id, shop_name: shop.name, body: parsed.data.body })
    .select("id")
    .single();

  if (error) {
    console.error("announcement insert failed", error.message);
    return NextResponse.json(
      { error: { code: "SAVE_FAILED", message: "घोषणा सेव नहीं हो पाई" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}