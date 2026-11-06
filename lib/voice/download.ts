import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const GRAPH_VERSION = "v21.0";
export const VOICE_BUCKET = "voice-notes";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 15 * 60; // Fal को इतना समय काफ़ी है
const ALLOWED_AUDIO: string[] = ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"];

interface MediaInfo {
  url: string;
  mime_type: string;
  file_size?: number;
}

export interface SavedVoice {
  path: string;
  signedUrl: string;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/amr") return "amr";
  return "m4a";
}

/**
 * WhatsApp का voice note download करके निजी bucket में रखें।
 * लौटाता है: storage path और एक अस्थायी signed URL (Fal के लिए)।
 */
export async function saveVoiceNote(userId: string, mediaId: string): Promise<SavedVoice> {
  const { WHATSAPP_ACCESS_TOKEN } = getServerEnv();
  const auth = { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` };

  // Step 1: metadata
  const infoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: auth,
  });
  if (!infoRes.ok) {
    throw new Error(`WhatsApp media info failed (${infoRes.status})`);
  }
  const info = (await infoRes.json()) as MediaInfo;

  // "audio/ogg; codecs=opus" जैसे मान से सिर्फ़ base type लें
  const mimeType = (info.mime_type.split(";")[0] ?? "").trim();
  if (!ALLOWED_AUDIO.includes(mimeType)) {
    throw new Error(`unsupported audio type: ${info.mime_type}`);
  }
  if (info.file_size && info.file_size > MAX_AUDIO_BYTES) {
    throw new Error("voice note too large");
  }

  // Step 2: असली फाइल
  const fileRes = await fetch(info.url, { headers: auth });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp audio download failed (${fileRes.status})`);
  }
  const data = Buffer.from(await fileRes.arrayBuffer());
  if (data.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("voice note too large after download");
  }

  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(mimeType)}`;
  const admin = createSupabaseAdminClient();

  const { error: uploadError } = await admin.storage
    .from(VOICE_BUCKET)
    .upload(path, data, { contentType: mimeType });
  if (uploadError) {
    throw new Error(`voice upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(VOICE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signError || !signed) {
    throw new Error(`voice signed url failed: ${signError?.message ?? "no url"}`);
  }

  return { path, signedUrl: signed.signedUrl };
}