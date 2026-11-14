"use client";

import Link from "next/link";
import { Component, type ReactNode } from "react";
import styles from "@/components/ui/AdaptiveHome.module.css";
import { WIDGET_INFO, type LayoutItem, type WidgetType } from "@/lib/ui/catalog";
import type { Lang } from "@/lib/i18n";

// ---- Data जो widgets को चाहिए (पेज से आता है, widget खुद fetch नहीं करता) ----

export interface AdaptiveData {
  recentPosters: { id: string; status: string }[];
  festivals: { name: string; when: string; prompt: string }[];
  tip: string | null;
}

interface RenderProps {
  lang: Lang;
  data: AdaptiveData;
}

// ---- Error boundary: एक widget टूटे तो बाकी स्क्रीन चलती रहे ----

class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ---- Widgets: हर type का एक fixed component ----

const POSTER_STATUS_HI: Record<string, string> = {
  queued: "कतार में",
  running: "बन रहा है",
  retry: "दोबारा कोशिश",
  done: "तैयार",
  failed: "नहीं बन पाया",
};

function QuickActions({ lang }: RenderProps) {
  const isEn = lang === "en";
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>{isEn ? "Quick actions" : "त्वरित काम"}</p>
      <div className={styles.actions}>
        <Link href="/voice" className={styles.actionBtn}>
          {isEn ? "New poster" : "नया पोस्टर"}
        </Link>
        <Link href="/my-posters" className={styles.actionBtn}>
          {isEn ? "My posters" : "मेरे पोस्टर"}
        </Link>
      </div>
    </div>
  );
}

function RecentPosters({ lang, data }: RenderProps) {
  const isEn = lang === "en";
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>{isEn ? "Recent posters" : "हाल के पोस्टर"}</p>
      {data.recentPosters.length === 0 ? (
        <p className={styles.muted}>{isEn ? "No posters yet." : "अभी कोई पोस्टर नहीं है।"}</p>
      ) : (
        <ul className={styles.list}>
          {data.recentPosters.slice(0, 5).map((p) => (
            <li key={p.id}>
              <Link href={`/my-posters`} className={styles.listItem}>
                {isEn ? p.status : POSTER_STATUS_HI[p.status] ?? p.status}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Festivals({ lang, data }: RenderProps) {
  const isEn = lang === "en";
  if (data.festivals.length === 0) return null;
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>{isEn ? "Upcoming festivals" : "आने वाले त्योहार"}</p>
      <ul className={styles.list}>
        {data.festivals.slice(0, 3).map((f) => (
          <li key={f.name}>
            <Link href={`/voice?prompt=${encodeURIComponent(f.prompt)}`} className={styles.listItem}>
              {f.name} ({f.when})
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipCard({ lang, data }: RenderProps) {
  if (!data.tip) return null;
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>{lang === "en" ? "Tip" : "सलाह"}</p>
      <p className={styles.muted}>{data.tip}</p>
    </div>
  );
}

// fixed map: इसमें न हो तो widget दिखेगा ही नहीं
const WIDGET_RENDERERS: Record<WidgetType, (props: RenderProps) => ReactNode> = {
  quick_actions: (p) => <QuickActions {...p} />,
  recent_posters: (p) => <RecentPosters {...p} />,
  festivals: (p) => <Festivals {...p} />,
  tip_card: (p) => <TipCard {...p} />,
};

// ---- मुख्य renderer ----

export function AdaptiveHome({
  layout,
  lang = "hi",
  data,
}: {
  layout: LayoutItem[];
  lang?: Lang;
  data: AdaptiveData;
}) {
  // छिपे widgets छोड़ें, mandatory हमेशा दिखेगा (mergeLayout यही सुनिश्चित करता है)
  const shown = layout.filter((item) => {
    if (WIDGET_INFO[item.type].mandatory) return true;
    return !item.hidden;
  });

  return (
    <div className={styles.grid}>
      {shown.map((item) => {
        const render = WIDGET_RENDERERS[item.type];
        // अनजान type (जो इस map में नहीं) को चुपचाप छोड़ें
        if (!render) return null;
        return (
          <WidgetBoundary key={item.type}>
            {render({ lang, data })}
          </WidgetBoundary>
        );
      })}
    </div>
  );
}