import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cloudflareProvider } from "@/lib/ai/cloudflare";
import { allowRequest } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OUTPUT_BUCKET = "outputs"; // private; signed URL से ही दिखेगी
const SIGNED_URL_SECONDS = 60 * 60 * 24;
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_REQUESTS = 15;

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(300),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  const allowed = await allowRequest(`studio-image:${user.id}`, RATE_WINDOW_SECONDS, RATE_MAX_REQUESTS);
  if (!allowed) return errorResponse(429, "RATE_LIMITED", "थोड़ी देर बाद दोबारा कोशिश करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "इमेज का विवरण कम से कम 3 अक्षर का लिखें");

  try {
    // Cloudflare flux-1-schnell से base64 image (data URL के रूप में)
    const generated = await cloudflareProvider.generateImage({ prompt: parsed.data.prompt, size: "1:1" });
    const dataUrl = generated.url ?? "";
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("image data नहीं मिला");
    const bytes = Buffer.from(base64, "base64");

    // Supabase Storage में सेव, यूज़र के अपने folder में
    const path = `${user.id}/studio/${crypto.randomUUID()}.jpg`;
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from(OUTPUT_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);

    const { data: signed, error: signError } = await admin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signError || !signed) throw new Error("signed url नहीं बना");

    return NextResponse.json({ imageUrl: signed.signedUrl, path });
  } catch (error) {
    console.error("studio image failed", error instanceof Error ? error.message : error);
    return errorResponse(502, "AI_UNAVAILABLE", "इमेज नहीं बन पाई, थोड़ी देर बाद दोबारा कोशिश करें");
  }
}