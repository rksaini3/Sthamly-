// Sthamly AI web: tasveer dekhne ka full-screen viewer. Neeche ki pankti: Edit, Markup, Resize, Remove.
// Download aur Share abhi kaam karte hain. Edit, Markup, Resize, Remove server ke saath aayenge, isliye "जल्द" dikhte hain.
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

const SOON_TOOLS: readonly { key: string; label: string; path: ReactNode }[] = [
  {
    key: "edit",
    label: "Edit",
    path: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
      </>
    ),
  },
  {
    key: "markup",
    label: "Markup",
    path: <path d="M3 17c3-6 5 2 8-2s4 4 10-2" />,
  },
  {
    key: "resize",
    label: "Resize",
    path: (
      <>
        <rect x="3" y="3" width="13" height="13" rx="2" />
        <path d="M21 21l-5-5M21 16v5h-5" />
      </>
    ),
  },
  {
    key: "remove",
    label: "Remove",
    path: <path d="M20 20H9L3 13l9-9 8 8-6 6M6 11l7 7" />,
  },
];

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [shareNote, setShareNote] = useState<string | null>(null);
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
      setShareNote("इस browser में शेयर सुविधा नहीं है।");
      return;
    }
    try {
      await navigator.share({ title: "Sthamly AI", text: alt, url: src.startsWith("http") ? src : undefined });
      setShareNote(null);
    } catch {
      // User ne share band kiya: kuch nahi.
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
          <a className="iv-btn" href={src} download="sthamly-image.png" aria-label="डाउनलोड करें" title="डाउनलोड करें">
            <Icon>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </Icon>
          </a>
          <button
            type="button"
            className="iv-share"
            onClick={() => void share()}
          >
            शेयर
          </button>
        </div>
      </div>

      <div className="iv-stage">
        <img className="iv-img" src={src} alt={alt} />
      </div>

      {shareNote !== null && (
        <p className="iv-note" role="status">
          {shareNote}
        </p>
      )}

      <div className="iv-bottom" role="toolbar" aria-label="तस्वीर के औज़ार">
        {SOON_TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="iv-tool"
            disabled
            aria-disabled="true"
            title={`${t.label} जल्द आएगा`}
          >
            <span className="iv-tool-icon">
              <Icon>{t.path}</Icon>
            </span>
            <span className="iv-tool-label">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}