import { cookies } from "next/headers";
import { z } from "zod";
import { VoiceAssistant, type AssistantQuota, type InitialMessage } from "@/components/voice/VoiceAssistant";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { getQuotaStatus } from "@/lib/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[]; n?: string | string[] }>;
}) {
  const params = await searchParams;
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const chatParam = first(params.chat);
  const newParam = first(params.n);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = LABELS[lang].va.defaultName;
  let quota: AssistantQuota | null = null;
  let threadId: string | null = null;
  let initialMessages: InitialMessage[] = [];

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const first = profile?.full_name?.trim().split(" ")[0];
    if (first) name = first;

    // इतिहास से पुरानी बातचीत खोलना (?chat=<id>)। न मिले या टेबल न बनी हो तो नई चैट खुले।
    if (chatParam && z.uuid().safeParse(chatParam).success) {
      try {
        const { data: thread } = await supabase
          .from("chat_threads")
          .select("id")
          .eq("id", chatParam)
          .maybeSingle();
        if (thread) {
          const { data: rows } = await supabase
            .from("chat_messages")
            .select("role, content")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true })
            .limit(200);
          threadId = thread.id;
          initialMessages = (rows ?? []).map((r) => ({ role: r.role, text: r.content }));
        }
      } catch (error) {
        console.error("voice page: chat history read failed", error);
      }
    }

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

  // key बदलने पर चैट नए सिरे से खुलती है (दूसरी बातचीत या "नया काम")
  return (
    <VoiceAssistant
      key={threadId ?? `new-${newParam ?? ""}`}
      name={name}
      loggedIn={Boolean(user)}
      quota={quota}
      lang={lang}
      initialThreadId={threadId}
      initialMessages={initialMessages}
    />
  );
}