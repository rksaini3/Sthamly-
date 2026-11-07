"use client";

import { useState } from "react";

const FEED_URL = "https://sthamly.com/feed";

export function ShareText({ text }: { text: string }) {
  const [note, setNote] = useState<string | null>(null);
  const full = `${text}\n\n${FEED_URL}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(full)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setNote("कॉपी हो गया। Instagram या कहीं भी चिपकाएं।");
    } catch {
      setNote("कॉपी नहीं हो पाया");
    }
  }

  async function share() {
    setNote(null);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: full });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copy();
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost" onClick={share}>
          शेयर करें
        </button>
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          WhatsApp
        </a>
        <button type="button" className="btn btn-ghost" onClick={copy}>
          कॉपी करें
        </button>
      </div>
      {note && <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>{note}</p>}
    </div>
  );
}