import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
import { AccountMenu } from "@/components/account/AccountMenu";
import { getActivePlan, periodStarts } from "@/lib/quota";
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
  const since = periodStarts(plan);
  const posterRes = await admin.rpc("credit_used", { p_user: user.id, p_kind: "poster", p_since: since.poster });
  if (posterRes.error) {
    console.error("account: credit read failed", posterRes.error);
  }
  const posterUsed = posterRes.data ?? 0;

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
          {dict.plan}: {plan === "free" ? dict.planFree : PLAN_LABEL[plan]}
        </span>
      </section>

      <section className="card stack" style={{ gap: 6 }}>
        <strong>{dict.usage}</strong>
        <span>
          {dict.posters}: {posterUsed} / {allowances.poster.limit} ({WINDOW_LABEL[allowances.poster.window]})
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
          <strong>{dict.role}:</strong> {isRole(role) ? ROLE_INFO[role].label : "चुनी नहीं"}
        </span>
        <Link href="/role">{dict.changeRole}</Link>
      </section>
    </main>
  );
}