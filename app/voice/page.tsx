import { VoiceAssistant } from "@/components/voice/VoiceAssistant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "दोस्त";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const first = profile?.full_name?.trim().split(" ")[0];
    if (first) name = first;
  }

  return <VoiceAssistant name={name} loggedIn={Boolean(user)} />;
}