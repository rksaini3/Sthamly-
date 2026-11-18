import { cookies } from "next/headers";
import { LiveView, type ShopContext } from "@/components/live/LiveView";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// लाइव: बोलकर, कैमरा या स्क्रीन दिखाकर Sthamly से असली समय में बात करें (लॉग-इन ज़रूरी)
export default async function LivePage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // पहली दुकान का संदर्भ, ताकि जवाब उसी दुकान के हिसाब से हो
  let shop: ShopContext | null = null;
  if (user) {
    try {
      const { data } = await supabase
        .from("shops")
        .select("name, category")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (data?.name) shop = { name: data.name, category: data.category ?? "general" };
    } catch (error) {
      console.error("live page: shop read failed", error);
    }
  }

  return <LiveView lang={lang} shop={shop} />;
}
