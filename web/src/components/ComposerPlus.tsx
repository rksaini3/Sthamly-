// Sthamly AI web: composer ka "+" menu aur chuni hui cheez ki chip.
// ComposerPlus: "+" button aur uska menu (फ़ोटो, कैमरा, PDF). ComposerChip: chuni hui tasveer ya PDF, composer ke andar.
// Tasveer kahin edit nahi hoti: AI chat mein karta hai. Menu bahar click ya Esc se band hota hai.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import "./ChatControls.css";
import "./ComposerPlus.css";
import type { Attachment } from "../lib/attachment";

interface ComposerPlusProps {
  modeLabel: string;
  disabled?: boolean;
  // User ne file chuni. Conversion aur galti ka message parent sambhalta hai.
  onFile: (file: File) => void;
  // Guest (login nahi): menu mein saaf likha dikhta hai ki tasveer aur PDF ke liye login chahiye.
  isGuest?: boolean;
}

// Parent (ChatPage) "+" menu ko bahar se khol sakta hai, click ke andar (browser ki file-picker ki shart).
export interface ComposerPlusHandle {
  openMenu: () => void;
}

interface ComposerChipProps {
  attachment: Attachment;
  onClear: () => void;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
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

// Composer ke dabbe ke andar dikhne wali chip: chuni hui tasveer ya PDF.
export function ComposerChip({ attachment, onClear }: ComposerChipProps) {
  return (
    <div className="cp-chip" role="status">
      {attachment.kind === "image" ? (
        <img className="cp-chip-thumb" src={attachment.previewUrl} alt="" />
      ) : (
        <span className="cp-chip-doc" aria-hidden="true">
          PDF
        </span>
      )}
      <div className="cp-chip-text">
        <strong>{attachment.name}</strong>
        <span>
          {attachment.kind === "image"
            ? "सवाल लिखकर भेजें, या बताएँ क्या बदलना है"
            : "सवाल लिखकर भेजें, AI पढ़कर जवाब देगा"}
        </span>
      </div>
      <button
        type="button"
        className="cp-chip-x"
        onClick={onClear}
        aria-label="चुनी हुई चीज़ हटाएँ"
        title="हटाएँ"
      >
        ✕
      </button>
    </div>
  );
}

export const ComposerPlus = forwardRef<ComposerPlusHandle, ComposerPlusProps>(function ComposerPlus(
  { modeLabel, disabled = false, onFile, isGuest = false },
  ref,
) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({ openMenu: () => setOpen(true) }), []);

  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (wrapRef.current && target && !wrapRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(which: "photo" | "camera" | "file"): void {
    setOpen(false);
    if (which === "photo") photoRef.current?.click();
    else if (which === "camera") cameraRef.current?.click();
    else fileRef.current?.click();
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  }

  return (
    <div className="cp-wrap" ref={wrapRef}>
      {open && (
        <div className="cp-menu" role="menu" aria-label="और विकल्प">
          <button type="button" role="menuitem" className="cp-item" onClick={() => pick("photo")}>
            <Icon>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </Icon>
            <span className="cp-label">फ़ोटो चुनें</span>
          </button>

          <button type="button" role="menuitem" className="cp-item" onClick={() => pick("camera")}>
            <Icon>
              <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
              <circle cx="12" cy="13" r="4" />
            </Icon>
            <span className="cp-label">कैमरा</span>
          </button>

          <button type="button" role="menuitem" className="cp-item" onClick={() => pick("file")}>
            <Icon>
              <path d="M21 12.8 12.2 21.6a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2L9.6 19" />
            </Icon>
            <span className="cp-label">PDF या फ़ाइल चुनें</span>
          </button>

          <Link to="/create" role="menuitem" className="cp-item" onClick={() => setOpen(false)}>
            <Icon>
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
            </Icon>
            <span className="cp-label">बनाएँ (स्लाइड, वेबसाइट, दस्तावेज़)</span>
          </Link>

          <div className="cp-sep" aria-hidden="true" />
          {isGuest && <p className="cp-note">फ़ोटो और PDF के लिए लॉग-इन करें।</p>}
          <p className="cp-note">मोड: {modeLabel}</p>
        </div>
      )}

      <button
        type="button"
        className="cp-plus"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="और विकल्प"
        title="और विकल्प"
      >
        <Icon>
          <path d="M12 5v14M5 12h14" />
        </Icon>
      </button>

      {/* Chhupe inputs: menu ke buttons inhe khol dete hain. */}
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={onInputChange} />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onInputChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        hidden
        onChange={onInputChange}
      />
    </div>
  );
});