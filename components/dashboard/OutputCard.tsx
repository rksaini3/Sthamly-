"use client";

import { useState } from "react";
import type { OutputType } from "@/types/domain";

interface OutputCardProps {
  type: OutputType;
  url: string | null; // poster की signed URL
  content: string | null; // caption का text
  watermarked: boolean;
}

const FILE_NAME = "sthamly-poster.png";

// Signed URL से poster को फाइल की तरह लें, ताकि शेयर और डाउनलोड दोनों हो सकें
async function fetchPosterFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("poster download failed");
  const blob = await res.blob();
  return new File([blob], FILE_NAME, { type: blob.type || "image/png" });
}

function downloadFile(file: File): void {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function OutputCard({ type, url, content, watermarked }: OutputCardProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleShare() {
    if (!url) return;
    setBusy(true);
    setMessage(null);

    try {
      const file = await fetchPosterFile(url);
      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        // फोन का share menu खुलेगा, जिसमें WhatsApp भी होगा
        await navigator.share({ files: [file], title: "दुकान का पोस्टर" });
      } else {
        downloadFile(file);
        setMessage("इस फोन पर सीधे शेयर नहीं होता। फोटो डाउनलोड हो गई है, उसे WhatsApp पर भेजें।");
      }
    } catch (err) {
      // User ने share menu खुद बंद किया हो, तो कोई संदेश नहीं
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage("शेयर नहीं हो पाया। फिर कोशिश करें।");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!url) return;
    setBusy(true);
    setMessage(null);

    try {
      const file = await fetchPosterFile(url);
      downloadFile(file);
    } catch {
      setMessage("डाउनलोड नहीं हो पाया। पेज दोबारा खोलें।");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!content) return;
    setMessage(null);

    try {
      await navigator.clipboard.writeText(content);
      setMessage("कैप्शन कॉपी हो गया");
    } catch {
      setMessage("कॉपी नहीं हो पाया। कैप्शन को हाथ से चुनकर कॉपी करें।");
    }
  }

  if (type === "poster") {
    return (
      <div className="output">
        {url ? (
          // signed URL बाहरी है, इसलिए next/image की जगह सादा img
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="दुकान का पोस्टर" className="poster-img" />
        ) : (
          <p className="muted">पोस्टर का लिंक नहीं बन पाया। पेज दोबारा खोलें।</p>
        )}

        {watermarked && (
          <p className="muted">Free प्लान का पोस्टर है, इस पर Sthamly का watermark है।</p>
        )}

        {url && (
          <div className="stack" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleShare}
              disabled={busy}
            >
              {busy ? "तैयार हो रहा है…" : "शेयर करें"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={handleDownload}
              disabled={busy}
            >
              फोटो डाउनलोड करें
            </button>
          </div>
        )}

        {message && (
          <p role="status" className="muted" style={{ marginTop: 8 }}>
            {message}
          </p>
        )}
      </div>
    );
  }

  if (type === "caption") {
    return (
      <div className="output">
        <p className="output-label">कैप्शन</p>
        <div className="caption-box">{content ?? ""}</div>

        {content && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={handleCopy}
            style={{ marginTop: 8 }}
          >
            कैप्शन कॉपी करें
          </button>
        )}

        {message && (
          <p role="status" className="muted" style={{ marginTop: 8 }}>
            {message}
          </p>
        )}
      </div>
    );
  }

  // रील अभी नहीं बनती, इसलिए इस प्रकार को दिखाया नहीं जाता
  return null;
}