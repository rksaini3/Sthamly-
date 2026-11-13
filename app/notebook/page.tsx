import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/library/Library.module.css";
import { CaptionActions } from "@/components/library/CaptionActions";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { loadLibrary } from "@/lib/library";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// नोटबुक: दुकान के सारे ऑफ़र और उनसे बने पोस्टर, कैप्शन के साथ, एक ही जगह
export default async function NotebookPage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = LABELS[lang].notes;
  const statusLabel = { queued: t.queued, running: t.running, done: t.done, failed: t.failedStatus };
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
        <h1 style={{ margin: 0 }}>{t.title}</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

  const items = await loadLibrary(supabase);

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{t.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t.sub}
      </p>

      {items.length === 0 && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            {t.empty}
          </p>
          <Link href="/voice" className="btn btn-primary btn-block">
            {t.start}
          </Link>
        </div>
      )}

      {items.map((item) => (
        <div key={item.jobId} className={`card ${styles.item}`}>
          {item.posterUrl ? (
            <a href={item.posterUrl} target="_blank" rel="noreferrer" aria-label={t.open}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.posterUrl} alt={t.posterAlt} className={styles.thumb} loading="lazy" />
            </a>
          ) : (
            <div className={styles.thumbEmpty}>{item.status === "failed" ? t.failed : t.none}</div>
          )}

          <div className={styles.body}>
            <p className={styles.offer}>{item.offerText || t.offer}</p>
            <p className={styles.meta}>
              {item.occasion ? `${item.occasion} · ` : ""}
              {formatDate(item.createdAt, lang)} · {statusLabel[item.status]}
            </p>
            {item.caption && <p className={styles.caption}>{item.caption}</p>}
            {item.caption && (
              <CaptionActions
                text={item.caption}
                copyLabel={t.copy}
                copiedLabel={t.copied}
                whatsappLabel={t.whatsapp}
              />
            )}
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <Link href="/my-posters" className="btn btn-block">
          {t.more}
        </Link>
      )}
    </main>
  );
}