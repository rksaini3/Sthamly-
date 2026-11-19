"use client";

import { useRef, useState } from "react";
import { extractHtml, type Outline } from "@/lib/studio/parse";
import { buildPdf } from "@/lib/studio/pdf";
import { buildPptx } from "@/lib/studio/pptx";

type Tab = "website" | "image" | "pptx" | "pdf";

const TABS: { id: Tab; label: string }[] = [
  { id: "website", label: "वेबसाइट" },
  { id: "image", label: "इमेज" },
  { id: "pptx", label: "PPTX" },
  { id: "pdf", label: "PDF" },
];

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// सर्वर से गलत जवाब आए तो उसका हिंदी संदेश दिखाएं
async function errorMessageOf(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => null);
  return json?.error?.message ?? fallback;
}

export function StudioClient() {
  const [tab, setTab] = useState<Tab>("website");

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div role="tablist" className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "website" && <WebsiteTab />}
      {tab === "image" && <ImageTab />}
      {tab === "pptx" && <PresentationTab kind="pptx" />}
      {tab === "pdf" && <PresentationTab kind="pdf" />}
    </div>
  );
}

// ---- वेबसाइट: स्ट्रीम होते हुए लाइव preview, फिर .html डाउनलोड ----

function WebsiteTab() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (prompt.trim().length < 10) {
      setError("वेबसाइट का विवरण कम से कम 10 अक्षर का लिखें");
      return;
    }
    setBusy(true);
    setError(null);
    setHtml(null);
    try {
      const res = await fetch("/api/studio/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok || !res.body) {
        setError(await errorMessageOf(res, "वेबसाइट नहीं बन पाई"));
        return;
      }

      // टुकड़े-टुकड़े आता HTML पढ़ें, और preview को थोड़े-थोड़े समय पर अपडेट करें
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let lastPaint = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        const now = Date.now();
        if (now - lastPaint > 300) {
          lastPaint = now;
          const partial = extractHtml(full);
          if (partial) setHtml(partial);
        }
      }
      full += decoder.decode();
      const finalHtml = extractHtml(full);
      if (!finalHtml) {
        setError("जवाब में वेबसाइट नहीं मिली, दोबारा कोशिश करें");
      } else {
        setHtml(finalHtml);
      }
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>AI वेबसाइट</h2>
      <p className="muted" style={{ margin: 0 }}>
        अपनी दुकान या काम का विवरण लिखें, वेबसाइट बनकर नीचे लाइव दिखेगी।
      </p>
      <textarea
        className="input"
        rows={4}
        maxLength={1000}
        placeholder="जैसे: मेरी मिठाई की दुकान, दिल्ली में, होम डिलीवरी, WhatsApp नंबर 98xxxxxx"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
      />
      <button type="button" className="btn btn-primary btn-block" onClick={generate} disabled={busy}>
        {busy ? "वेबसाइट बन रही है…" : "वेबसाइट बनाएं"}
      </button>
      {error && <p className="alert alert-error" style={{ margin: 0 }}>{error}</p>}

      {html && (
        <div className="stack" style={{ gap: 10 }}>
          <iframe
            title="वेबसाइट preview"
            srcDoc={html}
            sandbox="allow-scripts"
            style={{ width: "100%", height: 480, border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}
          />
          {!busy && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => downloadBlob(new Blob([html], { type: "text/html" }), "sthamly-website.html")}
            >
              HTML फ़ाइल डाउनलोड करें
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ---- इमेज: Cloudflare flux, Supabase Storage में सेव ----

function ImageTab() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (prompt.trim().length < 3) {
      setError("इमेज का विवरण कम से कम 3 अक्षर का लिखें");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        setError(await errorMessageOf(res, "इमेज नहीं बन पाई"));
        return;
      }
      const data = (await res.json()) as { imageUrl: string };
      setImageUrl(data.imageUrl);
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!imageUrl) return;
    try {
      const blob = await fetch(imageUrl).then((res) => {
        if (!res.ok) throw new Error("download failed");
        return res.blob();
      });
      downloadBlob(blob, "sthamly-image.jpg");
    } catch {
      setError("डाउनलोड नहीं हो पाया, दोबारा कोशिश करें");
    }
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>AI इमेज</h2>
      <input
        className="input"
        placeholder="जैसे: दिवाली की रंगोली वाली मिठाई की थाली"
        maxLength={300}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
      />
      <button type="button" className="btn btn-primary btn-block" onClick={generate} disabled={busy}>
        {busy ? "इमेज बन रही है…" : "इमेज बनाएं"}
      </button>
      {error && <p className="alert alert-error" style={{ margin: 0 }}>{error}</p>}

      {imageUrl && (
        <div className="stack" style={{ gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="AI से बनी इमेज" style={{ width: "100%", borderRadius: 8 }} />
          <button type="button" className="btn btn-ghost btn-block" onClick={download}>
            इमेज डाउनलोड करें
          </button>
        </div>
      )}
    </section>
  );
}

// ---- PPTX और PDF: एक ही outline से, दोनों browser में बनते हैं ----

function PresentationTab({ kind }: { kind: "pptx" | "pdf" }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const label = kind === "pptx" ? "PPTX" : "PDF";

  async function makeOutline() {
    if (topic.trim().length < 3) {
      setError("विषय कम से कम 3 अक्षर का लिखें");
      return;
    }
    const id = ++requestRef.current;
    setBusy(true);
    setError(null);
    setOutline(null);
    try {
      const res = await fetch("/api/studio/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), slideCount: 6 }),
      });
      if (!res.ok) {
        setError(await errorMessageOf(res, "outline नहीं बन पाया"));
        return;
      }
      const data = (await res.json()) as { outline: Outline };
      if (id === requestRef.current) setOutline(data.outline);
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!outline) return;
    setError(null);
    try {
      const safeName = outline.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "presentation";
      if (kind === "pptx") {
        downloadBlob(await buildPptx(outline), `${safeName}.pptx`);
      } else {
        downloadBlob(await buildPdf(outline), `${safeName}.pdf`);
      }
    } catch (err) {
      console.error(`studio ${kind} build failed`, err);
      setError(`${label} नहीं बन पाया, दोबारा कोशिश करें`);
    }
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>{label} प्रेज़ेंटेशन</h2>
      <p className="muted" style={{ margin: 0 }}>
        विषय लिखें, पहले outline बनेगा, फिर {label} डाउनलोड होगा।
      </p>
      <input
        className="input"
        placeholder="जैसे: दिवाली पर दुकान के ऑफ़र"
        maxLength={300}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        disabled={busy}
      />
      <button type="button" className="btn btn-primary btn-block" onClick={makeOutline} disabled={busy}>
        {busy ? "Outline बन रहा है…" : "Outline बनाएं"}
      </button>
      {error && <p className="alert alert-error" style={{ margin: 0 }}>{error}</p>}

      {outline && (
        <div className="stack" style={{ gap: 10 }}>
          <strong>{outline.title}</strong>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {outline.slides.map((slide, index) => (
              <li key={index}>{slide.title}</li>
            ))}
          </ol>
          <button type="button" className="btn btn-primary btn-block" onClick={download}>
            {label} डाउनलोड करें
          </button>
        </div>
      )}
    </section>
  );
}