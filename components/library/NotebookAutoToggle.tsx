"use client";

import { useEffect, useState, type CSSProperties } from "react";

// चैट के जवाब अपने आप नोटबुक में जुड़ें: चालू/बंद का स्विच।
// बंद करने पर आगे के चैट जवाब नोटबुक में नहीं आएंगे। पुराने नोट नहीं हटेंगे।
export function NotebookAutoToggle() {
  const [auto, setAuto] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // पहली बार: मौजूदा सेटिंग लाएं
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notebook/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("read failed");
        const data = (await res.json()) as { notebookAuto: boolean };
        if (!cancelled) setAuto(data.notebookAuto);
      } catch {
        if (!cancelled) setError("सेटिंग नहीं खुल पाई");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (auto === null || busy) return;
    const next = !auto;
    setError(null);
    setBusy(true);
    // पहले स्क्रीन पर बदलें, फेल हो तो वापस
    setAuto(next);
    try {
      const res = await fetch("/api/notebook/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookAuto: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setAuto(!next);
      setError("सेटिंग सेव नहीं हो पाई, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  const loading = auto === null && !error;

  return (
    <section className="card" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 15 }}>चैट के जवाब अपने आप नोटबुक में जोड़ें</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {auto === false
              ? "बंद है: चैट के नए जवाब नोटबुक में नहीं आएंगे। पुराने नोट वैसे ही रहेंगे।"
              : "चालू है: चैट का हर जवाब नोटबुक में अपने आप आएगा।"}
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={auto === true}
          aria-label="चैट के जवाब अपने आप नोटबुक में जोड़ें"
          onClick={toggle}
          disabled={loading || busy}
          style={switchStyle(auto === true, loading || busy)}
        >
          <span style={knobStyle(auto === true)} />
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

function switchStyle(on: boolean, disabled: boolean): CSSProperties {
  return {
    position: "relative",
    width: 52,
    height: 30,
    flexShrink: 0,
    borderRadius: 999,
    border: "none",
    padding: 0,
    background: on ? "var(--accent, #1B1A17)" : "#d4d4d4",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "background 0.2s",
  };
}

function knobStyle(on: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    left: on ? 25 : 3,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    transition: "left 0.2s",
  };
}