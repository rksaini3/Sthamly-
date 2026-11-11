import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role;
  if (!isRole(role)) redirect("/role");

  if (role !== "shopkeeper") {
    return (
      <main className="page stack">
        <div className="stack" style={{ gap: 6 }}>
          <p className="brand">Sthamly</p>
          <h1>नया पोस्ट</h1>
        </div>
        <ComingSoon role={role} />
      </main>
    );
  }

  return (
    <main className="page stack">
      <div className="stack" style={{ gap: 6 }}>
        <p className="brand">Sthamly</p>
        <h1>दुकान की जानकारी</h1>
      </div>
      <OnboardingForm />
    </main>
  );
}