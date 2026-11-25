// Sthamly AI web: plans screen. Teen hisse, jaise telecom ke recharge page par:
//   1. Mahine ke plan (Basic, Pro, Super)
//   2. Booster pack (credits khatam hone par; kabhi expire nahi hote)
//   3. Credits kaise katte hain
// Koi bhi dekh sakta hai. Kharidne ke liye login zaroori. Billing server na chale to page phir bhi khulta hai,
// bas khareed band rehti hai. Credits client par nahi jaate: webhook jorta hai, yahan sirf balance dikhta hai.

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
import { FREE_PLAN, PAID_PLANS, QUICK_TRY_PACK, TOPUP_PACKS, type PaidPlan, type TopupPack } from "../lib/plans";
import "./PlansPage.css";

// Database ke plan naam -> tier. Basic ka database naam 'plus' hai.
const TIER_OF_DB_PLAN: Record<string, PaidTierId> = { plus: "basic", pro: "pro", super: "super" };
const PLAN_NAME: Record<string, string> = { free: "फ़्री", plus: "बेसिक", pro: "प्रो", super: "सुपर" };

// Balance load na ho: sirf saaf vakya. Raw server error kabhi nahi dikhta.
const UNAVAILABLE_TEXT = "बैलेंस और खरीदारी अभी उपलब्ध नहीं है।";

type LoadState = "idle" | "loading" | "ready" | "unavailable";

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।";
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" });
}

function inr(n: number): string {
  return n.toLocaleString("en-IN");
}

