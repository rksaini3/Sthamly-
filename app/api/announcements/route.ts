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
    .max(280, "280 अक्षर से ज़्यादा नहीं लिख सकते"),
});

// नई घोषणा बनाएं। लॉग-इन ज़रूरी है। बदलना और हटाना [id]/route.ts में है।
export async function POST(req: NextRequest) {
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

  // दुकान का नाम: अभी profile का नाम (Step 6 में दुकान की जानकारी से आएगा)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const shopName = profile?.full_name?.trim() || "दुकान";

  const { data, error } = await supabase
    .from("announcements")
    .insert({ user_id: user.id, shop_name: shopName, body: parsed.data.body })
    .select("id")
    .single();

  if (error || !data) {
    console.error("announcement insert failed", error?.message);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "घोषणा सेव नहीं हो पाई" } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}