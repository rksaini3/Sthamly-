import { getPublicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendImage, sendTemplate, sendText } from "@/lib/whatsapp/client";

// WhatsApp का customer service window: दुकानदार के आखिरी मैसेज के 24 घंटे तक
// free-form मैसेज जा सकता है। उसके बाद सिर्फ Meta से approved templates।
const WINDOW_MS = 24 * 60 * 60 * 1000;

// ⚠️ ये templates Meta Business Manager में बनाकर approve करवाने होंगे।
// नाम और भाषा यहां वही होने चाहिए जो Meta पर हैं।
//
// output_ready (utility) body: "आपका पोस्टर तैयार है। देखने के लिए: {{1}}"
// job_failed   (utility) body: "माफ़ करें, आपका पोस्टर इस बार नहीं बन पाया। credit वापस कर दिया गया है।"
export const TEMPLATES = {
  outputReady: { name: "output_ready", language: "hi" },
  jobFailed: { name: "job_failed", language: "hi" },
} as const;

/**
 * क्या इस नंबर के साथ अभी free-form मैसेज भेजा जा सकता है?
 * आखिरी inbound मैसेज का समय `processed_messages` से लेते हैं।
 */
export async function isWindowOpen(phone: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("processed_messages")
    .select("processed_at")
    .eq("from_phone", phone)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  return Date.now() - new Date(data.processed_at).getTime() < WINDOW_MS;
}

/**
 * Poster तैयार होने की सूचना।
 * - खिड़की खुली: पोस्टर फोटो और caption सीधे।
 * - खिड़की बंद: template, जिसमें dashboard का link हो।
 */
export async function sendOutputReady(
  phone: string,
  input: { posterUrl: string; captionText: string; extraNote?: string | null },
): Promise<"window" | "template"> {
  if (await isWindowOpen(phone)) {
    await sendImage(phone, input.posterUrl, "आपका पोस्टर तैयार है");

    const caption = input.extraNote
      ? `${input.captionText}\n\n${input.extraNote}`
      : input.captionText;
    await sendText(phone, caption);
    return "window";
  }

  const dashboardUrl = `${getPublicEnv().NEXT_PUBLIC_APP_URL}/dashboard`;
  await sendTemplate(phone, TEMPLATES.outputReady.name, TEMPLATES.outputReady.language, [
    dashboardUrl,
  ]);
  return "template";
}

/**
 * विफलता की सूचना। खिड़की खुली हो तो सादा मैसेज, नहीं तो template।
 */
export async function sendJobFailed(phone: string): Promise<"window" | "template"> {
  if (await isWindowOpen(phone)) {
    await sendText(
      phone,
      "माफ़ करें, आपका पोस्टर इस बार नहीं बन पाया। आपका credit वापस कर दिया गया है। कृपया थोड़ी देर बाद दोबारा कोशिश करें।",
    );
    return "window";
  }

  await sendTemplate(phone, TEMPLATES.jobFailed.name, TEMPLATES.jobFailed.language);
  return "template";
}