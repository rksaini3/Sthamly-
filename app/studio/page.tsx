import { redirect } from "next/navigation";
import { StudioClient } from "@/components/studio/StudioClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio");

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>Studio</h1>
      <p className="muted" style={{ margin: 0 }}>
        वेबसाइट, इमेज, PPTX और PDF एक जगह।
      </p>
      <StudioClient />
    </main>
  );
}