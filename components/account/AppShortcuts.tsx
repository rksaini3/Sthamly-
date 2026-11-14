import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";

// प्रोफ़ाइल पर वे सुविधाएँ जो पहले साइडबार में जगह घेरती थीं
const ITEMS = [
  { href: "/soon/campaigns", key: "campaign" },
  { href: "/soon/scheduled", key: "later" },
  { href: "/soon/apps", key: "connect" },
  { href: "/soon/staff", key: "team" },
  { href: "/batch", key: "batch" },
  { href: "/feed", key: "feed" },
] as const;

export function AppShortcuts({ lang }: { lang: Lang }) {
  const t = LABELS[lang].nav;
  return (
    <section className="card stack" style={{ gap: 4 }}>
      <strong>{lang === "en" ? "More tools" : "और सुविधाएँ"}</strong>
      <nav aria-label={t.mainList} className="stack" style={{ gap: 2 }}>
        {ITEMS.map((item) => (
          <Link key={item.key} href={item.href} className="row" style={{ padding: "10px 0" }}>
            <span>{t[item.key]}</span>
            <span className="muted" aria-hidden>
              ›
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}