import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/library/Library.module.css";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { loadLibrary, type LibraryItem } from "@/lib/library";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<LibraryItem["status"], string> = {
  queued: "कतार में",
  running: "बन रहा है…",
  done: "तैयार",
  failed: "नहीं बन पाया",
};

// नोटबुक: दुकान के सारे ऑफ़र और उनसे बने पोस्टर, कैप्शन के साथ, एक ही जगह
export default async function NotebookPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notebook");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;
  if (!isRole(role)) redirect("/role");

  if (role !== "shopkeeper") {
    return (
      <main className="page stack">
        <h1 style={{ margin: 0 }}>नोटबुक</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

  const items = await loadLibrary(supabase);

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>नोटबुक</h1>
      <p className="muted" style={{ margin: 0 }}>
        आपके सारे ऑफ़र और उनसे बने पोस्टर, एक जगह।
      </p>

      {items.length === 0 && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            अभी नोटबुक खाली है। असिस्टेंट से अपना पहला ऑफ़र बताइए।
          </p>
          <Link href="/voice" className="btn btn-primary btn-block">
            नया काम शुरू करें
          </Link>
        </div>
      )}

      {items.map((item) => (
        <div key={item.jobId} className={`card ${styles.item}`}>
          {item.posterUrl ? (
            <a href={item.posterUrl} target="_blank" rel="noreferrer" aria-label="पोस्टर खोलें">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.posterUrl} alt="बना हुआ पोस्टर" className={styles.thumb} loading="lazy" />
            </a>
          ) : (
            <div className={styles.thumbEmpty}>{item.status === "failed" ? "नहीं बना" : "पोस्टर नहीं"}</div>
          )}

          <div className={styles.body}>
            <p className={styles.offer}>{item.offerText || "ऑफ़र"}</p>
            <p className={styles.meta}>
              {item.occasion ? `${item.occasion} · ` : ""}
              {formatDate(item.createdAt)} · {STATUS_LABEL[item.status]}
            </p>
            {item.caption && <p className={styles.caption}>{item.caption}</p>}
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <Link href="/my-posters" className="btn btn-block">
          मेरे बनाए में डाउनलोड और शेयर करें
        </Link>
      )}
    </main>
  );
}