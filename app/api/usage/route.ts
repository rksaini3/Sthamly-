import { NextResponse } from "next/server";
import { getUsageSnapshot } from "@/lib/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// आज का इस्तेमाल, प्लान और वॉलेट। "बढ़ाएँ" वाली शीट इसी से भरती है।
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }
  try {
    return NextResponse.json(await getUsageSnapshot(user.id));
  } catch (error) {
    // टेबल (0028) न बनी हो तो भी ऐप न रुके
    console.error("usage snapshot failed", error);
    return NextResponse.json({ error: { code: "USAGE_FAILED", message: "हिसाब अभी नहीं खुल पाया" } }, { status: 502 });
  }
}