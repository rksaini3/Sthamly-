import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/projects/${id}`);

  // RLS के हिसाब से सिर्फ़ अपना project दिखेगा
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: chats } = await supabase
    .from("chat_threads")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  return (
    <main className="page stack">
      <Link href="/projects" className="muted">
        ← सारे प्रोजेक्ट
      </Link>
      <h1 style={{ margin: 0 }}>{project.name}</h1>
      {project.description && (
        <p className="muted" style={{ margin: 0 }}>
          {project.description}
        </p>
      )}

      {(chats ?? []).length === 0 ? (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            इस प्रोजेक्ट में अभी कोई chat नहीं है।
          </p>
          <Link href="/voice" className="btn btn-primary btn-block">
            नई chat शुरू करें
          </Link>
        </div>
      ) : (
        (chats ?? []).map((chat) => (
          <Link key={chat.id} href={`/voice?chat=${chat.id}`} className="card">
            <strong>{chat.title}</strong>
          </Link>
        ))
      )}
    </main>
  );
}