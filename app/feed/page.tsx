import Link from "next/link";
import { ReportButton } from "@/components/feed/ReportButton";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, shop_name, body, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) console.error("feed read failed", error.message);
  const items = data ?? [];

  return (
    <main className="page stack">
      <span className="brand">Sthamly</span>
      <h1>ताज़ा घोषणाएं</h1>
      <p className="muted">दुकानों की ताज़ा घोषणाएं यहां दिखती हैं।</p>

      {error && <p className="alert alert-error">घोषणाएं नहीं मिल पाईं। पेज दोबारा खोलें।</p>}

      {!error && items.length === 0 && (
        <div className="card">
          <p className="muted">अभी कोई घोषणा नहीं है।</p>
        </div>
      )}

      {items.map((item) => (
        <article key={item.id} className="card stack" style={{ gap: 8 }}>
          <div className="row">
            <strong>{item.shop_name}</strong>
            <span className="job-date">{formatDate(item.created_at)}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
          <ReportButton id={item.id} />
        </article>
      ))}

      <p className="muted footer">
        <Link href="/announce">अपनी घोषणा डालें</Link>
      </p>
    </main>
  );
}