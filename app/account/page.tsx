import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
import { AccountMenu } from "@/components/account/AccountMenu";
import { PLAN_ALLOWANCES, PLAN_LABEL, formatRupees } from "@/lib/pricing";
import { getActivePlan, windowStart } from "@/lib/quota";
import { getWalletBalance } from "@/lib/wallet";
import { isRole, ROLE_INFO } from "@/lib/roles";
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
  if (!isRole(role)) redirect("/role");

  const plan = await getActivePlan(user.id);
  const allowances = PLAN_ALLOWANCES[plan];
  const now = new Date();

  // हर प्रकार का खर्च उसकी अपनी विंडो से (मुफ़्त पोस्टर: आज, मुफ़्त रील: इस हफ़्ते, बाकी: इस महीने)
  const admin = createSupabaseAdminClient();
  const [posterRes, reelRes, balancePaise] = await Promise.all([
    admin.rpc("credit_used", {
      p_user: user.id,
      p_kind: "poster",
      p_since: windowStart(allowances.poster.window, now).toISOString(),
    }),
    admin.rpc("credit_used", {
      p_user: user.id,
      p_kind: "reel",
      p_since: windowStart(allowances.reel.window, now).toISOString(),
    }),
    getWalletBalance(user.id),
  ]);
  if (posterRes.error || reelRes.error) {
    console.error("account: credit read failed", posterRes.error ?? reelRes.error);
  }
  const posterUsed = posterRes.data ?? 0;
  const reelUsed = reelRes.data ?? 0;

  // मुफ़्त प्लान का नाम dict से, बाकी प्लान का नाम PLAN_LABEL से
  const planName = plan === "free" ? dict.planFree : PLAN_LABEL[plan];

  return (
    <main className="page stack">
      <header className="row">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand">Sthamly</span>
          <h1>{dict.title}</h1>
        </div>
        <AccountMenu dict={dict} lang={lang}>
          <AccountActions dict={dict} />
        </AccountMenu>
      </header>

      <section className="card stack" style={{ gap: 6 }}>
        <strong style={{ wordBreak: "break-all" }}>{user.email}</strong>
        <span className="muted">
          {dict.plan}: {planName}
        </span>
      </section>

      <section className="card stack" style={{ gap: 6 }}>
        <strong>{dict.usage}</strong>
        <span>
          {dict.posters}: {posterUsed} / {allowances.poster.limit} ({WINDOW_LABEL[allowances.poster.window]})
        </span>
        <span>
          {dict.reels}: {reelUsed} / {allowances.reel.limit} ({WINDOW_LABEL[allowances.reel.window]})
        </span>
        {plan === "free" && (
          <span className="muted">
            {dict.paidSoon} <Link href="/pricing">{dict.seePlans}</Link>
          </span>
        )}
      </section>

      <section className="card stack" style={{ gap: 6 }}>
        <strong>वॉलेट</strong>
        <span>बैलेंस: {formatRupees(balancePaise)}</span>
        <Link href="/pricing">रिचार्ज करें</Link>
      </section>

      <section className="card row">
        <span>
          <strong>{dict.role}:</strong> {ROLE_INFO[role].label}
        </span>
        <Link href="/role">{dict.changeRole}</Link>
      </section>
    </main>
  );
}