import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { reserveCredits } from "@/lib/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  shopId: z.string().uuid(),
  offerText: z.string().trim().min(3).max(300),
  occasion: z.string().trim().max(60).nullable().optional(),
  photoPaths: z.array(z.string().min(1).max(300)).min(1).max(3),
  language: z.enum(["hinglish", "hindi", "bhojpuri", "awadhi"]).default("hinglish"),
  wantReel: z.boolean().default(false),
});

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

async function markFailed(admin: AdminClient, jobId: string, reason: string) {
  await admin
    .from("jobs")
    .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function POST(req: NextRequest) {
  // 1. Login जांच (server पर verify)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse("UNAUTHORIZED", "पहले लॉग-इन करें", 401);
  }

  // 2. Body पढ़ें और जांचें
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", "भेजा गया डेटा सही JSON नहीं है", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("VALIDATION_FAILED", "इनपुट सही नहीं है", 400, parsed.error.flatten());
  }
  const input = parsed.data;

  // 3. फोटो का रास्ता इसी यूज़र के folder का होना चाहिए (दूसरे की फोटो नहीं)
  const photosOk = input.photoPaths.every(
    (path) => path.startsWith(`${user.id}/`) && !path.includes(".."),
  );
  if (!photosOk) {
    return errorResponse("FORBIDDEN", "फोटो का रास्ता मान्य नहीं है", 403);
  }

  // 4. दुकान इसी यूज़र की है? RLS की वजह से दूसरे की दुकान यहां मिलेगी ही नहीं
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name, category, city")
    .eq("id", input.shopId)
    .maybeSingle();

  if (shopError) {
    console.error("generate: shop lookup failed", shopError);
    return errorResponse("INTERNAL", "कुछ गड़बड़ हुई, दोबारा कोशिश करें", 500);
  }
  if (!shop) {
    return errorResponse("NOT_FOUND", "दुकान नहीं मिली", 404);
  }

  // 5. Job बनाएं। jobs पर user के लिए insert policy नहीं है, इसलिए admin client
  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      shop_id: shop.id,
      status: "queued",
      input: {
        // category और नाम DB से लिए, क्लाइंट से नहीं
        shopName: shop.name,
        category: shop.category,
        city: shop.city,
        offerText: input.offerText,
        occasion: input.occasion ?? null,
        photoPaths: input.photoPaths,
        language: input.language,
        wantReel: input.wantReel,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("generate: job insert failed", jobError);
    return errorResponse("INTERNAL", "job नहीं बन पाया, दोबारा कोशिश करें", 500);
  }

  // 6. Credit reserve: पोस्टर सेट के लिए 1 poster credit, रील मांगी हो तो 1 reel credit
  let quota;
  try {
    quota = await reserveCredits({
      userId: user.id,
      jobId: job.id,
      poster: 1,
      reel: input.wantReel ? 1 : 0,
    });
  } catch (error) {
    console.error("generate: credit reserve failed", job.id, error);
    await markFailed(admin, job.id, "credit_reserve_failed");
    return errorResponse("INTERNAL", "कुछ गड़बड़ हुई, दोबारा कोशिश करें", 500);
  }

  if (!quota.allowed) {
    await markFailed(admin, job.id, "quota_exceeded");
    return errorResponse(
      "QUOTA_EXCEEDED",
      "इस महीने का कोटा खत्म हो गया। Top-up लें या प्लान अपग्रेड करें।",
      402,
    );
  }

  // 7. सफल: job queued है, worker इसे अगले run में उठाएगा
  return NextResponse.json(
    { jobId: job.id, status: "queued", remaining: quota.remaining },
    { status: 202 },
  );
}