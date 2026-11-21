// Sthamly AI web: composer ka "+" menu. Tasveer chunen to editor khulta hai (ghumana, aakar, background hatana).
// PDF chunen to composer mein chip dikhti hai. Chat mein PDF padhna abhi nahi jud paya, isliye chip par ye saaf likha hai.
// Menu bahar click ya Esc se band hota hai.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./ChatControls.css";
import "./ComposerPlus.css";
import { useAuth } from "../auth/AuthProvider";
import { ImageViewer } from "./ImageViewer";

interface ComposerPlusProps {
  modeLabel: string;
  disabled?: boolean;
}

interface Editing {
  url: string;
  name: string;
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
  const { status, getAccessToken } = useAuth();
  const isMember = status === "signed_in";

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  // Editor band hone par object URL saaf.
  function closeEditor(): void {
    setEditing((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  // Chunni hui file: tasveer editor mein, PDF chip mein, baaki ko mana.
  function onPicked(file: File | undefined): void {
    setPickError(null);
    if (!file) return;

    if (file.type.startsWith("image/")) {
      setPdf(null);
      closeEditor();
      setEditing({ url: URL.createObjectURL(file), name: file.name });
      return;
    }
    if (file.type === "application/pdf") {
      setPdf(file);
      return;
    }
    setPickError("अभी सिर्फ़ तस्वीर या PDF चल सकती है।");
  }

  function pick(which: "photo" | "file"): void {
    setOpen(false);
    if (which === "photo") photoRef.current?.click();
    else fileRef.current?.click();
  }

  return (
    <div className="cp-wrap" ref={wrapRef}>
      {pdf !== null && (
        <div className="cp-chip" role="status">
          <div className="cp-chip-text">
            <strong>{pdf.name}</strong>
            <span>चैट में PDF पढ़ना जल्द आएगा</span>
          </div>
          <button
            type="button"
            className="cp-chip-x"
            onClick={() => setPdf(null)}
            aria-label="फ़ाइल हटाएँ"
            title="फ़ाइल हटाएँ"
          >
            ✕
          </button>
        </div>
      )}

      {pickError !== null && (
        <div className="cp-chip cp-chip-error" role="alert">
          <div className="cp-chip-text">
            <span>{pickError}</span>
          </div>
          <button
            type="button"
            className="cp-chip-x"
            onClick={() => setPickError(null)}
            aria-label="बंद करें"
            title="बंद करें"
          >
            ✕
          </button>
        </div>
      )}

      {open && (
        <div className="cp-menu" role="menu" aria-label="और विकल्प">
          <button type="button" role="menuitem" className="cp-item" onClick={() => pick("photo")}>
            <Icon>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </Icon>
            <span className="cp-label">फ़ोटो जोड़ें</span>
          </button>

          <button type="button" role="menuitem" className="cp-item" onClick={() => pick("file")}>
            <Icon>
              <path d="M21 12.8 12.2 21.6a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2L9.6 19" />
            </Icon>
            <span className="cp-label">फ़ाइल जोड़ें</span>
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

      {/* Chhupe inputs: menu ke buttons inhe khol dete hain. */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onPicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          onPicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {editing !== null && (
        <ImageViewer
          src={editing.url}
          alt={editing.name}
          onClose={closeEditor}
          getToken={isMember ? () => getAccessToken() : undefined}
        />
      )}
    </div>
  );
}