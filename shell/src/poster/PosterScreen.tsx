import { useEffect, useRef, useState } from "react";
import { TEMPLATES, safeAccent, type PosterInput, type TemplateId } from "./layout";
import { drawPosterTo, posterPng } from "./render";
import { sharePoster } from "./share";

const ACCENTS = ["#E0561A", "#1F4E4A", "#7A3E9D", "#C2185B", "#0F766E"];

const INITIAL: PosterInput = {
  shopName: "",
  offerText: "",
  occasion: null,
  phone: "",
  city: "",
  accent: ACCENTS[0] ?? "#E0561A",
  template: "sale",
};

export function PosterScreen() {
  const [input, setInput] = useState<PosterInput>(INITIAL);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // इनपुट बदलते ही preview नया बने
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPosterTo(canvas, { ...input, offerText: input.offerText || "आपका ऑफ़र यहाँ दिखेगा" }).catch((e) =>
      setStatus(`Preview नहीं बना: ${String(e)}`),
    );
  }, [input]);

  function set<K extends keyof PosterInput>(key: K, value: PosterInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function onShare() {
    if (input.offerText.trim().length < 3) {
      setStatus("पहले ऑफ़र लिखें (कम से कम 3 अक्षर)");
      return;
    }
    if (input.phone && !/^\d{10}$/.test(input.phone)) {
      setStatus("फ़ोन नंबर 10 अंकों का होना चाहिए, या खाली छोड़ें");
      return;
    }
    setBusy(true);
    setStatus("पोस्टर बन रहा है...");
    try {
      const safe: PosterInput = { ...input, accent: safeAccent(input.accent) };
      const blob = await posterPng(safe);
      await sharePoster(blob, `sthamly-${Date.now()}.png`, safe.offerText);
      setStatus("शेयर हो गया");
    } catch (e) {
      // उपयोगकर्ता ने शेयर बंद किया तो भी यहीं आता है
      setStatus(`शेयर नहीं हो पाया: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid #e5e5e5" }}
        aria-label="पोस्टर का preview"
      />

      <label style={labelStyle}>
        दुकान का नाम
        <input value={input.shopName} onChange={(e) => set("shopName", e.target.value)} maxLength={40} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        ऑफ़र (जैसे: दिवाली पर सभी मिठाई पर 20% छूट)
        <textarea
          value={input.offerText}
          onChange={(e) => set("offerText", e.target.value)}
          maxLength={160}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      <label style={labelStyle}>
        मौका (ऐच्छिक)
        <input
          value={input.occasion ?? ""}
          onChange={(e) => set("occasion", e.target.value.trim() ? e.target.value : null)}
          maxLength={40}
          style={inputStyle}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={labelStyle}>
          फ़ोन
          <input
            inputMode="numeric"
            value={input.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          शहर
          <input value={input.city} onChange={(e) => set("city", e.target.value)} maxLength={40} style={inputStyle} />
        </label>
      </div>

      <div>
        <p style={labelStyle}>डिज़ाइन</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => set("template", id)}
              style={chipStyle(input.template === id)}
            >
              {TEMPLATES[id].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={labelStyle}>रंग</p>
        <div style={{ display: "flex", gap: 10 }}>
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`रंग ${c}`}
              onClick={() => set("accent", c)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: c,
                border: input.accent === c ? "3px solid #1B1A17" : "1px solid #d4d4d4",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        style={{
          padding: "14px 16px",
          borderRadius: 999,
          border: "none",
          background: "#1B1A17",
          color: "#fff",
          fontSize: 16,
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        पोस्टर बनाएं और शेयर करें
      </button>

      {status && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: "#57534e" }}>
          {status}
        </p>
      )}
    </section>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#44403c" };
const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d4d4d4",
  fontSize: 16,
  font: "inherit",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    border: active ? "2px solid #1B1A17" : "1px solid #d4d4d4",
    background: active ? "#1B1A17" : "#fff",
    color: active ? "#fff" : "#1B1A17",
    fontSize: 14,
    cursor: "pointer",
  };
}