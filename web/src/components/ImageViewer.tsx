// Sthamly AI web: tasveer ka full-screen editor. Neeche ke tools: Edit (ghumana), Resize, बैकग्राउंड हटाएँ.
// Markup abhi "जल्द" hai. Download aur Share hamesha kaam karte hain, jo tasveer abhi dikh rahi hai uske saath.
// Har badlav naye copy par hota hai: asli tasveer kabhi overwrite nahi hoti. Esc ya ✕ se band.

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./ImageViewer.css";
import { removeBackground } from "../api/imageTools";
import { ApiClientError } from "../api/client";
import { blobToDataUrl, transformImage, UPLOAD_MAX_EDGE } from "../lib/imageIO";

interface ImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
  // Login user ka token. Nahi diya to 'बैकग्राउंड हटाएँ' nahi dikhta (ye tool login mein hi chalta hai).
  getToken?: () => Promise<string | null>;
}

type Panel = "none" | "resize";
const RESIZE_SIZES: readonly number[] = [512, 1024, 2048];

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

export function ImageViewer({ src, alt, onClose, getToken }: ImageViewerProps) {
  // Jo tasveer abhi dikh rahi hai (asli ya badli hui copy).
  const [current, setCurrent] = useState<string>(src);
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Hamne jo object URL banaye, unhe band hone par saaf karte hain.
  const ownedRef = useRef<string[]>([]);
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

  // Band hone par hamare banaye URL hata do.
  useEffect(() => {
    const owned = ownedRef;
    return () => {
      for (const u of owned.current) URL.revokeObjectURL(u);
      owned.current = [];
    };
  }, []);

  function adopt(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    ownedRef.current.push(url);
    setCurrent(url);
  }

  // Ek kaam chalaata hai: busy dikhata hai, galti par saaf Hindi message.
  async function run(label: string, work: () => Promise<void>): Promise<void> {
    setBusy(label);
    setNote(null);
    try {
      await work();
    } catch (err) {
      setNote(
        err instanceof ApiClientError
          ? err.message
          : "तस्वीर नहीं बदली जा सकी। दोबारा कोशिश करें।",
      );
    } finally {
      setBusy(null);
    }
  }

  function rotate(): void {
    void run("घुमाया जा रहा है…", async () => {
      adopt(await transformImage(current, { maxEdge: 100000, rotate: 90 }));
    });
  }

  function resize(size: number): void {
    setPanel("none");
    void run("छोटा किया जा रहा है…", async () => {
      adopt(await transformImage(current, { maxEdge: size }));
    });
  }

  function removeBg(): void {
    if (!getToken) return;
    void run("बैकग्राउंड हटाया जा रहा है…", async () => {
      const token = await getToken();
      if (!token) {
        throw new ApiClientError("unauthenticated", "बैकग्राउंड हटाने के लिए लॉग-इन करें।", false, null);
      }
      const jpeg = await transformImage(current, {
        maxEdge: UPLOAD_MAX_EDGE,
        mime: "image/jpeg",
        quality: 0.9,
      });
      const dataUrl = await blobToDataUrl(jpeg);
      adopt(await removeBackground(token, dataUrl));
      setNote("बैकग्राउंड हट गया। डाउनलोड करके सेव करें।");
    });
  }

  async function share(): Promise<void> {
    if (!canShare) {
      setNote("इस browser में शेयर सुविधा नहीं है।");
      return;
    }
    try {
      const res = await fetch(current);
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

  const disabled = busy !== null;

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
            href={current}
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
        <img className="iv-img" src={current} alt={alt} />
      </div>

      {(busy !== null || note !== null) && (
        <p className="iv-note" role="status">
          {busy ?? note}
        </p>
      )}

      {panel === "resize" && (
        <div className="iv-sizes" role="group" aria-label="आकार चुनें">
          {RESIZE_SIZES.map((s) => (
            <button key={s} type="button" className="iv-size" onClick={() => resize(s)} disabled={disabled}>
              अधिकतम {s}px
            </button>
          ))}
        </div>
      )}

      <div className="iv-bottom" role="toolbar" aria-label="तस्वीर के औज़ार">
        <button type="button" className="iv-tool" onClick={rotate} disabled={disabled}>
          <span className="iv-tool-icon">
            <Icon>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </Icon>
          </span>
          <span className="iv-tool-label">घुमाएँ</span>
        </button>

        <button
          type="button"
          className={`iv-tool${panel === "resize" ? " active" : ""}`}
          onClick={() => setPanel((p) => (p === "resize" ? "none" : "resize"))}
          disabled={disabled}
          aria-pressed={panel === "resize"}
        >
          <span className="iv-tool-icon">
            <Icon>
              <rect x="3" y="3" width="13" height="13" rx="2" />
              <path d="M21 21l-5-5M21 16v5h-5" />
            </Icon>
          </span>
          <span className="iv-tool-label">आकार</span>
        </button>

        {getToken && (
          <button type="button" className="iv-tool" onClick={removeBg} disabled={disabled}>
            <span className="iv-tool-icon">
              <Icon>
                <path d="M20 20H9L3 13l9-9 8 8-6 6M6 11l7 7" />
              </Icon>
            </span>
            <span className="iv-tool-label">बैकग्राउंड हटाएँ</span>
          </button>
        )}

        <button
          type="button"
          className="iv-tool"
          disabled
          aria-disabled="true"
          title="मार्कअप जल्द आएगा"
        >
          <span className="iv-tool-icon">
            <Icon>
              <path d="M3 17c3-6 5 2 8-2s4 4 10-2" />
            </Icon>
          </span>
          <span className="iv-tool-label">मार्कअप</span>
          <span className="iv-soon">जल्द</span>
        </button>
      </div>
    </div>
  );
}