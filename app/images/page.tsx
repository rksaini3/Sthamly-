import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/library/Library.module.css";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { loadLibrary } from "@/lib/library";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// गैलरी: अब तक बने सारे पोस्टर की तस्वीरें, एक ग्रिड में
export default async function ImagesPage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = LABELS[lang].gallery;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/images");

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

  const items = (await loadLibrary(supabase)).filter((item) => item.posterUrl);

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{t.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t.sub} ({items.length}). {t.tap}
      </p>

      {items.length === 0 ? (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            {t.empty}
          </p>
          <Link href="/voice" className="btn btn-primary btn-block">
            {t.start}
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <a key={item.jobId} href={item.posterUrl ?? "#"} target="_blank" rel="noreferrer" className={styles.tile}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.posterUrl ?? ""} alt={item.offerText || t.posterAlt} className={styles.tileImg} loading="lazy" />
              <span className={styles.meta}>{formatDate(item.createdAt, lang)}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}