import Link from "next/link";
import { AnnouncementComposer } from "@/components/feed/AnnouncementComposer";
import { CommentsSection, type FeedComment } from "@/components/feed/CommentsSection";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { ReportButton } from "@/components/feed/ReportButton";
import { ShareText } from "@/components/feed/ShareText";
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

  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };
  const initial = (profile?.full_name?.trim().charAt(0) || "S").toUpperCase();

  const { data: annData, error: annError } = await supabase
    .from("announcements")
    .select("id, shop_name, body, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  if (annError) console.error("output announcements read failed", annError.message);
  const announcements = (annData ?? []) as AnnouncementItem[];

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
    <>
      <FeedHeader initial={initial} loggedIn={Boolean(user)} />

      <main className="page stack">
        <AnnouncementComposer loggedIn={Boolean(user)} />

        {announcements.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>अभी कोई घोषणा नहीं है।</p>
          </div>
        )}

        {announcements.map((a) => (
          <article key={a.id} className="card stack" style={{ gap: 10 }}>
            <div className="row">
              <strong>{a.shop_name}</strong>
              <span className="job-date">{formatDate(a.created_at)}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{a.body}</p>
            <ShareText text={`📢 ${a.shop_name}\n${a.body}`} />
            <CommentsSection
              announcementId={a.id}
              comments={commentsByAnnouncement.get(a.id) ?? []}
              loggedIn={Boolean(user)}
            />
            <ReportButton id={a.id} kind="announcement" />
          </article>
        ))}

        <p className="muted footer">
          <Link href="/my-posters">मेरे पोस्ट देखें</Link>
        </p>
      </main>
    </>
  );
}