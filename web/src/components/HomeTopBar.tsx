// Sthamly AI web: home screen ka upar wala hissa (header + plan ki patti).
// Baayen: menu aur nayi baatcheet. Daayen: credits aur QR (jald aayega).
// Credits ka number /api/billing/status se aata hai. Fail ho to chat nahi rukti, bas "—" dikhta hai.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchBillingStatus, type BillingStatus } from "../api/billing";
import "./HomeTopBar.css";

const PLAN_LABEL: Record<string, string> = {
  free: "फ्री प्लान",
  plus: "बेसिक प्लान",
  pro: "प्रो प्लान",
  super: "सुपर प्लान",
};

interface HomeTopBarProps {
  onOpenMenu: () => void;
  onNewChat: () => void;
}

export function HomeTopBar({ onOpenMenu, onNewChat }: HomeTopBarProps) {
  const { status, getAccessToken } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (status !== "signed_in") {
      setBilling(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const data = await fetchBillingStatus(token);
        if (!cancelled) setBilling(data);
      } catch {
        // Credits na mile to header chalta rahe; "—" dikhega.
        if (!cancelled) setBilling(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, getAccessToken]);

  const planName = billing ? (PLAN_LABEL[billing.plan] ?? "प्लान") : "प्लान";
  const creditsText = billing ? billing.credits.total.toLocaleString("en-IN") : "—";

  return (
    <div className="htb">
      <div className="htb-row">
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
          <button
            type="button"
            className="htb-icon-btn"
            onClick={onOpenMenu}
            aria-label="मेन्यू खोलें"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          <button
            type="button"
            className="htb-icon-btn"
            onClick={onNewChat}
            aria-label="नई बातचीत"
            title="नई बातचीत"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
              <path d="M9.5 14.5l5.6-5.6a1.4 1.4 0 0 1 2 2L11.5 16.5l-2.6.6z" />
            </svg>
          </button>
        </div>

        <h1 className="htb-title">Sthamly AI</h1>

        <Link to="/plans" className="htb-credits" aria-label={`बचे क्रेडिट: ${creditsText}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
          <span>{creditsText}</span>
        </Link>

        <button
          type="button"
          className="htb-icon-btn"
          disabled
          title="QR जल्द आ रहा है"
          aria-label="QR स्कैनर (जल्द आ रहा है)"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
          </svg>
        </button>
      </div>

      <div className="htb-sub">
        <span className="htb-plan">{planName}</span>
        <Link to="/plans" className="htb-chip htb-chip-primary">Upgrade</Link>
        <Link to="/plans" className="htb-chip">+ Booster</Link>
      </div>
    </div>
  );
}