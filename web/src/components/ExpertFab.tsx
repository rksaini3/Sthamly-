// Sthamly AI web: "+" wala floating button (X ke post wale button ki tarah), neeche daayein.
// Khulte hi experts ki sheet. Label dikhata hai: "एक्सपर्ट उपलब्ध" ya "अभी उपलब्ध नहीं" (sirf rang nahi, text bhi).
// Experts pehle se fetch hote hain, taaki button dabane par turant khule.

import { useCallback, useEffect, useState } from "react";
import { getExperts, type ExpertView } from "../api/client";
import { contactHref, type ContactChannel } from "../lib/contact";
import { ExpertSheet, type ExpertStatus } from "./ExpertSheet";

interface ExpertFabProps {
  getToken: () => Promise<string | null>;
}

export function ExpertFab({ getToken }: ExpertFabProps) {
  const [experts, setExperts] = useState<ExpertView[] | null>(null);
  const [open, setOpen] = useState(false);

  // Pehle se load: button dabane par intezaar nahi.
  useEffect(() => {
    const controller = new AbortController();
    void getToken().then((token) => {
      getExperts(token, controller.signal).then((list) => {
        if (!controller.signal.aborted) setExperts(list);
      });
    });
    return () => controller.abort();
  }, [getToken]);

  const status: ExpertStatus = experts === null ? "loading" : experts.length === 0 ? "unavailable" : "ready";
  const close = useCallback(() => setOpen(false), []);

  function handleConfirm(chosen: ExpertView[], channel: ContactChannel): void {
    const target = chosen.map((e) => contactHref(e, channel)).find((h): h is string => h !== null);
    if (target === undefined) return;
    setOpen(false);
    if (channel === "call") window.location.assign(target);
    else window.open(target, "_blank", "noopener");
  }

  const label =
    status === "loading" ? "एक्सपर्ट देखे जा रहे हैं" : status === "ready" ? "एक्सपर्ट उपलब्ध" : "अभी उपलब्ध नहीं";

  return (
    <div className="expert-fab-wrap">
      <span className={`expert-fab-label expert-fab-${status}`} aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className="expert-fab"
        onClick={() => setOpen(true)}
        aria-label="एक्सपर्ट चुनें"
        title="एक्सपर्ट चुनें"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ExpertSheet experts={experts ?? []} status={status} onClose={close} onConfirm={handleConfirm} />
      )}
    </div>
  );
}