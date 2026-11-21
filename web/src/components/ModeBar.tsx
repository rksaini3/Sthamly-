// Sthamly AI web: mode chips (composer ke upar) aur khali chat ke suggestion cards.
// Chip badalne par kuch server par nahi jaata; suggestion par click se text input mein aata hai, user dekh kar bheje.

import { MODES, findMode, type ModeKey } from "../lib/modes";
import "./ChatExtras.css";

interface ModeChipsProps {
  mode: ModeKey;
  onChange: (mode: ModeKey) => void;
  disabled?: boolean;
}

export function ModeChips({ mode, onChange, disabled = false }: ModeChipsProps) {
  return (
    <div className="mode-chips" role="radiogroup" aria-label="मोड चुनें">
      {MODES.map((m) => {
        const selected = m.key === mode;
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`mode-chip${selected ? " selected" : ""}`}
            onClick={() => onChange(m.key)}
            disabled={disabled}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

interface SuggestionsProps {
  mode: ModeKey;
  onPick: (text: string) => void;
  disabled?: boolean;
}

export function Suggestions({ mode, onPick, disabled = false }: SuggestionsProps) {
  const def = findMode(mode);
  return (
    <div className="suggestions">
      <ul className="suggestion-list">
        {def.suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              className="suggestion-card"
              onClick={() => onPick(s)}
              disabled={disabled}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      {def.note !== null && <p className="mode-note small">{def.note}</p>}
    </div>
  );
}