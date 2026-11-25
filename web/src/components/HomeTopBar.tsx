// Sthamly AI web: home screen ka upar wala hissa.
// Baayen: menu aur naam. Daayen: credits + Upgrade wala ek pill, QR (jald aayega), aur nayi baatcheet (sabse aakhir mein).
// Credits ka number /api/billing/status se aata hai. Fail ho to chat nahi rukti, bas "—" dikhta hai.
// Pill par click karne se plan page (/plans) khulta hai.
// Shabd bhasha ke hisaab se badalte hain (lib/uiText.ts).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { fetchBillingStatus, type BillingStatus } from "../api/billing";
import { useLang } from "../lib/langContext";
import { t } from "../lib/uiText";
import "./HomeTopBar.css";

interface HomeTopBarProps {
  onOpenMenu: () => void;
  onNewChat: () => void;
}

export function HomeTopBar({ onOpenMenu, onNewChat }: HomeTopBarProps) {
  const { status, getAccessToken } = useAuth();
  const { lang } = useLang();
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

  const creditsText = billing ? billing.credits.total.toLocaleString("en-IN") : "—";

  return (
    <div className="htb">
      <div className="htb-row">
        <button
          type="button"
          className="htb-icon-btn"
          onClick={onOpenMenu}
          aria-label={t(lang, "menuOpen")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <h1 className="htb-title">Sthamly AI</h1>

        <Link
          to="/plans"
          className="htb-pill"
          aria-label={`${t(lang, "creditsLeft")}: ${creditsText}. ${t(lang, "upgrade")}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
          <span className="htb-pill-credits">{creditsText}</span>
          <span className="htb-pill-divider" aria-hidden="true" />
          <span className="htb-pill-upgrade">{t(lang, "upgrade")}</span>
        </Link>

        <button
          type="button"
          className="htb-icon-btn"
          disabled
          title={t(lang, "qrSoon")}
          aria-label={t(lang, "qrSoon")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
          </svg>
        </button>

        <button
          type="button"
          className="htb-icon-btn"
          onClick={onNewChat}
          aria-label={t(lang, "newChat")}
          title={t(lang, "newChat")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
            <path d="M9.5 14.5l5.6-5.6a1.4 1.4 0 0 1 2 2L11.5 16.5l-2.6.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
