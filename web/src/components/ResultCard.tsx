// Sthamly AI web: banane ka nateeja ek kagaz jaisa card mein. Upar naam, beech mein preview,
// neeche do saaf bataon: "भेजें" aur "सेव करें"। Baaki kaam chhote text buttons mein.

import type { ReactNode } from "react";
import "./ResultCard.css";

interface ResultCardProps {
  kindLabel: string;
  title: string;
  sizeLabel: string;
  children: ReactNode;
  onSave: () => void;
  onShare: () => void;
  onNew: () => void;
  onDelete: () => void;
  busy: boolean;
  hint: string | null;
}

export function ResultCard({
  kindLabel,
  title,
  sizeLabel,
  children,
  onSave,
  onShare,
  onNew,
  onDelete,
  busy,
  hint,
}: ResultCardProps) {
  return (
    <section className="result-card" aria-label="तैयार नतीजा">
      <header className="result-head">
        <span className="result-kind">{kindLabel}</span>
        <h2 className="result-title">{title}</h2>
        <p className="result-meta">{sizeLabel}</p>
      </header>

      <div className="result-preview">{children}</div>

      <div className="result-actions">
        <button type="button" className="result-primary" onClick={onShare} disabled={busy}>
          भेजें
        </button>
        <button type="button" className="result-secondary" onClick={onSave} disabled={busy}>
          सेव करें
        </button>
      </div>

      <div className="result-footer">
        <button type="button" className="result-text" onClick={onNew} disabled={busy}>
          नया बनाएँ
        </button>
        <button type="button" className="result-text result-danger" onClick={onDelete} disabled={busy}>
          हटाएँ
        </button>
      </div>

      {hint !== null && (
        <p className="result-hint" role="status">
          {hint}
        </p>
      )}
    </section>
  );
}
