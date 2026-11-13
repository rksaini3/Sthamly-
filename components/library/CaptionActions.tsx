"use client";

import { useState } from "react";

// कैप्शन को एक दबाव में कॉपी करें या WhatsApp पर भेजें (बटन के शब्द पन्ना भेजता है, भाषा के हिसाब से)
export function CaptionActions({
  text,
  copyLabel,
  copiedLabel,
  whatsappLabel,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
  whatsappLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // browser ने मना किया तो चुपचाप छोड़ दें
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      <button type="button" className="btn" onClick={() => void copy()}>
        {copied ? copiedLabel : copyLabel}
      </button>
      <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        {whatsappLabel}
      </a>
    </div>
  );
}