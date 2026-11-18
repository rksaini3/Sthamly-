"use client";

import { useState, type CSSProperties } from "react";

// नोटबुक के सारे नोट एक CSV फ़ाइल में डाउनलोड करें।
// Web पर cookie से login चलता है, इसलिए same-origin fetch काफ़ी है।
export function NotebookExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/notebook/export", { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "फ़ाइल नहीं बन पाई, दोबारा कोशिश करें");
        return;
      }

      const blob = await res.blob();
      const filename = filenameFrom(res.headers.get("Content-Disposition")) ?? "notebook.csv";

      // फ़ाइल को अस्थायी लिंक से डाउनलोड कराएं, फिर लिंक हटा दें
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 2 }}>
        <strong style={{ fontSize: 15 }}>नोटबुक डाउनलोड करें</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          सारे नोट एक फ़ाइल में: तारीख, सवाल और जवाब। Excel या Google Sheets में खुलती है।
        </span>
      </div>

      <div>
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy} style={buttonStyle(busy)}>
          {busy ? "फ़ाइल बन रही है…" : "CSV डाउनलोड करें"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

// Content-Disposition से फ़ाइल का नाम, जैसे: attachment; filename="notebook-2026-11-18.csv"
function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}