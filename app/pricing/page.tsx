import Link from "next/link";
import {
  FIRST_TOPUP_BONUS_MIN_PAISE,
  FIRST_TOPUP_BONUS_PERCENT,
  PLAN_ALLOWANCES,
  PLAN_LABEL,
  PLAN_PRICE_PAISE,
  PRICE_PAISE,
  TOPUP_PRESETS_PAISE,
  formatRupees,
  type PricingPlan,
} from "@/lib/pricing";

// कीमतें और कोटा सिर्फ़ lib/pricing.ts से आते हैं। यहाँ कोई संख्या नहीं लिखी जाती।
const ORDER: PricingPlan[] = ["free", "starter", "premium", "business"];

const PLAN_POINTS: Record<PricingPlan, string[]> = {
  free: [
    `रोज़ ${PLAN_ALLOWANCES.free.poster.limit} पोस्टर`,
    `हफ़्ते में ${PLAN_ALLOWANCES.free.reel.limit} टेम्पलेट रील`,
    "वॉटरमार्क के साथ",
  ],
  starter: [
    `महीने में ${PLAN_ALLOWANCES.starter.poster.limit} पोस्टर`,
    `महीने में ${PLAN_ALLOWANCES.starter.reel.limit} टेम्पलेट रील`,
    `${PLAN_ALLOWANCES.starter.logins} लॉगिन`,
  ],
  premium: [
    `महीने में ${PLAN_ALLOWANCES.premium.poster.limit} पोस्टर`,
    `महीने में ${PLAN_ALLOWANCES.premium.reel.limit} टेम्पलेट रील`,
    "बिना वॉटरमार्क",
    `${PLAN_ALLOWANCES.premium.logins} लॉगिन`,
  ],
  business: [
    `महीने में ${PLAN_ALLOWANCES.business.poster.limit} पोस्टर`,
    `महीने में ${PLAN_ALLOWANCES.business.reel.limit} टेम्पलेट रील`,
    "बिना वॉटरमार्क",
    `${PLAN_ALLOWANCES.business.logins} लॉगिन`,
  ],
};

// मुफ़्त प्लान की कीमत ₹0, बाकी की GST सहित कीमत lib/pricing.ts से
function priceText(plan: PricingPlan): { monthly: string; yearly?: string } {
  if (plan === "free") return { monthly: "₹0 / महीना" };
  const prices = PLAN_PRICE_PAISE[plan];
  return {
    monthly: `${formatRupees(prices.monthly)} / महीना`,
    yearly: `या ${formatRupees(prices.yearly)} / साल`,
  };
}

export default function PricingPage() {
  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>प्लान और वॉलेट</h1>
      <p className="muted" style={{ margin: 0 }}>
        मुफ़्त में शुरू करें। ज़रूरत हो तो प्लान लें या वॉलेट में पैसे डालें।
      </p>

      {ORDER.map((plan) => {
        const price = priceText(plan);
        return (
          <section key={plan} className="card stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: "1.1rem" }}>{PLAN_LABEL[plan]}</strong>
            <p style={{ margin: 0, fontWeight: 700 }}>{price.monthly}</p>
            {price.yearly && <p className="muted" style={{ margin: 0 }}>{price.yearly}</p>}
            <ul className="muted" style={{ margin: "4px 0 0", paddingLeft: 20 }}>
              {PLAN_POINTS[plan].map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="card stack" style={{ gap: 8 }}>
        <strong>वॉलेट से एक-एक काम</strong>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
          <li>AI पोस्टर: {formatRupees(PRICE_PAISE.ai_poster)}</li>
          <li>AI बैनर: {formatRupees(PRICE_PAISE.ai_banner)}</li>
          <li>स्लाइड-शो रील: {formatRupees(PRICE_PAISE.slide_reel)}</li>
          <li>पोस्टर से वॉटरमार्क हटाना: {formatRupees(PRICE_PAISE.watermark_removal)}</li>
        </ul>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          टॉप-अप की रकम: {TOPUP_PRESETS_PAISE.map((paise) => formatRupees(paise)).join(", ")}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          पहली बार {formatRupees(FIRST_TOPUP_BONUS_MIN_PAISE)} या उससे ज़्यादा डालने पर {FIRST_TOPUP_BONUS_PERCENT}% बोनस।
        </p>
      </section>

      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          ऑनलाइन भुगतान अभी शुरू नहीं हुआ है। जल्द ही यहीं से प्लान लिया और वॉलेट भरा जा सकेगा।
        </p>
      </div>

      <Link href="/my-posters" className="btn btn-block">
        मेरे बनाए पर वापस
      </Link>
    </main>
  );
}