export function PlansPage() {
  const { status, getAccessToken } = useAuth();
  const signedIn = status === "signed_in";

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  // Ek waqt mein ek hi kharid (busy ka key batata hai kaun sa button chal raha hai).
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = useCallback(async (): Promise<void> => {
    const token = await getAccessToken();
    if (!token) {
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    try {
      setBilling(await fetchBillingStatus(token));
      setLoadState("ready");
    } catch {
      setBilling(null);
      setLoadState("unavailable");
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (signedIn) {
      void loadStatus();
    } else {
      setBilling(null);
      setLoadState("idle");
    }
  }, [signedIn, loadStatus]);

  const hasLiveSub =
    billing !== null &&
    loadState === "ready" &&
    (billing.subscription_status === "active" || billing.subscription_status === "past_due");
  const liveTier: PaidTierId | null =
    billing !== null && hasLiveSub ? (TIER_OF_DB_PLAN[billing.plan] ?? null) : null;
  const renewal = billing !== null && hasLiveSub ? formatDate(billing.current_period_end) : null;
  const statusNote =
    billing?.subscription_status === "cancelled"
      ? " · सब्सक्रिप्शन रद्द"
      : billing?.subscription_status === "past_due"
        ? " · भुगतान बाकी है"
        : "";

  // Free user ko Quick Try pack, paid user ko baaki packs (server bhi yahi rokta hai).
  const packs: readonly TopupPack[] = billing?.quick_try_available ? [QUICK_TRY_PACK] : TOPUP_PACKS;

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

  // Mahine ke plan ka button. Har haal mein ek hi jagah tay hota hai.
  function planAction(plan: PaidPlan) {
    if (!signedIn) {
      return (
        <Link to="/login" className="pp-btn pp-btn-primary">
          लॉग-इन करें
        </Link>
      );
    }
    if (loadState === "idle" || loadState === "loading") {
      return (
        <button type="button" className="pp-btn" disabled>
          लोड हो रहा है…
        </button>
      );
    }
    if (billing === null) {
      return (
        <button type="button" className="pp-btn" disabled>
          जल्द उपलब्ध
        </button>
      );
    }
    if (liveTier === plan.id) {
      return (
        <button type="button" className="pp-btn" disabled>
          आपका मौजूदा प्लान
        </button>
      );
    }
    if (hasLiveSub) {
      return (
        <button type="button" className="pp-btn" disabled>
          प्लान बदलना जल्द
        </button>
      );
    }
    const key = `sub-${plan.id}`;
    return (
      <button
        type="button"
        className={plan.featured ? "pp-btn pp-btn-primary" : "pp-btn"}
        disabled={busy !== null}
        onClick={() => void purchase(key, (token) => buySubscription(token, plan.id))}
      >
        {busy === key ? "खुल रहा है…" : "यह प्लान लें"}
      </button>
    );
  }

  // Booster pack ka button.
  function packAction(pack: TopupPack) {
    if (!signedIn) {
      return (
        <Link to="/login" className="pp-btn pp-btn-primary">
          लॉग-इन करें
        </Link>
      );
    }
    if (loadState === "idle" || loadState === "loading") {
      return (
        <button type="button" className="pp-btn" disabled>
          लोड हो रहा है…
        </button>
      );
    }
    if (billing === null) {
      return (
        <button type="button" className="pp-btn" disabled>
          जल्द उपलब्ध
        </button>
      );
    }
    const packId = pack.id as TopupPackId;
    const key = `topup-${packId}`;
    return (
      <button
        type="button"
        className="pp-btn pp-btn-primary"
        disabled={busy !== null}
        onClick={() => void purchase(key, (token) => buyTopup(token, packId))}
      >
        {busy === key ? "खुल रहा है…" : "खरीदें"}
      </button>
    );
  }

  return (
    <div className="pp-page">
      <header className="pp-head">
        <Link to="/chat" className="pp-back">
          ← चैट पर वापस
        </Link>
        <h1>प्लान और टॉपअप</h1>
        <p>
          हर महीने का प्लान, या ज़रूरत पड़ने पर बूस्टर। प्लान के क्रेडिट हर महीने रीसेट होते हैं, बूस्टर के कभी expire नहीं होते।
        </p>
      </header>

      {signedIn && loadState === "ready" && billing !== null && (
        <section className="pp-balance" aria-labelledby="pp-balance-title">
          <h2 id="pp-balance-title" className="pp-h2">
            आपका बैलेंस
          </h2>
          <p className="pp-balance-total">
            <strong>{inr(billing.credits.total)}</strong> क्रेडिट बचे
          </p>
          <ul className="pp-balance-list">
            <li>
              प्लान से: {inr(billing.credits.plan)}
              {renewal && ` (${renewal} को रीसेट)`}
            </li>
            <li>बूस्टर से: {inr(billing.credits.topup)} (कभी expire नहीं)</li>
          </ul>
          <p className="pp-note">
            प्लान: {PLAN_NAME[billing.plan] ?? billing.plan}
            {statusNote}
          </p>
          <button
            type="button"
            className="pp-btn pp-btn-small"
            disabled={busy !== null}
            onClick={() => void refresh()}
          >
            {busy === "refresh" ? "ताज़ा हो रहा है…" : "बैलेंस ताज़ा करें"}
          </button>
        </section>
      )}

      {signedIn && loadState === "unavailable" && (
        <section className="pp-info" role="status">
          <p>{UNAVAILABLE_TEXT}</p>
          <button type="button" className="pp-btn pp-btn-small" onClick={() => void loadStatus()}>
            फिर से कोशिश करें
          </button>
        </section>
      )}

      {notice && (
        <p className="pp-notice" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="pp-error" role="alert">
          {actionError}
        </p>
      )}

      <section className="pp-section" aria-labelledby="pp-plans-title">
        <div className="pp-section-head">
          <h2 id="pp-plans-title">मासिक प्लान</h2>
          <p>हर महीने अपने-आप नवीनीकरण। कभी भी रद्द करें।</p>
        </div>
        <div className="pp-grid">
          <article className="pp-card">
            <h3>{FREE_PLAN.title}</h3>
            <p className="pp-price">
              ₹0 <small>हमेशा</small>
            </p>
            <p className="pp-credits">रोज़ की सीमा तक चैट और बनाना</p>
            <ul className="pp-list">
              {FREE_PLAN.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className="pp-card-foot">
              <button type="button" className="pp-btn" disabled>
                {hasLiveSub ? "सब्सक्रिप्शन चालू है" : "आपका मौजूदा प्लान"}
              </button>
            </div>
          </article>

          {PAID_PLANS.map((plan) => (
            <article key={plan.id} className={plan.featured ? "pp-card pp-card-featured" : "pp-card"}>
              {plan.featured && <span className="pp-badge">सबसे लोकप्रिय</span>}
              <h3>{plan.title}</h3>
              <p className="pp-price">
                ₹{inr(plan.priceInr)} <small>/ महीना</small>
              </p>
              <p className="pp-credits">{inr(plan.monthlyCredits)} क्रेडिट / महीना</p>
              <ul className="pp-list">
                {plan.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="pp-card-foot">{planAction(plan)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="pp-section" aria-labelledby="pp-topup-title">
        <div className="pp-section-head">
          <h2 id="pp-topup-title">बूस्टर पैक (टॉपअप)</h2>
          <p>प्लान के क्रेडिट खत्म हो जाएँ तो। बूस्टर के क्रेडिट कभी expire नहीं होते।</p>
        </div>
        <ul className="pp-rows">
          {packs.map((p) => (
            <li key={p.id} className="pp-row">
              <div className="pp-row-main">
                <strong>{p.title}</strong>
                <span>{p.note}</span>
              </div>
              <span className="pp-row-price">₹{inr(p.priceInr)}</span>
              <div className="pp-row-btn">{packAction(p)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="pp-section" aria-labelledby="pp-rules-title">
        <div className="pp-section-head">
          <h2 id="pp-rules-title">क्रेडिट कैसे खर्च होते हैं</h2>
        </div>
        <ul className="pp-rows">
          <li className="pp-row">
            <div className="pp-row-main">
              <strong>चैट का जवाब</strong>
              <span>हर जवाब पर</span>
            </div>
            <span className="pp-row-price">1 क्रेडिट</span>
          </li>
          <li className="pp-row">
            <div className="pp-row-main">
              <strong>तस्वीर बनाना</strong>
              <span>हर तस्वीर पर</span>
            </div>
            <span className="pp-row-price">10 क्रेडिट</span>
          </li>
        </ul>
        <p className="pp-note">
          पहले प्लान के क्रेडिट लगते हैं, फिर बूस्टर के। जवाब या तस्वीर मिलने पर ही क्रेडिट कटते हैं।
        </p>
      </section>

      {!signedIn && (
        <p className="pp-login">
          खरीदने के लिए <Link to="/login">लॉग-इन करें</Link>।
        </p>
      )}
    </div>
  );
}