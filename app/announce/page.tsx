import Link from "next/link";
import { redirect } from "next/navigation";
import { AnnounceForm } from "@/components/announce/AnnounceForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AnnouncePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/announce");

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>घोषणा करें</h1>
      <p className="muted">
        लिखें या माइक दबाकर बोलें। यह सार्वजनिक फ़ीड पर सबको दिखेगी।
      </p>
      <AnnounceForm />
      <p className="muted footer">
        <Link href="/feed">सभी घोषणाएं देखें</Link>
      </p>
    </main>
  );
}