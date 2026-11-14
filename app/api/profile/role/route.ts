import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { ROLE_INFO } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  role: z.enum(ROLES),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही JSON भेजें");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_FAILED", "भूमिका सही नहीं है");
  }

  const role = parsed.data.role;

  // "जल्द आएगा" वाली भूमिका सेव नहीं होगी (UI के अलावा server पर भी रोक)
  if (!ROLE_INFO[role].live) {
    return errorResponse(403, "NOT_AVAILABLE", "यह भूमिका अभी उपलब्ध नहीं है, जल्द आएगी");
  }

  // फ़ाइनेंस भूमिका सिर्फ़ एडमिन के लिए (UI के अलावा server पर भी रोक)
  if (role === "finance" && !isAdminUser(user.id)) {
    return errorResponse(403, "FORBIDDEN", "यह भूमिका उपलब्ध नहीं है");
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role }, { onConflict: "id" });

  if (error) {
    console.error("profile role save failed", error);
    return errorResponse(500, "SAVE_FAILED", "भूमिका सेव नहीं हो पाई");
  }

  return NextResponse.json({ ok: true, role });
}