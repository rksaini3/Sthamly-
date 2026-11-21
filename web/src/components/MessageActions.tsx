// Sthamly AI web: jawab ke neeche ke buttons: कॉपी, सुनें, शेयर, दोबारा बनाएँ, 👍/👎.
// Copy, sunna aur share browser ki apni suvidha se chalte hain (server ki zaroorat nahi).
// 👍/👎 abhi is device par yaad rehta hai; server par bhejne ka API Phase 1 ke agle kadam mein jud-ega.
// "दोबारा बनाएँ" tabhi dikhta hai jab parent onRegenerate de (sirf aakhri jawab par).

import { useEffect, useState, type ReactNode } from "react";
import "./ChatExtras.css";
import "./MessageActions.css";

interface MessageActionsProps {
  text: string;
  onRegenerate?: () => void;
}

type Vote = "up" | "down" | null;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
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

export function MessageActions({ text, onRegenerate }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vote, setVote] = useState<Vote>(null);

  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Bahar jaane par bolna band.
  useEffect(() => {
    return () => {
      if (canSpeak) window.speechSynthesis.cancel();
    };
  }, [canSpeak]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard band ho to chup rehte hain; user khud select karke copy kar sakta hai.
    }
  }

  // Share: phone ka share sheet. Support na ho to copy karte hain.
  async function share(): Promise<void> {
    if (!canShare) {
      await copy();
      return;
    }
    try {
      await navigator.share({ text });
      setShared(true);
      window.setTimeout(() => setShared(false), 1500);
    } catch {
      // User ne share band kiya ya browser ne mana: kuch nahi karte.
    }
  }

  function speak(): void {
    if (!canSpeak) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }

  function toggleVote(next: Exclude<Vote, null>): void {
    setVote((prev) => (prev === next ? null : next));
  }

  return (
    <div className="msg-actions" role="group" aria-label="जवाब के विकल्प">
      <button type="button" className="msg-action" onClick={() => void copy()}>
        <Icon>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </Icon>
        <span>{copied ? "कॉपी हो गया" : "कॉपी"}</span>
      </button>

      {canSpeak && (
        <button type="button" className="msg-action" onClick={speak} aria-pressed={speaking}>
          <Icon>
            <path d="M11 5 6 9H3v6h3l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </Icon>
          <span>{speaking ? "रोकें" : "सुनें"}</span>
        </button>
      )}

      <button type="button" className="msg-action" onClick={() => void share()}>
        <Icon>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </Icon>
        <span>{shared ? "शेयर हो गया" : "शेयर"}</span>
      </button>

      {onRegenerate && (
        <button type="button" className="msg-action" onClick={onRegenerate}>
          <Icon>
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
          </Icon>
          <span>दोबारा बनाएँ</span>
        </button>
      )}

      <button
        type="button"
        className="msg-action icon"
        onClick={() => toggleVote("up")}
        aria-pressed={vote === "up"}
        aria-label="अच्छा जवाब"
        title="अच्छा जवाब"
      >
        👍
      </button>
      <button
        type="button"
        className="msg-action icon"
        onClick={() => toggleVote("down")}
        aria-pressed={vote === "down"}
        aria-label="सुधार चाहिए"
        title="सुधार चाहिए"
      >
        👎
      </button>
    </div>
  );
}