import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// फोटो भेजने के बाद कितनी देर तक ऑफर का इंतज़ार करें
const PENDING_TTL_MS = 30 * 60 * 1000;

/** फोटो आने पर उसे "ऑफर का इंतज़ार" वाली स्थिति में रखें */
export async function setPendingPhoto(phone: string, photoPath: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("conversations").upsert(
    {
      phone,
      pending_photo_path: photoPath,
      pending_photo_at: now,
      updated_at: now,
    },
    { onConflict: "phone" },
  );
  if (error) throw error;
}

/**
 * ऑफर आने पर लंबित फोटो लें और स्थिति साफ करें।
 * एक फोटो एक ही ऑफर के लिए जाती है: दो ऑफर एक साथ आएं तो एक ही जीतेगा।
 * लौटाता है: फोटो का path, या null (कोई फोटो नहीं, या समय निकल गया, या कोई और ले चुका)।
 */
export async function takePendingPhoto(phone: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("pending_photo_path, pending_photo_at")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;

  const path = data?.pending_photo_path;
  const at = data?.pending_photo_at;
  if (!path || !at) return null;

  if (Date.now() - new Date(at).getTime() > PENDING_TTL_MS) return null;

  // सिर्फ वही फोटो साफ करें जो हमने अभी पढ़ी है
  const { data: cleared, error: clearError } = await supabase
    .from("conversations")
    .update({
      pending_photo_path: null,
      pending_photo_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", phone)
    .eq("pending_photo_path", path)
    .select("phone");
  if (clearError) throw clearError;

  return cleared && cleared.length > 0 ? path : null;
}