import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs/create";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  shopId: z.string().uuid(),
  offerText: z.string().trim().min(3).max(300),
  occasion: z.string().trim().max(60).nullable().optional(),
  photoPaths: z.array(z.string().min(1).max(300)).min(1).max(3),
  language: z.enum(["hinglish", "hindi", "bhojpuri", "awadhi"]).default("hinglish"),
  wantReel: z.boolean().default(false),
});

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(req: NextRequest) {
  // कोई भी अनचाही गड़बड़ हो, जवाब हमेशा JSON में जाए, खाली नहीं
  try {
    return await handleGenerate(req);
  } catch (error) {
    console.error("generate: unexpected error", error);
    return errorResponse("INTERNAL", "सर्वर पर गड़बड़ हुई, थोड़ी देर बाद दोबारा कोशिश करें", 500);
  }
}

async function handleGenerate(req: NextRequest) {
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

  // 3. Job, दुकान की जांच और credit का काम createJob करता है (WhatsApp भी यही इस्तेमाल करता है)
  const result = await createJob({
    userId: user.id,
    ...parsed.data,
  });

  if (!result.ok) {
    switch (result.code) {
      case "FORBIDDEN":
        return errorResponse("FORBIDDEN", "फोटो का रास्ता मान्य नहीं है", 403);
      case "SHOP_NOT_FOUND":
        return errorResponse("NOT_FOUND", "दुकान नहीं मिली", 404);
      case "QUOTA_EXCEEDED":
        return errorResponse(
          "QUOTA_EXCEEDED",
          "इस महीने का कोटा खत्म हो गया। Top-up लें या प्लान अपग्रेड करें।",
          402,
        );
      default:
        return errorResponse("INTERNAL", "कुछ गड़बड़ हुई, दोबारा कोशिश करें", 500);
    }
  }

  // 4. सफल: job queued है, worker इसे अगले run में उठाएगा
  return NextResponse.json(
    { jobId: result.jobId, status: "queued", remaining: result.remaining },
    { status: 202 },
  );
}