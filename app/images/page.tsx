import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/components/library/Library.module.css";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { loadLibrary } from "@/lib/library";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// इमेज: अब तक बने सारे पोस्टर की तस्वीरें, एक ग्रिड में
export default async function ImagesPage() {
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
        <h1 style={{ margin: 0 }}>इमेज</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

  const items = (await loadLibrary(supabase)).filter((item) => item.posterUrl);

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>इमेज</h1>
      <p className="muted" style={{ margin: 0 }}>
        आपके बनाए सारे पोस्टर। दबाकर बड़ा देखें।
      </p>

      {items.length === 0 ? (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            अभी कोई पोस्टर नहीं बना है।
          </p>
          <Link href="/voice" className="btn btn-primary btn-block">
            नया काम शुरू करें
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <a key={item.jobId} href={item.posterUrl ?? "#"} target="_blank" rel="noreferrer" className={styles.tile}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.posterUrl ?? ""} alt={item.offerText || "पोस्टर"} className={styles.tileImg} loading="lazy" />
              <span className={styles.meta}>{formatDate(item.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}