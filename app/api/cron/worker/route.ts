import { NextResponse, type NextRequest } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { getServerEnv } from "@/lib/env";
import { getJobCostPaise, isOverJobCap, logCosts } from "@/lib/cost";
import { buildCaptionPrompt } from "@/lib/prompts";
import { getActivePlan, refundCredits } from "@/lib/quota";
import { renderPoster } from "@/lib/render/poster";
import { applyWatermark } from "@/lib/render/watermark";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendJobFailed, sendOutputReady } from "@/lib/whatsapp/outbound";
import type { JobInput } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 3;
const PHOTO_BUCKET = "shop-photos"; // private, दुकानदार की अपलोड की गई फोटो
const OUTPUT_BUCKET = "outputs"; // private, बने हुए poster
const SIGNED_URL_SECONDS = 60 * 60 * 24;

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type StoredInput = JobInput & { wantReel?: boolean };
type Outcome = "done" | "failed" | "retry" | "skipped";

// लागत सीमा पार हुई: यह दोबारा कोशिश से ठीक नहीं होगा, इसलिए सीधे विफल
class CostCapError extends Error {
  constructor(totalPaise: number) {
    super(`cost cap exceeded: ${totalPaise} paise`);
    this.name = "CostCapError";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---- Entry point ----

export async function GET(req: NextRequest) {
  const { CRON_SECRET, JOB_MAX_ATTEMPTS } = getServerEnv();
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: queued, error } = await admin
    .from("jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("worker: queue read failed", error);
    return NextResponse.json({ error: "queue read failed" }, { status: 500 });
  }

  const counts: Record<Outcome, number> = { done: 0, failed: 0, retry: 0, skipped: 0 };
  for (const job of queued ?? []) {
    const outcome = await processJob(admin, job.id, JOB_MAX_ATTEMPTS);
    counts[outcome] += 1;
  }

  return NextResponse.json({ processed: queued?.length ?? 0, ...counts });
}

// ---- एक job ----

async function processJob(admin: Admin, jobId: string, maxAttempts: number): Promise<Outcome> {
  // 1. Claim: सिर्फ queued को running करें, ताकि दो workers एक job न लें
  const { data: job, error: claimError } = await admin
    .from("jobs")
    .update({ status: "running" })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, shop_id, input, attempts")
    .maybeSingle();

  if (claimError) {
    console.error("worker: claim failed", jobId, claimError);
    return "skipped";
  }
  if (!job) return "skipped"; // किसी और ने उठा लिया

  const attempts = job.attempts + 1;

  try {
    await runJob(admin, job.id, job.shop_id, job.input as StoredInput);
    return "done";
  } catch (error) {
    const message = messageOf(error);
    console.error("worker: job failed", jobId, attempts, message);

    // Cost cap या retry खत्म: अंतिम रूप से विफल
    const isFinal = error instanceof CostCapError || attempts >= maxAttempts;

    if (!isFinal) {
      await admin
        .from("jobs")
        .update({ status: "queued", attempts, error: message })
        .eq("id", jobId);
      return "retry";
    }

    await admin
      .from("jobs")
      .update({
        status: "failed",
        attempts,
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    try {
      await refundCredits(jobId);
    } catch (refundError) {
      // Refund न हो तो यह गंभीर है, log में साफ दिखे
      console.error("worker: REFUND FAILED", jobId, messageOf(refundError));
    }

    await notifyFailure(admin, job.shop_id);
    return "failed";
  }
}

// ---- असली काम ----

async function runJob(admin: Admin, jobId: string, shopId: string, input: StoredInput) {
  // दोबारा चलने पर पुराने outputs हटाएं (retry सुरक्षित रहे)
  await admin.from("outputs").delete().eq("job_id", jobId);

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id, user_id, name, city, category")
    .eq("id", shopId)
    .single();
  if (shopError || !shop) throw new Error(`shop not found: ${shopId}`);

  const { data: profile } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", shop.user_id)
    .maybeSingle();
  const recipient = profile?.phone ?? null;

  const { data: brand } = await admin
    .from("brand_kits")
    .select("primary_color")
    .eq("shop_id", shopId)
    .maybeSingle();

  const plan = await getActivePlan(shop.user_id);
  const provider = getAIProvider();

  await assertUnderCap(jobId);

  // ---- 1. Caption ----
  const captionPrompt = buildCaptionPrompt({
    shopName: shop.name,
    category: shop.category,
    city: shop.city,
    offerText: input.offerText,
    occasion: input.occasion,
    photoPaths: input.photoPaths,
    language: input.language,
  });
  const caption = await provider.generateText({ prompt: captionPrompt, maxTokens: 400 });
  await logCosts([
    { jobId, step: "caption", provider: provider.name, costPaise: caption.costPaise },
  ]);
  const captionText = caption.text ?? "";

  await assertUnderCap(jobId);

  // ---- 2. Poster: दुकानदार की अपनी फोटो बेस होगी (AI का खर्च नहीं) ----
  const background = await loadPhotoBackground(admin, input.photoPaths[0]);

  let poster = await renderPoster({
    shopName: shop.name,
    offerText: input.offerText,
    occasion: input.occasion,
    phone: recipient,
    city: shop.city,
    category: shop.category,
    size: "square",
    accentColor: brand?.primary_color ?? null,
    backgroundImage: background,
  });

  // ---- 3. Free प्लान पर watermark ----
  const watermarked = plan === "free";
  if (watermarked) {
    poster = await applyWatermark({ png: poster, width: 1080, height: 1080 });
  }

  // ---- 4. Storage में सेव ----
  const posterPath = `${shop.user_id}/${jobId}/poster-square.png`;
  const { error: uploadError } = await admin.storage
    .from(OUTPUT_BUCKET)
    .upload(posterPath, poster, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(`poster upload failed: ${uploadError.message}`);

  const { error: outputsError } = await admin.from("outputs").insert([
    {
      job_id: jobId,
      type: "poster",
      storage_path: posterPath,
      watermarked,
      meta: { size: "square" },
    },
    { job_id: jobId, type: "caption", content: captionText, meta: {} },
  ]);
  if (outputsError) throw new Error(`outputs insert failed: ${outputsError.message}`);

  await assertUnderCap(jobId);

  // ---- 5. Job पूरा ----
  // यह आखिरी लिखना है। इसके बाद job retry नहीं होगा, इसलिए रील का credit भी सिर्फ यहीं के बाद लौटता है।
  const totalCost = await getJobCostPaise(jobId);
  const { error: doneError } = await admin
    .from("jobs")
    .update({
      status: "done",
      cost_paise: totalCost,
      error: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (doneError) throw new Error(`job done update failed: ${doneError.message}`);

  // ---- 6. रील: अभी इस worker में नहीं बनती, इसलिए उसका credit वापस ----
  if (input.wantReel) {
    await refundUnusedReel(admin, jobId, shop.user_id);
  }

  // ---- 7. WhatsApp पर भेजें (विफल हो तो job पूरा रहता है, डेटा dashboard पर है) ----
  if (recipient) {
    await deliver(admin, recipient, posterPath, captionText, input.wantReel);
  }
}

// ---- Helpers ----

async function assertUnderCap(jobId: string) {
  const total = await getJobCostPaise(jobId);
  if (isOverJobCap(total)) throw new CostCapError(total);
}

async function loadPhotoBackground(
  admin: Admin,
  path: string,
): Promise<{ data: Buffer; mimeType: "image/png" | "image/jpeg" } | null> {
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return null;

  // Satori सिर्फ PNG और JPEG लेता है
  if (data.type !== "image/png" && data.type !== "image/jpeg") return null;
  return { data: Buffer.from(await data.arrayBuffer()), mimeType: data.type };
}

/**
 * रील का credit एक बार वापस करें।
 * पहले से वापस हो चुका हो तो कुछ नहीं करता (retry या दोबारा चलने पर भी दोहरा credit नहीं जुड़ेगा)।
 */
async function refundUnusedReel(admin: Admin, jobId: string, userId: string) {
  try {
    const { data: existing, error: readError } = await admin
      .from("usage_ledger")
      .select("id")
      .eq("job_id", jobId)
      .eq("reason", "refund_reel")
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return;

    const { error } = await admin.from("usage_ledger").insert({
      user_id: userId,
      delta: 1,
      reason: "refund_reel",
      job_id: jobId,
      kind: "reel",
    });
    if (error) throw error;
  } catch (error) {
    // Job तो पूरा हो चुका है। Credit न लौटे तो log में साफ दिखे।
    console.error("worker: REEL REFUND FAILED", jobId, messageOf(error));
  }
}

async function deliver(
  admin: Admin,
  recipient: string,
  posterPath: string,
  captionText: string,
  wantReel: boolean | undefined,
) {
  try {
    const { data: signed, error } = await admin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(posterPath, SIGNED_URL_SECONDS);
    if (error || !signed) throw new Error(error?.message ?? "no signed url");

    await sendOutputReady(recipient, {
      posterUrl: signed.signedUrl,
      captionText,
      extraNote: wantReel
        ? "रील अभी तैयार नहीं हो पाई। उसका credit आपके खाते में वापस कर दिया गया है।"
        : null,
    });
  } catch (error) {
    console.error("worker: delivery failed", recipient, messageOf(error));
  }
}

async function notifyFailure(admin: Admin, shopId: string) {
  try {
    const { data: shop } = await admin
      .from("shops")
      .select("user_id")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", shop.user_id)
      .maybeSingle();
    if (!profile?.phone) return;

    await sendJobFailed(profile.phone);
  } catch (error) {
    console.error("worker: failure notice failed", messageOf(error));
  }
}