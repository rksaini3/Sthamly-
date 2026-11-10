import Link from "next/link";
import { AnnouncementComposer } from "@/components/feed/AnnouncementComposer";
import { type FeedComment } from "@/components/feed/CommentsSection";
import { FeedCard } from "@/components/feed/FeedCard";
import { FeedHeader } from "@/components/feed/FeedHeader";
import feedStyles from "@/components/feed/FeedCard.module.css";
import { formatDate } from "@/lib/format";
import { getActivePlan } from "@/lib/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AnnouncementItem {
  id: string;
  user_id: string;
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

  // एडिट सिर्फ़ प्रीमियम और बिज़नेस में। प्लान न पढ़ा जाए तो मुफ़्त मानें।
  const plan = user ? await getActivePlan(user.id).catch(() => "free" as const) : "free";
  const canEdit = plan === "premium" || plan === "business";

  let unread = 0;
  if (user) {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    unread = count ?? 0;
  }

  const { data: annData, error: annError } = await supabase
    .from("announcements")
    .select("id, user_id, shop_name, body, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);
  if (annError) console.error("output announcements read failed", annError.message);
  const announcements = (annData ?? []) as AnnouncementItem[];

  const commentsByAnnouncement = new Map<string, FeedComment[]>();
  if (announcements.length > 0) {
    const { data: cdata, error: cerror } = await supabase
      .from("announcement_comments")
      .select("id, announcement_id, user_id, author_name, body, created_at")
      .in("announcement_id", announcements.map((a) => a.id))
      .eq("status", "published")
      .order("created_at", { ascending: true });
    if (cerror) console.error("output comments read failed", cerror.message);
    for (const c of cdata ?? []) {
      const list = commentsByAnnouncement.get(c.announcement_id) ?? [];
      list.push({
        id: c.id,
        user_id: c.user_id,
        author_name: c.author_name,
        body: c.body,
        created_at: c.created_at,
      });
      commentsByAnnouncement.set(c.announcement_id, list);
    }
  }

  return (
    <>
      <FeedHeader initial={initial} loggedIn={Boolean(user)} unread={unread} />

      <main className="page stack">
        <AnnouncementComposer loggedIn={Boolean(user)} />

        {announcements.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>अभी कोई घोषणा नहीं है।</p>
          </div>
        )}

        {announcements.length > 0 && (
          <section className={feedStyles.list}>
            {announcements.map((a) => (
              <FeedCard
                key={a.id}
                id={a.id}
                shopName={a.shop_name}
                body={a.body}
                time={formatDate(a.created_at)}
                comments={commentsByAnnouncement.get(a.id) ?? []}
                loggedIn={Boolean(user)}
                currentUserId={user?.id ?? null}
                isOwner={Boolean(user) && a.user_id === user?.id}
                canEdit={canEdit}
              />
            ))}
          </section>
        )}

        <p className="muted footer">
          <Link href="/my-posters">मेरे बनाए देखें</Link>
        </p>
      </main>
    </>
  );
}