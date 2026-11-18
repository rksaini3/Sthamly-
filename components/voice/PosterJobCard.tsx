"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

interface Snapshot {
  status: "queued" | "running" | "done" | "failed";
  posterUrl: string | null;
  error: string | null;
}

// हर 3 सेकंड पर पूछें, ज़्यादा से ज़्यादा 3 मिनट तक
const POLL_MS = 3000;
const MAX_TRIES = 60;

const T = {
  hi: {
    working: "पोस्टर बन रहा है…",
    done: "आपका पोस्टर तैयार है",
    saved: "सेव्ड पोस्टर में देखें",
    gaveUp: "काम में ज़्यादा समय लग रहा है। थोड़ी देर बाद सेव्ड पोस्टर में देखें।",
    alt: "आपका बनाया पोस्टर",
  },
  en: {
    working: "Creating your poster…",
    done: "Your poster is ready",
    saved: "View in Saved posters",
    gaveUp: "This is taking longer than usual. Check Saved posters in a bit.",
    alt: "Your poster",
  },
} as const;

export function PosterJobCard({ jobId, lang = "hi" }: { jobId: string; lang?: Lang }) {
  const t = T[lang];
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    async function tick() {
      tries += 1;
      try {
        const res = await fetch(`/api/chat-poster/${jobId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Snapshot;
          if (cancelled) return;
          setSnap(data);
          // पूरा या फ़ेल हो गया: अब और पूछने की ज़रूरत नहीं
          if (data.status === "done" || data.status === "failed") return;
        }
      } catch {
        // नेटवर्क गड़बड़: अगली कोशिश में फिर पूछेंगे
      }
      if (tries >= MAX_TRIES) {
        if (!cancelled) setGaveUp(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const card: React.CSSProperties = {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--border, #e5e7eb)",
    maxWidth: 360,
  };

  if (snap?.status === "done" && snap.posterUrl) {
    return (
      <div style={card}>
        <strong style={{ fontSize: 15 }}>{t.done}</strong>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snap.posterUrl} alt={t.alt} style={{ width: "100%", borderRadius: 10 }} loading="lazy" />
        <Link href="/my-posters" style={{ color: "var(--accent)", fontWeight: 600 }}>
          {t.saved}
        </Link>
      </div>
    );
  }

  if (snap?.status === "failed") {
    return (
      <div style={card}>
        <p role="alert" style={{ margin: 0, color: "var(--danger)" }}>
          {snap.error ?? "पोस्टर नहीं बन पाया"}
        </p>
      </div>
    );
  }

  if (gaveUp) {
    return (
      <div style={card}>
        <p className="muted" style={{ margin: 0 }}>
          {t.gaveUp}
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <p className="muted" style={{ margin: 0 }}>
        {t.working}
      </p>
    </div>
  );
}