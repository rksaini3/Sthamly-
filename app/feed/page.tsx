import Link from "next/link";
import { CommentsSection, type FeedComment } from "@/components/feed/CommentsSection";
import { ReportButton } from "@/components/feed/ReportButton";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AnnouncementItem {
  id: string;
  shop_name: string;
  body: string;
  created_at: string;
}

export default async function OutputFeedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. घोषणाएं (RLS: सिर्फ़ published)
  const { data: annData, error: annError } = await supabase
    .from("announcements")
    .select("id, shop_name, body, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  if (annError) console.error("output announcements read failed", annError.message);
  const announcements = (annData ?? []) as AnnouncementItem[];

  // 2. कमेंट, सभी घोषणाओं के लिए एक साथ
  const commentsByAnnouncement = new Map<string, FeedComment[]>();
  if (announcements.length > 0) {
    const { data: cdata, error: cerror } = await supabase
      .from("announcement_comments")
      .select("id, announcement_id, author_name, body, created_at")
      .in("announcement_id", announcements.map((a) => a.id))
      .eq("status", "published")
      .order("created_at", { ascending: true });
    if (cerror) console.error("output comments read failed", cerror.message);
    for (const c of cdata ?? []) {
      const list = commentsByAnnouncement.get(c.announcement_id) ?? [];
      list.push({ id: c.id, author_name: c.author_name, body: c.body, created_at: c.created_at });
      commentsByAnnouncement.set(c.announcement_id, list);
    }
  }

  return (
    <main className="page stack">
      <span className="brand">Sthamly</span>
      <div className="row">
        <h1 style={{ margin: 0 }}>आउटपुट</h1>
        <Link href="/announce" className="btn btn-primary">
          घोषणा करें
        </Link>
      </div>
      <p className="muted">सभी दुकानों की घोषणाएं यहां दिखती हैं।</p>

      {announcements.length === 0 && (
        <div className="card">
          <p className="muted">अभी कोई घोषणा नहीं है।</p>
        </div>
      )}

      {announcements.map((a) => (
        <article key={a.id} className="card stack" style={{ gap: 10 }}>
          <div className="row">
            <strong>{a.shop_name}</strong>
            <span className="job-date">{formatDate(a.created_at)}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
          <CommentsSection
            announcementId={a.id}
            comments={commentsByAnnouncement.get(a.id) ?? []}
            loggedIn={Boolean(user)}
          />
          <ReportButton id={a.id} kind="announcement" />
        </article>
      ))}
    </main>
  );
}