// Sthamly AI web: neeche wali input patti. (+) photo ke liye, Mic voice ke liye, Send bhejne ke liye.
// Enter se bhejna, Shift+Enter se nayi line.

import type { KeyboardEvent } from "react";

interface HomeInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onMic: () => void;
  disabled?: boolean;
}

export function HomeInputBar({ value, onChange, onSend, onAttach, onMic, disabled = false }: HomeInputBarProps) {
  const canSend = !disabled && value.trim().length > 0;

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className="hib">
      <button type="button" className="hib-icon" onClick={onAttach} aria-label="फ़ोटो जोड़ें">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <textarea
        className="hib-input"
        rows={1}
        value={value}
        placeholder="यहाँ लिखें या बोलें..."
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        aria-label="संदेश लिखें"
      />

      <button type="button" className="hib-icon" onClick={onMic} aria-label="बोलकर लिखें">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>

      <button type="button" className="hib-send" onClick={onSend} disabled={!canSend} aria-label="भेजें">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}