import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { askAboutImage } from "@/lib/assistant/vision";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// तस्वीर फ़ोन पर ही छोटी (लगभग 768px JPEG) बनाकर आती है। इससे बड़ी हो तो मना।
const MAX_IMAGE_CHARS = 900_000;

const bodySchema = z.object({
  image: z
    .string()
    .max(MAX_IMAGE_CHARS)
    .refine((v) => v.startsWith("data:image/jpeg;base64,"), { message: "jpeg only" }),
  text: z.string().trim().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(600) }))
    .max(6)
    .default([]),
});

function fail(code: string, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message }, ...extra }, { status });
}

// Error का छोटा और सुरक्षित हिस्सा (key या लंबा text न जाए)
function shortReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/key=[^\s&]+/gi, "key=***").slice(0, 160);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "पहले लॉग-इन करें", 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_FAILED", "तस्वीर या सवाल सही नहीं है", 400);

  // रोज़ की मुफ़्त सीमा के बाद वॉलेट से थोड़े पैसे, पैसे न हों तो रुकें।
  let willPayPaise = 0;
  try {
    const usage = await checkUsage(user.id, "live");
    if (!usage.ok) {
      return fail("LIMIT_REACHED", "आज के मुफ़्त लाइव सवाल पूरे हो गए।", 402, {
        limit: { kind: "live", plan: usage.plan, walletPaise: usage.walletPaise, pricePaise: usage.pricePaise },
      });
    }
    willPayPaise = usage.willPayPaise;
  } catch (error) {
    console.error("live ask: usage check failed", error);
    return fail("USAGE_UNAVAILABLE", "लाइव अभी शुरू नहीं हो पाया, थोड़ी देर बाद कोशिश करें।", 503);
  }

  try {
    const reply = await askAboutImage({
      imageDataUrl: parsed.data.image,
      text: parsed.data.text,
      history: parsed.data.history,
      lang: parseLang(req.cookies.get(LANG_COOKIE)?.value),
    });
    if (!reply) return fail("EMPTY", "जवाब नहीं मिला, दोबारा पूछें", 502);

    await recordUsage(user.id, "live", willPayPaise);
    return NextResponse.json({ reply });
  } catch (error) {
    // पूरा error Vercel logs में जाए, और screen पर छोटा कारण दिखे
    console.error("live ask failed", error);
    const reason = shortReason(error);
    return fail("LIVE_FAILED", `अभी जवाब नहीं बन पाया (कारण: ${reason})`, 502);
  }
}