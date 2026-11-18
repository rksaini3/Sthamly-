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
  // v1 में रील नहीं है। पुराने callers के लिए बचा है, इसका कोई असर नहीं।
  wantReel?: boolean;
  // बैच का हिस्सा हो तो उसकी ID, नहीं तो खाली
  batchId?: string | null;
  // चैट या वॉइस से बना काम हो तो true। इसी पर "चैट से नोटबुक में जोड़ना" वाली सेटिंग लागू होती है।
  fromChat?: boolean;
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
 * यूज़र ने चैट से नोटबुक में अपने आप जुड़ना बंद किया है या नहीं।
 * न पढ़ा जा सके तो चालू माना जाता है (जैसा पहले था), ताकि कोई काम न छूटे।
 */
async function notebookAutoOn(userId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("notebook_auto")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("createJob: notebook setting read failed", error);
      return true;
    }
    return data?.notebook_auto ?? true;
  } catch (error) {
    console.error("createJob: notebook setting read threw", error);
    return true;
  }
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

  // चैट से बना काम, और यूज़र ने नोटबुक में जुड़ना बंद किया है: तो यह काम नोटबुक में न दिखे।
  // काम, पोस्टर और हिसाब सब सामान्य रहते हैं, बस नोटबुक की सूची में नहीं आता।
  const hiddenFromNotebook = input.fromChat === true ? !(await notebookAutoOn(input.userId)) : false;

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      shop_id: shop.id,
      batch_id: input.batchId ?? null,
      status: "queued",
      hidden_from_notebook: hiddenFromNotebook,
      input: {
        // category और नाम DB से लिए, क्लाइंट से नहीं
        shopName: shop.name,
        category: shop.category,
        city: shop.city,
        offerText: input.offerText,
        occasion: input.occasion ?? null,
        photoPaths: input.photoPaths,
        language: input.language,
        wantReel: false,
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
      reel: 0,
    });

    if (quota.allowed) {
      return { ok: true, jobId: job.id, remaining: quota.remaining };
    }

    // कोटा कम पड़ा: पोस्टर का पैसा वॉलेट से कटेगा।
    // remaining वही बचा हुआ कोटा है जो इस job से पहले था।
    if (quota.remaining.poster >= 1) {
      // कोटे में दिख रहा है, फिर भी मना: दूसरे job से टकराव
      await markFailed(job.id, "quota_exceeded");
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }

    const debit = await debitWallet({
      userId: input.userId,
      jobId: job.id,
      item: "ai_poster",
      amountPaise: PRICE_PAISE.ai_poster,
    });

    if (!debit.ok) {
      // बैलेंस कम: जो रिज़र्व हुआ और जो कटा, सब वापस
      await refundCredits(job.id);
      await markFailed(job.id, "quota_exceeded");
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }

    return { ok: true, jobId: job.id, remaining: quota.remaining };
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