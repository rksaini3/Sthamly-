import { cookies } from "next/headers";
import { LiveCamera } from "@/components/live/LiveCamera";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// लाइव: कैमरा दिखाकर Sthamly से बात करें (लॉग-इन ज़रूरी)
export default async function LivePage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <LiveCamera lang={lang} loggedIn={Boolean(user)} />;
}