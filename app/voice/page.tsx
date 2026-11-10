import { VoiceAssistant, type AssistantQuota } from "@/components/voice/VoiceAssistant";
import { getQuotaStatus } from "@/lib/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "दोस्त";
  let quota: AssistantQuota | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const first = profile?.full_name?.trim().split(" ")[0];
    if (first) name = first;

    // कोटे की गिनती न हो पाए तो भी असिस्टेंट खुले, बस बैलेंस की चिप न दिखे
    try {
      const status = await getQuotaStatus(user.id);
      quota = {
        posterLeft: status.posterLeft,
        posterWindow: status.posterWindow,
        walletPaise: status.walletPaise,
      };
    } catch (error) {
      console.error("voice page: quota read failed", error);
    }
  }

  return <VoiceAssistant name={name} loggedIn={Boolean(user)} quota={quota} />;
}