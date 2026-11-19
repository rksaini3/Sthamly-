import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ published: z.boolean() });

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// सिर्फ़ अपना पोस्टर या रील सार्वजनिक/निजी कर सकते हैं।
// मालिक की जांच: output -> job -> shop -> user_id (वही जो DELETE route में है)
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return errorResponse(404, "NOT_FOUND", "फ़ाइल नहीं मिली");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "सही जानकारी भेजें");

  const admin = createSupabaseAdminClient();

  const { data: output, error: outputError } = await admin
    .from("outputs")
    .select("id, job_id")
    .eq("id", id)
    .maybeSingle();
  if (outputError) {
    console.error("output publish: read failed", outputError.message);
    return errorResponse(500, "UPDATE_FAILED", "स्थिति नहीं बदली जा सकी");
  }
  if (!output) return errorResponse(404, "NOT_FOUND", "फ़ाइल नहीं मिली");

  const { data: job } = await admin
    .from("jobs")
    .select("shop_id")
    .eq("id", output.job_id)
    .maybeSingle();
  const { data: shop } = job
    ? await admin.from("shops").select("user_id").eq("id", job.shop_id).maybeSingle()
    : { data: null };

  if (!shop || shop.user_id !== user.id) {
    // दूसरे की फ़ाइल: मौजूदगी भी न बताएं
    return errorResponse(404, "NOT_FOUND", "फ़ाइल नहीं मिली");
  }

  const published = parsed.data.published;
  const { error: updateError } = await admin
    .from("outputs")
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq("id", output.id);
  if (updateError) {
    console.error("output publish: update failed", updateError.message);
    return errorResponse(500, "UPDATE_FAILED", "स्थिति नहीं बदली जा सकी");
  }

  return NextResponse.json({ ok: true, published });
}