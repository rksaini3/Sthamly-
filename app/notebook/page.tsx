import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/library/Library.module.css";
import { CaptionActions } from "@/components/library/CaptionActions";
import { NotebookAutoToggle } from "@/components/library/NotebookAutoToggle";
import { NotebookItemActions } from "@/components/library/NotebookItemActions";
import { NotebookNotes } from "@/components/library/NotebookNotes";
import { formatDate } from "@/lib/format";
import { loadLibrary } from "@/lib/library";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// नोटबुक: हर user के चैट नोट (सबके लिए), और दुकानदार के पोस्टर (सिर्फ़ उसी के लिए)
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

  const isShopkeeper = role === "shopkeeper";

  // पोस्टर वाला हिस्सा सिर्फ़ दुकानदार के लिए
  let visible: Awaited<ReturnType<typeof loadLibrary>> = [];
  if (isShopkeeper) {
    const items = await loadLibrary(supabase);

    // नोटबुक से हटाए गए काम इस सूची में नहीं दिखेंगे।
    // अगर यह जांच विफल हो, तो सब दिखाएं (काम न छूटे)।
    const ids = items.map((i) => i.jobId);
    let hiddenIds = new Set<string>();
    if (ids.length > 0) {
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("jobs")
        .select("id")
        .eq("hidden_from_notebook", true)
        .in("id", ids);
      if (hiddenError) {
        console.error("notebook: hidden lookup failed", hiddenError);
      } else {
        hiddenIds = new Set((hiddenRows ?? []).map((r) => r.id));
      }
    }
    visible = items.filter((item) => !hiddenIds.has(item.jobId));
  }

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{t.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t.sub}
      </p>

      <NotebookAutoToggle />

      {/* चैट के जवाब और हाथ से लिखे नोट: हर role के लिए */}
      <NotebookNotes lang={lang} />

      {/* पोस्टर: सिर्फ़ दुकानदार के लिए */}
      {isShopkeeper && (
        <section className="stack" style={{ gap: 12 }}>
          <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>पोस्टर</h2>

          {visible.length === 0 && (
            <div className="card stack">
              <p className="muted" style={{ margin: 0 }}>
                {t.empty}
              </p>
              <Link href="/voice" className="btn btn-primary btn-block">
                {t.start}
              </Link>
            </div>
          )}

          {visible.map((item) => (
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

                {item.failureReason && (
                  <p role="status" style={{ margin: "4px 0 0", fontSize: 13, color: "var(--danger)" }}>
                    {item.failureReason}
                  </p>
                )}

                {item.caption && <p className={styles.caption}>{item.caption}</p>}
                {item.caption && (
                  <CaptionActions
                    text={item.caption}
                    copyLabel={t.copy}
                    copiedLabel={t.copied}
                    whatsappLabel={t.whatsapp}
                  />
                )}

                <NotebookItemActions
                  jobId={item.jobId}
                  status={item.status}
                  offerText={item.offerText}
                  occasion={item.occasion}
                  caption={item.caption}
                />
              </div>
            </div>
          ))}

          {visible.length > 0 && (
            <Link href="/my-posters" className="btn btn-block">
              {t.more}
            </Link>
          )}
        </section>
      )}
    </main>
  );
}