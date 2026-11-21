// Sthamly AI web: plan aur top-up ka screen. Koi bhi dekh sakta hai. Kharidne ke liye login zaroori.
// Payment abhi chalu nahi hai: kharidne ke buttons "जल्द" dikhte hain. Payment jodne par yahin badlein.

import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { FREE_PLAN, PREMIUM_PLAN, TOPUP_PACKS } from "../lib/plans";
import "./PlansPage.css";

export function PlansPage() {
  const { status } = useAuth();
  const signedIn = status === "signed_in";

  return (
    <div className="plans-page">
      <header className="plans-head">
        <Link to="/chat" className="plans-back">
          ← चैट पर वापस
        </Link>
        <h1>प्लान और टॉपअप</h1>
        <p className="muted">
          अपनी ज़रूरत के हिसाब से चुनें। टॉपअप बिना सब्सक्रिप्शन के, प्रीमियम महीने भर के लिए।
        </p>
      </header>

      <div className="plans-grid">
        <section className="plan-card" aria-labelledby="plan-free">
          <h2 id="plan-free">{FREE_PLAN.title}</h2>
          <p className="price">
            ₹0 <span className="muted small">हमेशा</span>
          </p>
          <ul className="benefits">
            {FREE_PLAN.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <button type="button" className="btn-ghost plan-cta" disabled>
            अभी का प्लान
          </button>
        </section>

        <section className="plan-card featured" id="premium" aria-labelledby="plan-premium">
          <span className="plan-tag">सबसे अच्छा</span>
          <h2 id="plan-premium">{PREMIUM_PLAN.title}</h2>
          <p className="price">
            ₹{PREMIUM_PLAN.priceInr}
            <span className="muted small"> / {PREMIUM_PLAN.period}</span>
          </p>
          <ul className="benefits">
            {PREMIUM_PLAN.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <button type="button" className="btn-primary plan-cta" disabled>
            जल्द उपलब्ध
          </button>
        </section>

        <section className="plan-card" id="topup" aria-labelledby="plan-topup">
          <h2 id="plan-topup">टॉपअप</h2>
          <p className="muted small">जितना चाहिए उतना लें। ख़त्म होने पर फिर से।</p>
          <ul className="pack-list">
            {TOPUP_PACKS.map((p) => (
              <li key={p.id} className="pack">
                <div className="pack-text">
                  <strong>{p.title}</strong>
                  <span className="muted small">{p.note}</span>
                </div>
                <span className="price">₹{p.priceInr}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary plan-cta" disabled>
            जल्द उपलब्ध
          </button>
        </section>
      </div>

      {!signedIn && (
        <p className="muted small plans-login">
          खरीदने के लिए <Link to="/login">लॉग-इन करें</Link>।
        </p>
      )}
    </div>
  );
}