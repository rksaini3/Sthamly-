import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadImage } from "@/lib/whatsapp/client";

// Storage bucket का नाम (supabase/migrations/0006_storage.sql से मेल खाता है)
const BUCKET = "shop-photos";

// Bucket सिर्फ jpeg और png लेता है, इसलिए बाकी प्रकार यहीं रोक दें
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export class UnsupportedPhotoError extends Error {
  constructor(mimeType: string) {
    super(`unsupported photo type: ${mimeType}`);
    this.name = "UnsupportedPhotoError";
  }
}

/**
 * WhatsApp की फोटो download करके यूज़र के folder में सहेजें।
 * Path `${userId}/${uuid}.jpg` जैसा रहता है, ताकि storage policy (folder = user id) लागू हो।
 * लौटाया गया path बाद में पोस्टर बनाते समय जॉब में इस्तेमाल होगा।
 */
export async function saveWhatsAppPhoto(userId: string, mediaId: string): Promise<string> {
  const image = await downloadImage(mediaId);

  const ext = EXTENSIONS[image.mimeType];
  if (!ext) throw new UnsupportedPhotoError(image.mimeType);

  const path = `${userId}/${randomUUID()}.${ext}`;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, image.data, {
    contentType: image.mimeType,
    upsert: false,
  });
  if (error) throw error;

  return path;
}