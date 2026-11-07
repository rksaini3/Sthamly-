import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eraseUserData } from "@/lib/account/erase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TEXT = "हां हटाओ";

const bodySchema = z.object({
  confirm: z.literal(CONFIRM_TEXT),
});

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
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही JSON भेजें" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "CONFIRM_REQUIRED", message: `पक्का करने के लिए "${CONFIRM_TEXT}" लिखें` } },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  try {
    // वेब पर फ़ोन न हो तो placeholder, ताकि deletion_log लिखा जा सके
    await eraseUserData(user.id, profile?.phone ?? "no-phone");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("account delete failed", error);
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "डेटा नहीं हट पाया" } }, { status: 500 });
  }
}