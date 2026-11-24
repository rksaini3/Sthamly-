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

  return (
    <div className="expert-fab-wrap">
      {status === "ready" && <span className="expert-fab-label expert-fab-ready">एक्सपर्ट उपलब्ध</span>}
      <button
        type="button"
        className="expert-fab"
        onClick={() => setOpen(true)}
        aria-label="एक्सपर्ट चुनें"
        title="एक्सपर्ट चुनें"
      >
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
        </svg>
      </button>

      {open && (
        <ExpertSheet experts={experts ?? []} status={status} onClose={close} onConfirm={handleConfirm} />
      )}
    </div>
  );
}