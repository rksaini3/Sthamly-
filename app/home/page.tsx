import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdaptiveHome, type AdaptiveData } from "@/components/ui/AdaptiveHome";
import { upcomingFestivals } from "@/lib/festivals";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { isRole } from "@/lib/roles";
import { mergeLayout } from "@/lib/ui/catalog";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// user की दुकानों के हाल के पोस्टर (सिर्फ़ उसी के, shop_id से छाना हुआ)
async function recentPostersFor(userId: string): Promise<{ id: string; status: string }[]> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: shops, error: shopError } = await admin
      .from("shops")
      .select("id")
      .eq("user_id", userId);
    if (shopError) throw shopError;

    const shopIds = (shops ?? []).map((s) => s.id);
    if (shopIds.length === 0) return [];

    const { data: jobs, error: jobError } = await admin
      .from("jobs")
      .select("id, status")
      .in("shop_id", shopIds)
      .order("created_at", { ascending: false })
      .limit(5);
    if (jobError) throw jobError;

    return (jobs ?? []).map((j) => ({ id: j.id, status: j.status }));
  } catch (error) {
    // पोस्टर न पढ़ पाएं तो भी होम खुले, बस यह widget खाली दिखे
    console.error("home: recent posters read failed", error);
    return [];
  }
}

// भूमिका: न हो या गलत हो तो दुकानदार मानें
async function roleFor(userId: string, supabase: Supabase): Promise<Role> {
  try {
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return isRole(data?.role) ? data.role : "shopkeeper";
  } catch (error) {
    console.error("home: role read failed", error);
    return "shopkeeper";
  }
}

// सेव की हुई पसंद (न हो तो शुरुआती layout)
async function savedLayoutFor(userId: string, supabase: Supabase): Promise<unknown> {
  try {
    const { data: row } = await supabase
      .from("user_layouts")
      .select("items")
      .eq("user_id", userId)
      .maybeSingle();
    return row?.items ?? null;
  } catch (error) {
    console.error("home: layout read failed", error);
    return null;
  }
}

export default async function HomePage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/home");

  // तीनों जानकारी एक साथ लाएं (पहले एक के बाद एक आती थीं, इसलिए होम देर से खुलता था)
  const [role, saved, recentPosters] = await Promise.all([
    roleFor(user.id, supabase),
    savedLayoutFor(user.id, supabase),
    recentPostersFor(user.id),
  ]);

  const layout = mergeLayout(role, saved);

  const data: AdaptiveData = {
    recentPosters,
    festivals: upcomingFestivals(new Date(), lang),
    // सलाह का स्रोत बाद में जुड़ेगा (अभी खाली, तो tip_card नहीं दिखेगा)
    tip: null,
  };

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", minHeight: "100dvh", padding: "64px 0 24px" }}>
      <h1 style={{ margin: "0 16px 8px", fontSize: 22, fontWeight: 700 }}>
        {lang === "en" ? "Home" : "होम"}
      </h1>
      <AdaptiveHome layout={layout} lang={lang} data={data} />
    </main>
  );
}