// Sthamly AI web: tasveer ko full-screen dekhne ka viewer. Download aur Share kaam karte hain.
// Tasveer mein badlav AI karta hai (chat mein "एडिट करें" ya "बैकग्राउंड हटाएँ" se), yahan nahi.
// Esc ya ✕ se band. Bahar ka background dhundhla rehta hai.

import { useEffect, useState, type ReactNode } from "react";
import "./ImageViewer.css";

interface ImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [note, setNote] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Esc se band, aur peeche ka scroll rokna.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function share(): Promise<void> {
    if (!canShare) {
      setNote("इस browser में शेयर सुविधा नहीं है।");
      return;
    }
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], "sthamly-image.png", { type: blob.type || "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sthamly AI", text: alt });
      } else {
        await navigator.share({ title: "Sthamly AI", text: alt });
      }
      setNote(null);
    } catch {
      // User ne share band kiya, ya browser ne mana: kuch nahi.
    }
  }

  return (
    <div className="iv-root" role="dialog" aria-modal="true" aria-label="तस्वीर देखें">
      <div className="iv-top">
        <button type="button" className="iv-btn" onClick={onClose} aria-label="बंद करें" title="बंद करें">
          <Icon>
            <path d="M18 6 6 18M6 6l12 12" />
          </Icon>
        </button>

        <div className="iv-top-right">
          <a
            className="iv-btn"
            href={src}
            download="sthamly-image.png"
            aria-label="डाउनलोड करें"
            title="डाउनलोड करें"
          >
            <Icon>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </Icon>
          </a>
          <button type="button" className="iv-share" onClick={() => void share()}>
            शेयर
          </button>
        </div>
      </div>

      <div className="iv-stage">
        <img className="iv-img" src={src} alt={alt} />
      </div>

      {note !== null && (
        <p className="iv-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}