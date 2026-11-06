import { NextResponse, type NextRequest } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VOICE_BUCKET } from "@/lib/voice/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const ALLOWED = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/amr"];

function extensionFor(type: string): string {
  if (type === "audio/webm") return "webm";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/amr") return "amr";
  return "m4a";
}

function errorJson(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  // 1. सिर्फ login यूज़र
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson("UNAUTHORIZED", "पहले लॉग-इन करें", 401);

  // 2. फाइल जांचें
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson("BAD_REQUEST", "आवाज़ की फाइल नहीं मिली", 400);
  }

  const file = form.get("audio");
  if (!(file instanceof File)) return errorJson("NO_AUDIO", "आवाज़ की फाइल नहीं मिली", 400);
  if (file.size === 0 || file.size > MAX_BYTES) {
    return errorJson("BAD_SIZE", "आवाज़ 10 MB से छोटी और खाली न हो", 400);
  }

  const baseType = (file.type.split(";")[0] ?? "").trim();
  if (!ALLOWED.includes(baseType)) {
    return errorJson("UNSUPPORTED_AUDIO", `यह audio format समर्थित नहीं: ${baseType || "unknown"}`, 415);
  }

  const admin = createSupabaseAdminClient();
  const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(baseType)}`;
  const data = Buffer.from(await file.arrayBuffer());

  // 3. निजी bucket में रखें
  const { error: uploadError } = await admin.storage
    .from(VOICE_BUCKET)
    .upload(path, data, { contentType: baseType });
  if (uploadError) {
    console.error("voice web upload failed", uploadError);
    return errorJson("UPLOAD_FAILED", `Upload नहीं हो पाया: ${uploadError.message}`, 500);
  }

  try {
    const { data: signed, error: signError } = await admin.storage
      .from(VOICE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signError || !signed) {
      return errorJson("SIGN_FAILED", "Audio link नहीं बन पाया", 500);
    }

    // 4. Transcribe (Fal whisper)
    const provider = getAIProvider();
    const result = await provider.transcribe({ audioUrl: signed.signedUrl, language: "hi" });

    await logCost({
      step: "voice",
      provider: provider.name,
      model: "transcribe",
      costPaise: result.costPaise,
      meta: { source: "web" },
    });

    return NextResponse.json({ text: result.text ?? "", provider: provider.name });
  } catch (error) {
    console.error("voice web transcribe failed", error);
    return errorJson(
      "TRANSCRIBE_FAILED",
      error instanceof Error ? error.message : "आवाज़ को लिखा नहीं जा सका",
      502,
    );
  } finally {
    // 5. गोपनीयता: आवाज़ की फाइल काम के बाद हटाएं
    await admin.storage.from(VOICE_BUCKET).remove([path]).catch(() => undefined);
  }
}