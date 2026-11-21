// Sthamly AI web: jawab ke neeche ke buttons: कॉपी, सुनें, 👍/👎.
// Copy aur sunna browser ki apni suvidha se chalte hain (server ki zaroorat nahi).
// 👍/👎 abhi is device par yaad rehta hai; server par bhejne ka API Phase 1 ke agle kadam mein jud-ega.

import { useEffect, useState } from "react";
import "./ChatExtras.css";

interface MessageActionsProps {
  text: string;
}

type Vote = "up" | "down" | null;

export function MessageActions({ text }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vote, setVote] = useState<Vote>(null);

  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

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
        {copied ? "कॉपी हो गया" : "कॉपी"}
      </button>

      {canSpeak && (
        <button type="button" className="msg-action" onClick={speak} aria-pressed={speaking}>
          {speaking ? "रोकें" : "सुनें"}
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