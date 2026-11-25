// Sthamly AI web: plan aur top-up ka screen. Koi bhi dekh sakta hai. Kharidne ke liye login zaroori.
// Kharidna: Worker se order, phir Razorpay ka popup. Credits client par nahi jaate: webhook jorta hai, yahan sirf balance dikhta hai.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  buySubscription,
  buyTopup,
  fetchBillingStatus,
  type BillingStatus,
  type CheckoutResult,
  type PaidTierId,
  type TopupPackId,
} from "../api/billing";
import { FREE_PLAN, PAID_PLANS, QUICK_TRY_PACK, TOPUP_PACKS, type TopupPack } from "../lib/plans";
import "./PlansPage.css";
import "./PlansPage.billing.css";

// Database ke plan naam -> tier. Basic ka database naam 'plus' hai.
const TIER_OF_DB_PLAN: Record<string, PaidTierId> = { plus: "basic", pro: "pro", super: "super" };
const PLAN_NAME: Record<string, string> = { free: "फ़्री", plus: "बेसिक", pro: "प्रो", super: "सुपर" };

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।";
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function PlansPage() {
  const { status, getAccessToken } = useAuth();
  const signedIn = status === "signed_in";

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Kaun sa button chal raha hai (ek hi waqt mein ek kharid).
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = useCallback(async (): Promise<void> => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setBilling(await fetchBillingStatus(token));
      setStatusError(null);
    } catch (err) {
      setStatusError(messageOf(err));
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (signedIn) {
      void loadStatus();
    } else {
      setBilling(null);
    }
  }, [signedIn, loadStatus]);

  const hasLiveSub =
    billing !== null && (billing.subscription_status === "active" || billing.subscription_status === "past_due");
  const liveTier: PaidTierId | null =
    billing !== null && hasLiveSub ? (TIER_OF_DB_PLAN[billing.plan] ?? null) : null;

  async function purchase(key: string, run: (token: string) => Promise<CheckoutResult>): Promise<void> {
    setNotice(null);
    setActionError(null);
    setBusy(key);
    try {
      const token = await getAccessToken();
      if (!token) {
        setActionError("पहले लॉग-इन करें।");
        return;
      }
      const result = await run(token);
      if (result === "paid") {
        setNotice("भुगतान हो गया। क्रेडिट कुछ ही देर में जुड़ जाएँगे। नीचे 'बैलेंस ताज़ा करें' दबाएँ।");
        await loadStatus();
      }
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function refresh(): Promise<void> {
    setBusy("refresh");
    try {
      await loadStatus();
    } finally {
      setBusy(null);
    }
  }

  // Paid card ka button: login, abhi ka plan, ya kharidne ka button.
  function paidButton(tier: PaidTierId, featured: boolean) {
    const cls = featured ? "btn-primary plan-cta" : "btn-ghost plan-cta";
    if (!signedIn) {
      return (
        <Link to="/login" className={cls}>
          लॉग-इन करें
        </Link>
      );
    }
    if (billing === null) {
      return (
        <button type="button" className={cls} disabled>
          लोड हो रहा है…
        </button>
      );
    }
    if (liveTier === tier) {
      return (
        <button type="button" className="btn-ghost plan-cta" disabled>
          अभी का प्लान
        </button>
      );
    }
    if (hasLiveSub) {
      return (
        <button type="button" className="btn-ghost plan-cta" disabled>
          अभी बदल नहीं सकते
        </button>
      );
    }
    const key = `sub-${tier}`;
    return (
      <button
        type="button"
        className={cls}
        disabled={busy !== null}
        onClick={() => void purchase(key, (token) => buySubscription(token, tier))}
      >
        {busy === key ? "खुल रहा है…" : "यह प्लान लें"}
      </button>
    );
  }

  // Booster ka button. Free user ko Quick Try, paid user ko baaki packs (server bhi yahi rokta hai).
  function topupButton(pack: TopupPack) {
    if (!signedIn) {
      return (
        <Link to="/login" className="btn-primary plan-cta">
          लॉग-इन करें
        </Link>
      );
    }
    if (billing === null) {
      return (
        <button type="button" className="btn-primary plan-cta" disabled>
          लोड हो रहा है…
        </button>
      );
    }
    const packId = pack.id as TopupPackId;
    const key = `topup-${packId}`;
    return (
      <button
        type="button"
        className="btn-primary plan-cta"
        disabled={busy !== null}
        onClick={() => void purchase(key, (token) => buyTopup(token, packId))}
      >
        {busy === key ? "खुल रहा है…" : "खरीदें"}
      </button>
    );
  }

  const packs: readonly TopupPack[] = billing?.quick_try_available ? [QUICK_TRY_PACK] : TOPUP_PACKS;
  const renewal = billing !== null && hasLiveSub ? formatDate(billing.current_period_end) : null;
  const statusNote =
    billing?.subscription_status === "cancelled"
      ? " · सब्सक्रिप्शन रद्द"
      : billing?.subscription_status === "past_due"
        ? " · भुगतान बाकी है"
        : "";

  return (
    <div className="plans-page">
      <header className="plans-head">
        <Link to="/chat" className="plans-back">
          ← चैट पर वापस
        </Link>
        <h1>प्लान और टॉपअप</h1>
        <p className="muted">
          अपनी ज़रूरत के हिसाब से चुनें। हर प्लान महीने के क्रेडिट देता है। टॉपअप अलग से, कभी expire नहीं होता।
        </p>
      </header>

      {signedIn && billing && (
        <section className="plans-credits" aria-labelledby="credits-title">
          <h2 id="credits-title">आपके क्रेडिट</h2>
          <p className="credits-total">
            <strong>{billing.credits.total.toLocaleString("en-IN")}</strong> क्रेडिट बचे
          </p>
          <ul className="credits-breakdown">
            <li>
              प्लान से: {billing.credits.plan.toLocaleString("en-IN")}
              {renewal && ` (${renewal} को नए सिरे से)`}
            </li>
            <li>बूस्टर से: {billing.credits.topup.toLocaleString("en-IN")} (कभी expire नहीं)</li>
          </ul>
          <p className="muted small">
            प्लान: {PLAN_NAME[billing.plan] ?? billing.plan}
            {statusNote}
          </p>
          <p className="muted small">चैट का हर जवाब 1 क्रेडिट, तस्वीर 10 क्रेडिट।</p>
          <button type="button" className="btn-ghost plan-cta" disabled={busy !== null} onClick={() => void refresh()}>
            {busy === "refresh" ? "ताज़ा हो रहा है…" : "बैलेंस ताज़ा करें"}
          </button>
        </section>
      )}

      {notice && (
        <p className="plans-notice" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="plans-error" role="alert">
          {actionError}
        </p>
      )}
      {statusError && (
        <p className="plans-error" role="alert">
          {statusError}
        </p>
      )}

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

        {PAID_PLANS.map((plan) => (
          <section
            key={plan.id}
            className={plan.featured ? "plan-card featured" : "plan-card"}
            id={`plan-${plan.id}`}
            aria-labelledby={`plan-${plan.id}-title`}
          >
            {plan.featured && <span className="plan-tag">सबसे अच्छा</span>}
            <h2 id={`plan-${plan.id}-title`}>{plan.title}</h2>
            <p className="price">
              ₹{plan.priceInr.toLocaleString("en-IN")}
              <span className="muted small"> / महीना</span>
            </p>
            <ul className="benefits">
              {plan.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {paidButton(plan.id, plan.featured)}
          </section>
        ))}

        <section className="plan-card" id="topup" aria-labelledby="plan-topup">
          <h2 id="plan-topup">टॉपअप</h2>
          <p className="muted small">
            {billing?.quick_try_available
              ? "आज़माने के लिए एक पैक। खरीदने के बाद बाकी बूस्टर भी दिखेंगे।"
              : "जितना चाहिए उतना लें। ख़त्म होने पर फिर से।"}
          </p>
          <ul className="pack-list">
            {packs.map((p) => (
              <li key={p.id} className="pack">
                <div className="pack-text">
                  <strong>{p.title}</strong>
                  <span className="muted small">{p.note}</span>
                </div>
                <span className="price">₹{p.priceInr}</span>
                {topupButton(p)}
              </li>
            ))}
          </ul>
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