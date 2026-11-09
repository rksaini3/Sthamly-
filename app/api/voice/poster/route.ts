import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs/create";
import { getActivePlan, refundCredits } from "@/lib/quota";
import { renderPoster } from "@/lib/render/poster";
import { applyWatermark } from "@/lib/render/watermark";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OUTPUT_BUCKET = "outputs";
const SIGNED_URL_SECONDS = 60 * 60 * 24;

const bodySchema = z.object({
  offerText: z.string().trim().min(3).max(300),
  occasion: z.string().trim().max(60).nullable().optional(),
});

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// चैट से सीधे पोस्टर: फ़ॉर्म नहीं, इसी जवाब में तस्वीर लौटती है
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (error) {
    console.error("voice poster: unexpected", error);
    return fail("INTERNAL", "पोस्टर नहीं बन पाया, दोबारा कोशिश करें", 500);
  }
}

async function handle(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "पहले लॉग-इन करें", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("BAD_REQUEST", "सही जानकारी भेजें", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("INVALID", "ऑफ़र सही नहीं है", 400);
  const offerText = parsed.data.offerText;
  const occasion = parsed.data.occasion ?? null;

  // दुकान एक बार बनती है; हर पोस्टर पर दोबारा नहीं पूछते
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, category, city")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!shop) return fail("SHOP_MISSING", "पहले दुकान की जानकारी भरें", 409);

  // क्रेडिट यहीं reserve होता है; खत्म हो तो 402
  const created = await createJob({
    userId: user.id,
    shopId: shop.id,
    offerText,
    occasion,
    photoPaths: [],
    language: "hinglish",
    wantReel: false,
  });
  if (!created.ok) {
    if (created.code === "QUOTA_EXCEEDED") {
      return fail("QUOTA_EXCEEDED", "इस महीने के पोस्टर खत्म हो गए", 402);
    }
    return fail("INTERNAL", "पोस्टर नहीं बन पाया, दोबारा कोशिश करें", 500);
  }

  const jobId = created.jobId;
  const admin = createSupabaseAdminClient();

  // worker इसे दोबारा न उठाए
  const { data: claimed } = await admin
    .from("jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claimed) return fail("INTERNAL", "पोस्टर पहले से बन रहा है, थोड़ी देर में देखें", 409);

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    const plan = await getActivePlan(user.id);

    let poster = await renderPoster({
      shopName: shop.name,
      offerText,
      occasion,
      phone: profile?.phone ?? null,
      city: shop.city,
      category: shop.category,
      size: "square",
      accentColor: null,
      backgroundImage: null,
    });

    const watermarked = plan === "free";
    if (watermarked) {
      poster = await applyWatermark({ png: poster, width: 1080, height: 1080 });
    }

    const path = `${user.id}/${jobId}/poster-square.png`;
    const { error: uploadError } = await admin.storage
      .from(OUTPUT_BUCKET)
      .upload(path, poster, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

    const { error: outputError } = await admin.from("outputs").insert({
      job_id: jobId,
      type: "poster",
      storage_path: path,
      watermarked,
      meta: { size: "square" },
    });
    if (outputError) throw new Error(`outputs insert failed: ${outputError.message}`);

    await admin
      .from("jobs")
      .update({ status: "done", error: null, finished_at: new Date().toISOString() })
      .eq("id", jobId);

    const { data: signed, error: signError } = await admin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signError || !signed) throw new Error("signed url failed");

    return NextResponse.json({ posterUrl: signed.signedUrl, remaining: created.remaining });
  } catch (error) {
    console.error("voice poster failed", jobId, error);
    await admin
      .from("jobs")
      .update({ status: "failed", error: "render_failed", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    try {
      await refundCredits(jobId);
    } catch (refundError) {
      console.error("voice poster: REFUND FAILED", jobId, refundError);
    }
    return fail("INTERNAL", "पोस्टर नहीं बन पाया, क्रेडिट वापस कर दिया गया है", 500);
  }
}
