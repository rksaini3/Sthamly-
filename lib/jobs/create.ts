import { reserveCredits } from "@/lib/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Language } from "@/types/domain";

export interface CreateJobInput {
  userId: string;
  shopId: string;
  offerText: string;
  occasion?: string | null;
  photoPaths: string[];
  language: Language;
  wantReel: boolean;
}

export type CreateJobResult =
  | { ok: true; jobId: string; remaining: { poster: number; reel: number } }
  | { ok: false; code: "FORBIDDEN" | "SHOP_NOT_FOUND" | "QUOTA_EXCEEDED" | "INTERNAL" };

async function markFailed(jobId: string, reason: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("jobs")
    .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/**
 * Job बनाएं और credit reserve करें। वेब (/api/generate) और WhatsApp, दोनों यही इस्तेमाल करते हैं।
 * Job queued रहता है, worker उसे बाद में उठाता है।
 */
export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  // फोटो का रास्ता इसी यूज़र के folder का होना चाहिए
  const photosOk = input.photoPaths.every(
    (path) => path.startsWith(`${input.userId}/`) && !path.includes(".."),
  );
  if (!photosOk) return { ok: false, code: "FORBIDDEN" };

  const admin = createSupabaseAdminClient();

  // दुकान इसी यूज़र की है? (admin client RLS नहीं मानता, इसलिए user_id खुद जांचें)
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id, name, category, city")
    .eq("id", input.shopId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (shopError) {
    console.error("createJob: shop lookup failed", shopError);
    return { ok: false, code: "INTERNAL" };
  }
  if (!shop) return { ok: false, code: "SHOP_NOT_FOUND" };

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
    console.error("createJob: job insert failed", jobError);
    return { ok: false, code: "INTERNAL" };
  }

  try {
    const quota = await reserveCredits({
      userId: input.userId,
      jobId: job.id,
      poster: 1,
      reel: input.wantReel ? 1 : 0,
    });

    if (!quota.allowed) {
      await markFailed(job.id, "quota_exceeded");
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }

    return { ok: true, jobId: job.id, remaining: quota.remaining };
  } catch (error) {
    console.error("createJob: credit reserve failed", job.id, error);
    await markFailed(job.id, "credit_reserve_failed");
    return { ok: false, code: "INTERNAL" };
  }
}