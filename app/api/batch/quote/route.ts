import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PRICE_PAISE, formatRupees } from "@/lib/pricing";
import { getQuotaStatus } from "@/lib/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 10;

const bodySchema = z.object({
  count: z.number().int().min(1).max(MAX_BATCH),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// बैच शुरू करने से पहले: कितने पोस्टर कोटे से, कितने वॉलेट से, और कुल कितने रुपये कटेंगे
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "पहले लॉग-इन करें", 401);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse("BAD_REQUEST", "भेजा गया डेटा सही नहीं है", 400);
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("VALIDATION_FAILED", `एक बार में 1 से ${MAX_BATCH} फ़ोटो तक`, 400);
    }

    const status = await getQuotaStatus(user.id);
    const count = parsed.data.count;

    const coveredByQuota = Math.min(count, status.posterLeft);
    const fromWallet = count - coveredByQuota;
    const costPaise = fromWallet * PRICE_PAISE.ai_poster;

    return NextResponse.json({
      count,
      coveredByQuota,
      fromWallet,
      costPaise,
      costLabel: formatRupees(costPaise),
      walletPaise: status.walletPaise,
      walletLabel: formatRupees(status.walletPaise),
      enoughWallet: status.walletPaise >= costPaise,
      quotaWindow: status.posterWindow,
    });
  } catch (error) {
    console.error("batch quote: unexpected error", error);
    return errorResponse("INTERNAL", "सर्वर पर गड़बड़ हुई, थोड़ी देर बाद दोबारा कोशिश करें", 500);
  }
}