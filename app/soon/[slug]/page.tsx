import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";

// v1 में जो हिस्से अभी नहीं हैं, उनका "जल्द आएगा" पन्ना (शब्द lib/labels.ts से, दोनों भाषाओं में)
export default async function SoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = LABELS[lang].soon;
  const item = t.items[slug];
  if (!item) notFound();

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{item.title}</h1>
      <div className="card stack">
        <p style={{ margin: 0 }}>{item.text}</p>
        <p className="muted" style={{ margin: 0 }}>
          {t.soonLine}
        </p>
        <Link href="/voice" className="btn btn-primary btn-block">
          {t.back}
        </Link>
      </div>
    </main>
  );
}