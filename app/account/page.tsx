import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
import { Card } from "@/components/ui/Card";
import { getActivePlan, PLAN_LIMITS } from "@/lib/quota";
import { isRole, ROLE_INFO } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Plan } from "@/types/domain";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<Plan, string> = {
  free: "मुफ़्त",
  vip: "वीआईपी पास",
};

// इस महीने की शुरुआत (IST), quota.ts के हिसाब से
function monthStartIso(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const startIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
  return new Date(startIst - IST_OFFSET_MS).toISOString();
}

export default async function AccountPage() {
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
  const since = monthStartIso();
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
      <h1 style={{ margin: 0 }}>खाता</h1>

      <Card>
        <div className="stack" style={{ gap: 4 }}>
          <strong>{user.email}</strong>
          <span className="muted">{PLAN_LABEL[plan]} प्लान</span>
        </div>
      </Card>

      <Card>
        <div className="stack" style={{ gap: 6 }}>
          <strong>इस महीने का उपयोग</strong>
          <p style={{ margin: 0 }}>
            पोस्टर: {posterUsed} / {limits.poster}
          </p>
          <p style={{ margin: 0 }}>
            रील: {reelUsed} / {limits.reel}
          </p>
          {plan === "free" && (
            <p className="muted" style={{ margin: 0 }}>
              वीआईपी पास का भुगतान जल्द शुरू होगा।{" "}
              <Link href="/pricing">प्लान देखें</Link>
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="row">
          <strong>भूमिका: {ROLE_INFO[role].label}</strong>
          <Link href="/role">बदलें</Link>
        </div>
      </Card>

      <AccountActions />

      <p className="muted footer">
        <Link href="/privacy">गोपनीयता नीति</Link> · <Link href="/terms">शर्तें</Link>
      </p>
    </main>
  );
}

// लॉग-आउट और डेटा हटाने का हिस्सा (browser में चलता है)
import { AccountActions as _unused } from "@/components/account/AccountActions";
</parameter>