import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Rate limit: एक key (जैसे "generate:<user id>") पर एक window में अधिकतम `max` requests।
//
// असली गिनती Supabase में होती है (function `rate_limit_hit`, migration 0008), ताकि
// Vercel के सारे instances में सीमा एक जैसी रहे। In-memory Map सिर्फ़ तभी इस्तेमाल होता है
// जब DB तक न पहुंचा जा सके, ताकि route पूरी तरह बंद न हो।

const memoryHits = new Map<string, number[]>();
const MEMORY_KEY_LIMIT = 10000;

/**
 * Request की अनुमति दें या नहीं।
 * true: सीमा के अंदर है, आगे बढ़ें। false: सीमा पार हो गई।
 */
export async function allowRequest(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });

    if (error) throw error;
    if (typeof data !== "boolean") {
      throw new Error("rate_limit_hit returned unexpected shape");
    }
    return data;
  } catch (error) {
    // DB की गड़बड़ी: log करें और memory से फ़ैसला लें (route बंद न हो)
    console.error("rate-limit: db check failed, using memory fallback", error);
    return allowInMemory(key, windowSeconds, max);
  }
}

// Fallback: सिर्फ़ इसी instance के अंदर। सीमा कमज़ोर है, पर सेवा चलती रहती है।
function allowInMemory(key: string, windowSeconds: number, max: number): boolean {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const recent = (memoryHits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= max) {
    memoryHits.set(key, recent);
    return false;
  }

  recent.push(now);
  memoryHits.set(key, recent);

  // Memory बहुत न बढ़े, इसलिए सीमा पार होने पर पूरा Map साफ़ करें
  if (memoryHits.size > MEMORY_KEY_LIMIT) memoryHits.clear();
  return true;
}