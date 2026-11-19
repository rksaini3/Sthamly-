// Sthamly AI web: usage screen (Blueprint 3.0, section 6 "User", section 7)
// Aaj ka token use aur bachi hui limit, pichhle 30 din ka summary, aur plan ka haal.
// Cost, provider aur model yahan nahi dikhte: woh internal hai (blueprint 7).
// Data Worker se aata hai (GET /api/user/usage, GET /api/user/profile). Client par kuch calculate nahi hota.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiClientError,
  getProfile,
  getUsage,
  type ProfileResponse,
  type UsageResponse,
} from "../api/client";

const FEATURE_LABELS: Record<string, string> = {
  chat: "चैट",
  vision: "फ़ोटो पहचान",
  document: "दस्तावेज़",
  voice_live: "लाइव आवाज़",
  voice_turn: "आवाज़ संदेश",
};

const PLAN_STATUS_LABELS: Record<ProfileResponse["plan"]["status"], string> = {
  active: "सक्रिय",
  past_due: "भुगतान बाकी है",
  cancelled: "रद्द",
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat("hi-IN").format(n);
}

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return "उपयोग की जानकारी नहीं मिल सकी। दोबारा कोशिश करें।";
}

// Progress bar ke liye percent. Limit 0 ho to 0 maanenge, NaN nahi aana chahiye.
function percentUsed(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function UsagePage() {
  const { getAccessToken } = useAuth();

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [plan, setPlan] = useState<ProfileResponse["plan"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
        }

        // Dono ek saath: ek fail ho to bhi dusra dikhe, par error ek hi message mein.
        const [usageRes, profileRes] = await Promise.all([
          getUsage(token, ctrl.signal),
          getProfile(token, ctrl.signal),
        ]);
        if (ctrl.signal.aborted) return;
        setUsage(usageRes);
        setPlan(profileRes.plan);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(errorText(err));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [getAccessToken, reloadKey]);

  const today = usage?.today;
  const last30 = usage?.last_30_days;
  const percent = today ? percentUsed(today.tokens_used, today.tokens_limit) : 0;

  return (
    <main className="usage-page">
      <header className="page-header">
        <Link to="/chat" className="btn-ghost">
          ← वापस चैट पर
        </Link>
        <h1>उपयोग</h1>
      </header>

      {loading && <p className="muted">लोड हो रहा है…</p>}

      {error !== null && (
        <div className="page-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            दोबारा कोशिश करें
          </button>
        </div>
      )}

      {!loading && error === null && usage && (
        <>
          <section className="card" aria-labelledby="today-title">
            <h2 id="today-title">आज</h2>
            <p className="big-number">
              {formatNumber(today?.tokens_used ?? 0)}{" "}
              <span className="muted">/ {formatNumber(today?.tokens_limit ?? 0)} टोकन</span>
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="आज का उपयोग"
            >
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="muted">
              बची हुई सीमा: {formatNumber(today?.tokens_remaining ?? 0)} टोकन। सीमा हर दिन
              UTC आधी रात को नई होती है।
            </p>
          </section>

          <section className="card" aria-labelledby="month-title">
            <h2 id="month-title">पिछले 30 दिन</h2>
            <dl className="stats">
              <div>
                <dt>बातचीत के अनुरोध</dt>
                <dd>{formatNumber(last30?.requests ?? 0)}</dd>
              </div>
              <div>
                <dt>भेजे गए टोकन</dt>
                <dd>{formatNumber(last30?.input_tokens ?? 0)}</dd>
              </div>
              <div>
                <dt>मिले जवाब के टोकन</dt>
                <dd>{formatNumber(last30?.output_tokens ?? 0)}</dd>
              </div>
            </dl>

            {last30 && Object.keys(last30.by_feature).length > 0 && (
              <ul className="feature-list">
                {Object.entries(last30.by_feature).map(([feature, count]) => (
                  <li key={feature}>
                    <span>{FEATURE_LABELS[feature] ?? "अन्य"}</span>
                    <span>{formatNumber(count)}</span>
                  </li>
                ))}
              </ul>
            )}

            {last30?.truncated && (
              <p className="muted small">
                आँकड़े बहुत ज़्यादा हैं, इसलिए सिर्फ़ हाल के अनुरोध गिने गए हैं।
              </p>
            )}
          </section>

          {plan !== null && (
            <section className="card" aria-labelledby="plan-title">
              <h2 id="plan-title">आपका प्लान</h2>
              <p>
                प्लान: <strong>{plan.name}</strong>
              </p>
              <p>स्थिति: {PLAN_STATUS_LABELS[plan.status]}</p>
              <p className="muted small">
                एक जवाब की अधिकतम लंबाई: {formatNumber(plan.max_output_tokens)} टोकन
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}