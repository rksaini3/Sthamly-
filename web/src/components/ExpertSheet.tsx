// Sthamly AI web: "एक्सपर्ट चुनें" bottom sheet. Parent ise mount/unmount karta hai, isliye har khulne par state taaza.
// 3 tak chunav, fir consent, fir call ya WhatsApp. Consent ka vaada: saar sirf chune gaye expert ko jaata hai.
// Number na ho to us channel ka button band aur saaf likha hua.

import { useEffect, useRef, useState } from "react";
import type { ExpertView } from "../api/client";
import { contactHref, type ContactChannel } from "../lib/contact";

export type ExpertStatus = "loading" | "ready" | "unavailable";

interface ExpertSheetProps {
  experts: ExpertView[];
  status: ExpertStatus;
  onClose: () => void;
  onConfirm: (chosen: ExpertView[], channel: ContactChannel) => void;
}

const MAX_PICK = 3;

export function ExpertSheet({ experts, status, onClose, onConfirm }: ExpertSheetProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "consent">("pick");
  const [agreed, setAgreed] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sheetRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = experts.filter((e) => picked.includes(e.id));
  const callable = chosen.filter((e) => contactHref(e, "call") !== null);
  const whatsable = chosen.filter((e) => contactHref(e, "whatsapp") !== null);

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PICK) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="expert-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="expert-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expert-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="expert-grab" aria-hidden="true" />
        <h2 id="expert-sheet-title" className="expert-title">
          {step === "pick" ? "एक्सपर्ट चुनें" : "सहमति"}
        </h2>

        {step === "pick" && status === "loading" && <p className="muted">एक्सपर्ट देखे जा रहे हैं…</p>}

        {step === "pick" && status === "unavailable" && (
          <p>अभी कोई एक्सपर्ट उपलब्ध नहीं है। थोड़ी देर बाद फिर देखें।</p>
        )}

        {step === "pick" && status === "ready" && (
          <>
            <p className="muted small">{MAX_PICK} तक चुन सकते हैं।</p>
            <ul className="expert-list">
              {experts.map((ex) => {
                const on = picked.includes(ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      className={on ? "expert-card expert-card-on" : "expert-card"}
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(ex.id)}
                    >
                      <span className="expert-avatar" aria-hidden="true">
                        {ex.photoUrl !== null ? <img src={ex.photoUrl} alt="" /> : ex.name.charAt(0)}
                      </span>
                      <span className="expert-info">
                        <span className="expert-name">
                          {ex.name}
                          {ex.verified && <span className="expert-verified"> ✔ सत्यापित</span>}
                        </span>
                        <span className="muted small">{ex.specialty}</span>
                        <span className="small">
                          ★ {ex.rating.toFixed(1)} ({ex.ratingCount}) · जवाब लगभग {ex.avgReplyMinutes} मिनट में
                        </span>
                        <span className="small">अनुमानित फ़ीस: {ex.feeEstimate}</span>
                      </span>
                      <span className="expert-check">{on ? "चुना गया" : "चुनें"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="expert-actions">
              <button type="button" className="btn-ghost" onClick={onClose}>
                बंद करें
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={chosen.length === 0}
                onClick={() => setStep("consent")}
              >
                इन्हें चुनें
              </button>
            </div>
          </>
        )}

        {step === "consent" && (
          <>
            <p>आपकी बातचीत का सार सिर्फ़ इन्हीं को भेजा जाएगा।</p>
            <p className="muted small">चुने गए: {chosen.map((c) => c.name).join(", ")}। किसी और को कुछ नहीं जाएगा।</p>
            <label className="expert-consent">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>मैं सहमत हूँ</span>
            </label>
            {callable.length === 0 && whatsable.length === 0 && (
              <p className="small">इनमें से किसी का संपर्क नंबर अभी उपलब्ध नहीं है।</p>
            )}
            <div className="expert-actions">
              <button type="button" className="btn-ghost" onClick={() => setStep("pick")}>
                वापस
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!agreed || callable.length === 0}
                onClick={() => onConfirm(callable, "call")}
              >
                कॉल करें
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!agreed || whatsable.length === 0}
                onClick={() => onConfirm(whatsable, "whatsapp")}
              >
                WhatsApp पर
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}