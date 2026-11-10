import { PRICE_PAISE } from "@/lib/pricing";
import { refundCredits, reserveCredits } from "@/lib/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { debitWallet } from "@/lib/wallet";
import type { Language } from "@/types/domain";

export interface CreateJobInput {
  userId: string;
  shopId: string;
  offerText: string;
  occasion?: string | null;
  photoPaths: string[];
  language: Language;
  wantReel: boolean;
  // बैच का हिस्सा हो तो उसकी ID, नहीं तो खाली
  batchId?: string | null;
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
 * Job बनाएं और credit reserve करें। असिस्टेंट और बैच, दोनों यही इस्तेमाल करते हैं।
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
      batch_id: input.batchId ?? null,
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

    if (quota.allowed) {
      return { ok: true, jobId: job.id, remaining: quota.remaining };
    }

    // कोटा कम पड़ा: जो हिस्सा कोटे में है वह कोटे से, बाकी वॉलेट से।
    // remaining वही बचा हुआ कोटा है जो इस job से पहले था।
    const posterFromWallet = quota.remaining.poster < 1;
    const reelFromWallet = input.wantReel && quota.remaining.reel < 1;

    if (!posterFromWallet && !reelFromWallet) {
      // दोनों कोटे में दिख रहे हैं, फिर भी मना: दूसरे job से टकराव
      await markFailed(job.id, "quota_exceeded");
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }

    const coveredPoster = posterFromWallet ? 0 : 1;
    const coveredReel = reelFromWallet ? 0 : input.wantReel ? 1 : 0;
    let remaining = quota.remaining;

    if (coveredPoster + coveredReel > 0) {
      const partial = await reserveCredits({
        userId: input.userId,
        jobId: job.id,
        poster: coveredPoster,
        reel: coveredReel,
      });
      if (!partial.allowed) {
        await markFailed(job.id, "quota_exceeded");
        return { ok: false, code: "QUOTA_EXCEEDED" };
      }
      remaining = partial.remaining;
    }

    const charges: Array<{ item: string; amountPaise: number }> = [];
    if (posterFromWallet) charges.push({ item: "ai_poster", amountPaise: PRICE_PAISE.ai_poster });
    if (reelFromWallet) charges.push({ item: "slide_reel", amountPaise: PRICE_PAISE.slide_reel });

    for (const charge of charges) {
      const debit = await debitWallet({
        userId: input.userId,
        jobId: job.id,
        item: charge.item,
        amountPaise: charge.amountPaise,
      });
      if (!debit.ok) {
        // बैलेंस कम: जो रिज़र्व हुआ और जो कटा, सब वापस
        await refundCredits(job.id);
        await markFailed(job.id, "quota_exceeded");
        return { ok: false, code: "QUOTA_EXCEEDED" };
      }
    }

    return { ok: true, jobId: job.id, remaining };
  } catch (error) {
    console.error("createJob: credit reserve failed", job.id, error);
    // बीच में कुछ रिज़र्व या कटा हो सकता है, इसलिए वापस करने की कोशिश
    await refundCredits(job.id).catch((refundError) =>
      console.error("createJob: refund after failure also failed", job.id, refundError),
    );
    await markFailed(job.id, "credit_reserve_failed");
    return { ok: false, code: "INTERNAL" };
  }
}