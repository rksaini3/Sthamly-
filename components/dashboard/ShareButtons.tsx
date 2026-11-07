"use client";

import { useState } from "react";

type Props = {
  url: string;
  caption: string;
  kind: "image" | "video";
  fileName: string;
};

export function ShareButtons({ url, caption, kind, fileName }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    caption ? `${caption}\n\n${url}` : url,
  )}`;

  async function copyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setMsg("कैप्शन कॉपी हो गया");
    } catch {
      setMsg("कॉपी नहीं हो पाया, कैप्शन हाथ से चुनें");
    }
  }

  // फ़ोन का अपना share menu खोलता है (WhatsApp, Status, Instagram आदि)
  async function shareFile() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const type = blob.type || (kind === "video" ? "video/mp4" : "image/png");
      const file = new File([blob], fileName, { type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
      } else if (navigator.share) {
        // फ़ाइल सपोर्ट नहीं है तो लिंक और कैप्शन भेजें
        await navigator.share({ text: caption, url });
      } else {
        await copyCaption();
        setMsg("यह फ़ोन फ़ाइल शेयर नहीं करता। कैप्शन कॉपी हो गया है, फ़ोटो डाउनलोड करके भेजें।");
      }
    } catch (err) {
      // यूज़र ने खुद share बंद किया तो कोई error नहीं
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMsg("शेयर नहीं हो पाया। डाउनलोड करके भेजें।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={shareFile}
          disabled={busy}
        >
          {busy ? "तैयार हो रहा है…" : "शेयर करें"}
        </button>
        <a
          className="btn btn-ghost"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
        <a className="btn btn-ghost" href={url} download={fileName}>
          डाउनलोड
        </a>
        {caption && (
          <button type="button" className="btn btn-ghost" onClick={copyCaption}>
            कैप्शन कॉपी
          </button>
        )}
      </div>
      {msg && <p className="muted" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}