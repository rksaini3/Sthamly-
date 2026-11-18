import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { createJob } from "@/lib/jobs/create";
import { userFromBearer } from "@/lib/mobile-auth";
import { allowRequest } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Language } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

// एक user एक मिनट में ज़्यादा से ज़्यादा 5 बार फिर से बनवा सकता है
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_RETRIES = 5;

// जो काम अभी चल रहा है, उसे दोबारा नहीं बनाते (दोहरा खर्च न हो)
const BUSY_STATUSES = ["queued", "running"] as const;

const bodySchema = z
  .object({
    // खाली छोड़ें तो पुराना ऑफ़र इस्तेमाल होगा
    offerText: z.string().trim().min(3).max(300).optional(),
    occasion: z.string().trim().max(60).nullable().optional(),
  })
  .optional();

const LANGUAGES = ["hinglish", "hindi", "bhojpuri", "awadhi"] as const;

type Ctx = { params: Promise<{ id: string }> };

// DB client: वही user का token (Android) या cookie (web)
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * user पहचानें: Android (Bearer) या web (cookie)।
 * login न हो तो null।
 */
async function currentUserId(req: NextRequest): Promise<string | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("job retry: bearer check failed", error);
    return null;
  });
  if (bearer) return bearer.id;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleRetry(req, ctx);
  } catch (error) {
    console.error("job retry: unexpected error", error);
    res = errorResponse(500, "INTERNAL", "पोस्टर दोबारा नहीं बन पाया, दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

async function handleRetry(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "काम नहीं मिला");

  // 1. Login जांच
  const userId = await currentUserId(req);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 2. Rate limit
  const allowed = await allowRequest(`job-retry:${userId}`, RATE_WINDOW_SECONDS, RATE_MAX_RETRIES);
  if (!allowed) {
    return errorResponse(429, "RATE_LIMITED", "बहुत जल्दी-जल्दी दोबारा बनवाया जा रहा है, थोड़ा रुकें");
  }

  // 3. Body जांच (खाली body भी चलेगी)
  let raw: unknown = undefined;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = bodySchema.safeParse(raw ?? undefined);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "सही जानकारी भेजें");
  const body = parsed.data ?? {};

  // 4. पुराना काम और मालिकाना हक़ (admin client पर RLS नहीं, इसलिए user_id खुद जांचें)
  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id, status, shop_id, input, batch_id, shops!inner(user_id)")
    .eq("id", id)
    .eq("shops.user_id", userId)
    .maybeSingle();

  if (jobError) {
    console.error("job retry: job lookup failed", jobError);
    return errorResponse(500, "READ_FAILED", "काम नहीं खुल पाया");
  }
  if (!job) return errorResponse(404, "NOT_FOUND", "काम नहीं मिला");

  // 5. अभी चल रहा हो तो रुकें
  if (BUSY_STATUSES.includes(job.status as (typeof BUSY_STATUSES)[number])) {
    return errorResponse(409, "BUSY", "यह पोस्टर अभी बन रहा है, पूरा होने का इंतज़ार करें");
  }

  // 6. पुराने input से बाकी जानकारी (भाषा, फोटो, ऑफ़र)
  const old = (job.input ?? {}) as Record<string, unknown>;
  const oldLanguage = typeof old.language === "string" ? old.language : "hinglish";
  const language = (LANGUAGES as readonly string[]).includes(oldLanguage) ? oldLanguage : "hinglish";
  const photoPaths = Array.isArray(old.photoPaths)
    ? old.photoPaths.filter((p): p is string => typeof p === "string")
    : [];
  const offerText =
    body.offerText ?? (typeof old.offerText === "string" && old.offerText.trim() ? old.offerText : "");
  const occasion =
    body.occasion !== undefined ? body.occasion : typeof old.occasion === "string" ? old.occasion : null;

  if (offerText.length < 3) {
    return errorResponse(400, "NO_OFFER", "पहले ऑफ़र लिखें, फिर पोस्टर बनेगा");
  }

  // 7. नया काम बनाएं। credit की पूरी जांच (कोटा, फिर वॉलेट) createJob में होती है,
  // इसलिए यहां अलग से जांच नहीं करते।
  const created = await createJob({
    userId,
    shopId: job.shop_id,
    offerText,
    occasion: occasion ?? null,
    photoPaths,
    language: language as Language,
    batchId: job.batch_id ?? null,
    // "फिर से बनाएं" नोटबुक से जुड़ा काम है, इसलिए नोटबुक की चैट वाली सेटिंग यहां लागू नहीं होती
  });

  if (!created.ok) {
    if (created.code === "QUOTA_EXCEEDED") {
      return NextResponse.json(
        {
          error: {
            code: "LIMIT_REACHED",
            message: "पोस्टर का कोटा या वॉलेट बैलेंस पूरा हो गया है। वॉलेट भरें या प्लान लें।",
          },
        },
        { status: 402 },
      );
    }
    if (created.code === "SHOP_NOT_FOUND" || created.code === "FORBIDDEN") {
      return errorResponse(404, "NOT_FOUND", "दुकान नहीं मिली");
    }
    return errorResponse(500, "INTERNAL", "पोस्टर दोबारा नहीं बन पाया, दोबारा कोशिश करें");
  }

  // 8. पुराना काम नोटबुक से छुपाएं, अगर वह विफल था (हटता नहीं, इतिहास में रहता है)
  if (job.status === "failed") {
    const { error: hideError } = await admin
      .from("jobs")
      .update({ hidden_from_notebook: true })
      .eq("id", id);
    if (hideError) console.error("job retry: hiding old failed job failed", hideError);
  }

  return NextResponse.json({
    ok: true,
    jobId: created.jobId,
    previousJobId: id,
    remaining: created.remaining,
  });
}