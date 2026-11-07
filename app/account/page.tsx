import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account/AccountActions";
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

const box: React.CSSProperties = {
  background: "#1b1b1b",
  border: "1px solid #2a2a2a",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

// इस महीने की शुरुआत (IST) का ISO समय
function currentPeriodStart(): string {
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
    <main
      style={{
        minHeight: "100dvh",
        padding: "24px 16px 32px",
        background: "#0f0f0f",
        color: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      <p style={{ margin: 0, color: "#e8581c", fontWeight: 700, fontSize: 18 }}>Sthamly</p>
      <h1 style={{ margin: "4px 0 8px", fontSize: 32, fontWeight: 700 }}>खाता</h1>

      <div style={box}>
        <strong style={{ wordBreak: "break-all" }}>{user.email}</strong>
        <span style={{ color: "#a3a3a3" }}>{PLAN_LABEL[plan]} प्लान</span>
      </div>

      <div style={box}>
        <strong>इस महीने का उपयोग</strong>
        <span>पोस्टर: {posterUsed} / {limits.poster}</span>
        <span>रील: {reelUsed} / {limits.reel}</span>
        {plan === "free" && (
          <span style={{ color: "#a3a3a3", fontSize: 14 }}>
            वीआईपी पास का भुगतान जल्द शुरू होगा।{" "}
            <Link href="/pricing" style={{ color: "#e8581c" }}>प्लान देखें</Link>
          </span>
        )}
      </div>

      <div style={{ ...box, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <strong>भूमिका: {ROLE_INFO[role].label}</strong>
        <Link href="/role" style={{ color: "#e8581c" }}>बदलें</Link>
      </div>

      <AccountActions />

      <p style={{ margin: "12px 0 0", color: "#a3a3a3", fontSize: 13, textAlign: "center" }}>
        <Link href="/privacy" style={{ color: "#a3a3a3" }}>गोपनीयता नीति</Link> ·{" "}
        <Link href="/terms" style={{ color: "#a3a3a3" }}>शर्तें</Link>
      </p>
    </main>
  );
}