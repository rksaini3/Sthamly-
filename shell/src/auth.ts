import { createClient } from "@supabase/supabase-js";

// anon key सार्वजनिक है और APK में जा सकती है। service role key कभी नहीं।
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** phone E.164 में हो, जैसे +919876543210 */
export async function sendOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyOtp(phone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw error;
}

/** APK की API calls के लिए Bearer token */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}