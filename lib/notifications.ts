import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type NotificationKind = "comment" | "job_done";

interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * यूज़र को in-app सूचना भेजें। सूचना न जाए तो भी मुख्य काम (कमेंट, job) नहीं रुकता,
 * इसलिए गड़बड़ी सिर्फ़ log होती है।
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("notifications").insert({
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
    if (error) console.error("notification insert failed", error.message);
  } catch (error) {
    console.error("notification insert crashed", error);
  }
}