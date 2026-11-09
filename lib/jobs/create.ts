import { PRICE_PAISE } from "@/lib/pricing";
import { reserveCredits, refundCredits } from "@/lib/quota";
import { debitWallet } from "@/lib/wallet";
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
  | { ok: true; jobId: string; remaining: { poster: number; reel: number }; paidFromWalletPaise: number }
  | { ok: false; code: "FORBIDDEN" | "SHOP_NOT_FOUND" | "QUOTA_EXCEEDED" | "INTERNAL" };

async function markFailed(jobId: string, reason: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("jobs")
    .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/**
 * Job बनाएं। पहले कोटा से reserve करें। कोटा खत्म हो तो बाकी हिस्सा वॉलेट से (माइक्रो-कीमत पर)।
 * वेब (/api/generate), WhatsApp और चैट (/api/voice/poster), तीनों यही इस्तेमाल करते हैं।
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

  const posterNeed = 1;
  const reelNeed = input.wantReel ? 1 : 0;

  try {
    // 1. पूरा कोटा
    const full = await reserveCredits({
      userId: input.userId,
      jobId: job.id,
      poster: posterNeed,
      reel: reelNeed,
    });

    if (full.allowed) {
      return { ok: true, jobId: job.id, remaining: full.remaining, paidFromWalletPaise: 0 };
    }

    // 2. कोटा में जितना बचा है, उतना reserve करें
    const coverPoster = full.remaining.poster >= posterNeed ? 1 : 0;
    const coverReel = reelNeed > 0 && full.remaining.reel >= reelNeed ? 1 : 0;

    let coveredPoster = 0;
    let coveredReel = 0;
    if (coverPoster + coverReel > 0) {
      const partial = await reserveCredits({
        userId: input.userId,
        jobId: job.id,
        poster: coverPoster,
        reel: coverReel,
      });
      if (partial.allowed) {
        coveredPoster = coverPoster;
        coveredReel = coverReel;
      }
    }

    // 3. बाकी हिस्सा वॉलेट से
    const walletPoster = posterNeed - coveredPoster;
    const walletReel = reelNeed - coveredReel;
    const items: string[] = [];
    let amountPaise = 0;
    if (walletPoster > 0) {
      items.push("ai_poster");
      amountPaise += PRICE_PAISE.ai_poster;
    }
    if (walletReel > 0) {
      items.push("slide_reel");
      amountPaise += PRICE_PAISE.slide_reel;
    }

    if (amountPaise > 0) {
      const debit = await debitWallet({
        userId: input.userId,
        jobId: job.id,
        item: items.join("+"),
        amountPaise,
      });

      if (!debit.ok) {
        // वॉलेट में पैसे नहीं: कोटे से जो reserve हुआ था, वह भी लौटाएँ
        await refundCredits(job.id);
        await markFailed(job.id, "quota_and_wallet_insufficient");
        return { ok: false, code: "QUOTA_EXCEEDED" };
      }
    }

    return {
      ok: true,
      jobId: job.id,
      remaining: { poster: 0, reel: 0 },
      paidFromWalletPaise: amountPaise,
    };
  } catch (error) {
    console.error("createJob: reserve or wallet step failed", job.id, error);
    await refundCredits(job.id).catch((refundError) => {
      console.error("createJob: refund after failure also failed", job.id, refundError);
    });
    await markFailed(job.id, "credit_reserve_failed");
    return { ok: false, code: "INTERNAL" };
  }
}
