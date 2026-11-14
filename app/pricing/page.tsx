"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
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

// पोस्टर की संख्या: प्लान में कोटा तय हो तो वही दिखे, वरना साफ़ लिखें कि अभी तय नहीं
function posterLine(plan: PricingPlan): string {
  const { limit, window } = PLAN_ALLOWANCES[plan].poster;
  if (limit <= 0) return `पोस्टर: ${formatRupees(PRICE_PAISE.ai_poster)} प्रति पोस्टर, वॉलेट से (प्लान का कोटा जल्द तय होगा)`;
  return window === "day" ? `रोज़ ${limit} पोस्टर` : `महीने में ${limit} पोस्टर`;
}

const PLAN_POINTS: Record<PricingPlan, string[]> = {
  free: [posterLine("free"), "वॉटरमार्क के साथ"],
  starter: [posterLine("starter")],
  premium: [posterLine("premium"), "बिना वॉटरमार्क"],
  business: [posterLine("business"), "बिना वॉटरमार्क"],
};

// मुफ़्त प्लान की कीमत ₹0, बाकी की मासिक कीमत lib/pricing.ts से
function priceText(plan: PricingPlan): string {
  if (plan === "free") return "₹0 / महीना";
  return `${formatRupees(PLAN_PRICE_PAISE[plan])} / महीना`;
}

export default function PricingPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>प्लान और वॉलेट</h1>
      <p className="muted" style={{ margin: 0 }}>
        मुफ़्त में शुरू करें। ज़रूरत हो तो प्लान लें या वॉलेट में पैसे डालें।
      </p>

      {ORDER.map((plan) => (
        <section key={plan} className="card stack" style={{ gap: 8 }}>
          <strong style={{ fontSize: "1.1rem" }}>{PLAN_LABEL[plan]}</strong>
          <p style={{ margin: 0, fontWeight: 700 }}>{priceText(plan)}</p>
          <ul className="muted" style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {PLAN_POINTS[plan].map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {plan !== "free" && (
            <button type="button" className="btn btn-block" onClick={openSheet}>
              {PLAN_LABEL[plan]} प्लान लें
            </button>
          )}
        </section>
      ))}

      <section className="card stack" style={{ gap: 8 }}>
        <strong>वॉलेट से एक-एक काम</strong>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
          <li>AI पोस्टर: {formatRupees(PRICE_PAISE.ai_poster)}</li>
          <li>पोस्टर से वॉटरमार्क हटाना: {formatRupees(PRICE_PAISE.watermark_removal)}</li>
        </ul>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          टॉप-अप की रकम: {TOPUP_PRESETS_PAISE.map((paise) => formatRupees(paise)).join(", ")}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          पहली बार {formatRupees(FIRST_TOPUP_BONUS_MIN_PAISE)} या उससे ज़्यादा डालने पर {FIRST_TOPUP_BONUS_PERCENT}% बोनस।
        </p>
        <button type="button" className="btn btn-block" onClick={openSheet}>
          वॉलेट में पैसे डालें
        </button>
      </section>

      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        भुगतान के लिए पहले{" "}
        <Link href="/login?next=/pricing" style={{ color: "var(--accent)", fontWeight: 600 }}>
          लॉग-इन करें
        </Link>
        ।
      </p>

      <Link href="/my-posters" className="btn btn-block">
        मेरे बनाए पर वापस
      </Link>

      <UpgradeSheet open={sheetOpen} onClose={closeSheet} lang="hi" limitReached={false} />
    </main>
  );
}