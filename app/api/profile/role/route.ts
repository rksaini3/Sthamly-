import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  role: z.enum(ROLES),
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
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "भूमिका सही नहीं है" } }, { status: 400 });
  }

  // फ़ाइनेंस भूमिका सिर्फ़ एडमिन के लिए (UI के अलावा server पर भी रोक)
  if (parsed.data.role === "finance" && !isAdminUser(user.id)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "यह भूमिका उपलब्ध नहीं है" } }, { status: 403 });
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role: parsed.data.role }, { onConflict: "id" });

  if (error) {
    console.error("profile role save failed", error);
    return NextResponse.json({ error: { code: "SAVE_FAILED", message: "भूमिका सेव नहीं हो पाई" } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: parsed.data.role });
}