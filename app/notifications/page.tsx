import Link from "next/link";
import { redirect } from "next/navigation";
import { MarkAllRead } from "@/components/notifications/MarkAllRead";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface NotificationRow {
  id: string;
  kind: "comment" | "job_done";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) console.error("notifications read failed", error.message);

  const items = (error ? [] : (data ?? [])) as NotificationRow[];
  const unread = items.filter((n) => n.read_at === null).length;

  return (
    <main className="page stack">
      <div className="row">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand">Sthamly</span>
          <h1 style={{ margin: 0 }}>सूचनाएं</h1>
        </div>
        <Link href="/feed" className="btn btn-ghost">
          फ़ीड
        </Link>
      </div>

      <MarkAllRead disabled={unread === 0} />

      {items.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>अभी कोई सूचना नहीं है।</p>
        </div>
      )}

      {items.map((n) => {
        const content = (
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <strong style={{ fontWeight: n.read_at === null ? 700 : 500 }}>{n.title}</strong>
              <span className="job-date">{formatDate(n.created_at)}</span>
            </div>
            {n.body && <p className="muted" style={{ margin: 0 }}>{n.body}</p>}
          </div>
        );

        return (
          <div
            key={n.id}
            className="card"
            style={{ borderLeft: n.read_at === null ? "3px solid var(--accent)" : undefined }}
          >
            {n.link ? (
              <Link href={n.link} style={{ textDecoration: "none", color: "inherit" }}>
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}
    </main>
  );
}