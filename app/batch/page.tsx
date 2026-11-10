import Link from "next/link";
import { redirect } from "next/navigation";
import { BatchForm } from "@/components/batch/BatchForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BatchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/batch");

  // सबसे नई दुकान, बैच उसी के नाम पर बनेगा
  const { data: shop } = await supabase
    .from("shops")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="page stack" style={{ paddingTop: 64 }}>
      <header className="stack" style={{ gap: 4, paddingLeft: 4 }}>
        <span className="brand">Sthamly</span>
        <h1>बैच (सेलर)</h1>
        <span className="muted">एक बार में 10 फ़ोटो तक, हर फ़ोटो का एक पोस्टर</span>
      </header>

      {shop ? (
        <BatchForm shopId={shop.id} />
      ) : (
        <section className="card stack" style={{ gap: 8 }}>
          <span>बैच शुरू करने से पहले एक काम बनाएं।</span>
          <Link href="/voice">असिस्टेंट पर जाएं</Link>
        </section>
      )}
    </main>
  );
}