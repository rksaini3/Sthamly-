import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// फोटो भेजने के बाद कितनी देर तक ऑफर का इंतज़ार करें
const PENDING_TTL_MS = 30 * 60 * 1000;

// "डेटा हटाओ" के बाद कितनी देर तक पक्की करने का समय है
const ACTION_TTL_MS = 10 * 60 * 1000;

export type PendingAction = "erase";

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

/** "डेटा हटाओ" जैसी कार्रवाई को पक्का करने के लिए लंबित रखें */
export async function setPendingAction(phone: string, action: PendingAction): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("conversations").upsert(
    {
      phone,
      pending_action: action,
      pending_action_at: now,
      updated_at: now,
    },
    { onConflict: "phone" },
  );
  if (error) throw error;
}

/**
 * लंबित कार्रवाई लें और उसे साफ करें।
 * हर नया संदेश पिछली लंबित कार्रवाई को बंद करता है, इसलिए यह हर संदेश पर चलता है।
 * लौटाता है: कार्रवाई का नाम, या null (कुछ लंबित नहीं, या समय निकल गया)।
 */
export async function takePendingAction(phone: string): Promise<PendingAction | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("pending_action, pending_action_at")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;

  const action = data?.pending_action;
  const at = data?.pending_action_at;
  if (!action || !at) return null;

  // पढ़ते ही साफ करें
  const { error: clearError } = await supabase
    .from("conversations")
    .update({
      pending_action: null,
      pending_action_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", phone);
  if (clearError) throw clearError;

  if (Date.now() - new Date(at).getTime() > ACTION_TTL_MS) return null;
  return action === "erase" ? "erase" : null;
}