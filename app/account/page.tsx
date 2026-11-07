import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
import { AccountMenu } from "@/components/account/AccountMenu";
import { currentPeriodStart, getActivePlan, PLAN_LIMITS } from "@/lib/quota";
import { isRole, ROLE_INFO } from "@/lib/roles";
import { DICT, LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
  const limits = PLAN_LIMITS[plan];

  // इस महीने कितने credit खर्च हुए (ledger से)
  const admin = createSupabaseAdminClient();
  const since = currentPeriodStart();
  const [posterRes, reelRes] = await Promise.all([
    admin.rpc("credit_used", { p_user: user.id, p_kind: "poster", p_since: since }),
    admin.rpc("credit_used", { p_user: user.id, p_kind: "reel", p_since: since }),
  ]);
  if (posterRes.error || reelRes.error) {
    console.error("account: credit read failed", posterRes.error ?? reelRes.error);
  }
  const posterUsed = posterRes.data ?? 0;
  const reelUsed = reelRes.data ?? 0;

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
          {dict.plan}: {plan === "vip" ? dict.planVip : dict.planFree}
        </span>
      </section>

      <section className="card stack" style={{ gap: 6 }}>
        <strong>{dict.usage}</strong>
        <span>
          {dict.posters}: {posterUsed} / {limits.poster}
        </span>
        <span>
          {dict.reels}: {reelUsed} / {limits.reel}
        </span>
        {plan === "free" && (
          <span className="muted">
            {dict.paidSoon} <Link href="/pricing">{dict.seePlans}</Link>
          </span>
        )}
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