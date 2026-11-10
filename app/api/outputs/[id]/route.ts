import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

// सिर्फ़ अपना पोस्टर या रील हटा सकते हैं।
// मालिक की जांच: output -> job -> shop -> user_id
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "फ़ाइल नहीं मिली" } }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: output, error: outputError } = await admin
    .from("outputs")
    .select("id, job_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (outputError) {
    console.error("output delete: read failed", outputError.message);
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "फ़ाइल हट नहीं पाई" } }, { status: 500 });
  }
  if (!output) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "फ़ाइल नहीं मिली" } }, { status: 404 });
  }

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
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "फ़ाइल नहीं मिली" } }, { status: 404 });
  }

  // पहले फ़ाइल स्टोरेज से, फिर रिकॉर्ड से
  if (output.storage_path) {
    const { error: storageError } = await admin.storage.from("outputs").remove([output.storage_path]);
    if (storageError) {
      console.error("output delete: storage remove failed", storageError.message);
    }
  }

  const { error: deleteError } = await admin.from("outputs").delete().eq("id", output.id);
  if (deleteError) {
    console.error("output delete: row delete failed", deleteError.message);
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "फ़ाइल हट नहीं पाई" } }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}