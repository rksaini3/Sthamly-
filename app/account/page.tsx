import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
import { SettingsGroup, SettingsRow } from "@/components/account/SettingsList";
import { LangSwitch } from "@/components/nav/LangSwitch";
import { ThemeSwitch } from "@/components/nav/ThemeSwitch";
import { LABELS } from "@/lib/labels";
import { getActivePlan, windowStart } from "@/lib/quota";
import { formatRupees, PLAN_ALLOWANCES, PLAN_LABEL } from "@/lib/pricing";
import { isRole, ROLE_INFO } from "@/lib/roles";
import { getWalletBalance } from "@/lib/wallet";
import { DICT, LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WINDOW_LABEL = {
  day: "आज",
  week: "इस हफ़्ते",
  month: "इस महीने",
} as const;

export default async function AccountPage() {
  const cookieStore = await cookies();
  const lang = parseLang(cookieStore.get(LANG_COOKIE)?.value);
  const dict = DICT[lang];
  const nav = LABELS[lang].nav;
  const t = (hi: string, en: string) => (lang === "en" ? en : hi);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role;

  const plan = await getActivePlan(user.id);
  const allowances = PLAN_ALLOWANCES[plan];
  const balancePaise = await getWalletBalance(user.id);

  // पोस्टर का खर्च उसकी विंडो से (मुफ़्त: आज, बाकी: इस महीने)
  const admin = createSupabaseAdminClient();
  const since = windowStart(allowances.poster.window).toISOString();
  const posterRes = await admin.rpc("credit_used", { p_user: user.id, p_kind: "poster", p_since: since });
  if (posterRes.error) {
    console.error("account: credit read failed", posterRes.error);
  }
  const posterUsed = posterRes.data ?? 0;

  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = meta.full_name || meta.name || user.email?.split("@")[0] || "";
  const initials = name.trim().slice(0, 2).toUpperCase() || "S";
  const isFree = plan === "free";
  const planName = isFree ? dict.planFree : PLAN_LABEL[plan];
  const roleName = isRole(role) ? ROLE_INFO[role].label : t("चुनी नहीं", "Not chosen");

  return (
    <main className="page stack" style={{ gap: 22, paddingBottom: 40 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          href="/voice"
          aria-label={t("वापस", "Back")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "var(--surface-2)",
            color: "var(--ink)",
            display: "grid",
            placeItems: "center",
            textDecoration: "none",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="brand">Sthamly</span>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div
          aria-hidden
          style={{
            width: 84,
            height: 84,
            borderRadius: 999,
            background: "#9aa9a4",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 30,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
        <strong style={{ fontSize: 20, wordBreak: "break-word", textAlign: "center" }}>{name}</strong>
      </div>

      <SettingsGroup title={t("खाता", "Account")}>
        <SettingsRow
          href="/pricing"
          label={isFree ? t("प्लान बढ़ाएँ", "Upgrade plan") : t("प्लान", "Plan")}
          value={isFree ? undefined : planName}
          accent={isFree}
        />
        <SettingsRow label={t("ईमेल", "Email")} value={user.email ?? ""} />
        <SettingsRow
          label={t("पोस्टर उपयोग", "Poster usage")}
          value={`${posterUsed} / ${allowances.poster.limit} · ${WINDOW_LABEL[allowances.poster.window]}`}
        />
        <SettingsRow href="/pricing" label={t("वॉलेट और रिचार्ज", "Wallet and recharge")} value={formatRupees(balancePaise)} />
        <SettingsRow href="/role" label={t("व्यवसाय का प्रकार", "Business type")} value={roleName} />
        <SettingsRow href="/onboarding" label={t("दुकान की जानकारी", "Shop details")} />
      </SettingsGroup>

      <SettingsGroup title={t("पसंद", "Preferences")}>
        <SettingsRow label={nav.theme} right={<ThemeSwitch label={nav.theme} labels={{ system: nav.themeAuto, light: nav.themeLight, dark: nav.themeDark }} />} />
        <SettingsRow label={nav.language} right={<LangSwitch lang={lang} label={nav.language} />} />
        <SettingsRow href="/notifications" label={nav.notifications} />
      </SettingsGroup>

      <SettingsGroup title={t("सुविधाएँ", "Tools")}>
        <SettingsRow href="/my-posters" label={t("मेरे बनाए काम", "My work")} />
        <SettingsRow href="/batch" label={nav.batch} />
        <SettingsRow href="/feed" label={nav.feed} />
        <SettingsRow href="/soon/campaigns" label={nav.campaign} />
        <SettingsRow href="/soon/scheduled" label={nav.later} />
        <SettingsRow href="/soon/apps" label={nav.connect} />
        <SettingsRow href="/soon/staff" label={nav.team} />
      </SettingsGroup>

      <SettingsGroup title={t("डेटा और गोपनीयता", "Data and privacy")}>
        <SettingsRow href="/notebook" label={nav.notes} />
        <SettingsRow href="/images" label={nav.gallery} />
        <SettingsRow href="/privacy" label={t("गोपनीयता केंद्र", "Privacy center")} />
      </SettingsGroup>

      <SettingsGroup title={t("जानकारी", "About")}>
        <SettingsRow href="/terms" label={t("शर्तें और नियम", "Terms and conditions")} />
      </SettingsGroup>

      <AccountActions dict={dict} />
    </main>
  );
}