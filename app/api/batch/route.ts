import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createJob, type CreateJobResult } from "@/lib/jobs/create";
import { allowRequest } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 10;

// एक batch request में 10 posters बन सकते हैं, इसलिए सीमा generate से कड़ी है।
// 10 मिनट में 5 batch requests तक।
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_REQUESTS = 5;

// बैच रुकने पर जो कारण मिल सकता है (createJob की गड़बड़ियों में से)
type BatchStopCode = Extract<CreateJobResult, { ok: false }>["code"];

const bodySchema = z.object({
  shopId: z.string().uuid(),
  offerText: z.string().trim().min(3).max(300),
  occasion: z.string().trim().max(60).nullable().optional(),
  language: z.enum(["hinglish", "hindi", "bhojpuri", "awadhi"]).default("hinglish"),
  photoPaths: z.array(z.string().min(1).max(300)).min(1).max(MAX_BATCH),
  // पुष्टि के बिना कुछ नहीं शुरू होगा
  confirmed: z.literal(true),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function statusFor(code: BatchStopCode): number {
  switch (code) {
    case "FORBIDDEN":
      return 403;
    case "SHOP_NOT_FOUND":
      return 404;
    case "QUOTA_EXCEEDED":
      return 402;
    default:
      return 500;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "पहले लॉग-इन करें", 401);
    }

    // Rate limit: body पढ़ने से पहले ही रोकें
    const allowed = await allowRequest(
      `batch:${user.id}`,
      RATE_WINDOW_SECONDS,
      RATE_MAX_REQUESTS,
    );
    if (!allowed) {
      return errorResponse(
        "RATE_LIMITED",
        "बहुत जल्दी-जल्दी बैच भेजे जा रहे हैं, थोड़ी देर बाद दोबारा कोशिश करें",
        429,
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "भेजा गया डेटा सही नहीं है", 400);
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("VALIDATION_FAILED", "इनपुट सही नहीं है, या पुष्टि नहीं मिली", 400);
    }

    const { shopId, offerText, occasion, language, photoPaths } = parsed.data;

    // हर फ़ोटो के लिए एक अलग पोस्टर। कोटा या वॉलेट खत्म हो तो बाकी रुक जाते हैं।
    const jobIds: string[] = [];
    let stoppedCode: BatchStopCode | null = null;

    for (const path of photoPaths) {
      const result = await createJob({
        userId: user.id,
        shopId,
        offerText,
        occasion: occasion ?? null,
        photoPaths: [path],
        language,
        wantReel: false,
      });

      if (!result.ok) {
        stoppedCode = result.code;
        break;
      }
      jobIds.push(result.jobId);
    }

    // एक भी शुरू न हुआ हो तो गड़बड़ बताएं
    if (jobIds.length === 0 && stoppedCode) {
      return errorResponse(stoppedCode, "बैच शुरू नहीं हो सका, कोटा या वॉलेट जांचें", statusFor(stoppedCode));
    }

    return NextResponse.json(
      {
        started: jobIds.length,
        jobIds,
        notStarted: photoPaths.length - jobIds.length,
        stoppedReason: stoppedCode,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("batch: unexpected error", error);
    return errorResponse("INTERNAL", "सर्वर पर गड़बड़ हुई, थोड़ी देर बाद दोबारा कोशिश करें", 500);
  }
}