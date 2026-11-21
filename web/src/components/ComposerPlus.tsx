// Sthamly AI web: composer ka "+" menu. Fotho aur files jodne ka kaam server ke saath aayega,
// isliye woh abhi "जल्द" dikhte hain. Banane wale tools ka link yahin hai.
// Menu bahar click ya Esc se band hota hai.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./ChatControls.css";

interface ComposerPlusProps {
  modeLabel: string;
  disabled?: boolean;
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

export function ComposerPlus({ modeLabel, disabled = false }: ComposerPlusProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="cp-wrap" ref={wrapRef}>
      {open && (
        <div className="cp-menu" role="menu" aria-label="और विकल्प">
          <button type="button" role="menuitem" className="cp-item" disabled>
            <Icon>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </Icon>
            <span className="cp-label">फ़ोटो जोड़ें</span>
            <span className="cp-soon">जल्द</span>
          </button>

          <button type="button" role="menuitem" className="cp-item" disabled>
            <Icon>
              <path d="M21 12.8 12.2 21.6a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2L9.6 19" />
            </Icon>
            <span className="cp-label">फ़ाइल जोड़ें</span>
            <span className="cp-soon">जल्द</span>
          </button>

          <Link to="/create" role="menuitem" className="cp-item" onClick={() => setOpen(false)}>
            <Icon>
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
            </Icon>
            <span className="cp-label">बनाएँ (तस्वीर, स्लाइड, वेबसाइट, दस्तावेज़)</span>
          </Link>

          <div className="cp-sep" aria-hidden="true" />
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
    </div>
  );
}