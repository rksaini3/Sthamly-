// सारे पैसे पैसे (paise) में। ₹1 = 100 paise। फ़्लोट कहीं नहीं।

export const POSTER_PRICE_PAISE = 500; // ₹5 प्रति पोस्टर (वॉलेट दर, खुला बिंदु: थोक दर)
export const WATERMARK_REMOVAL_PAISE = 100; // ₹1
export const MIN_RECHARGE_PAISE = 5000; // ₹50 न्यूनतम
export const FREE_POSTERS_PER_DAY = 3;
export const MAX_BATCH_SIZE = 10;
export const FIRST_RECHARGE_BONUS_MIN_PAISE = 10000; // ₹100+ पर पहली बार
export const FIRST_RECHARGE_BONUS_PERCENT = 10;
export const RECHARGE_OPTIONS_PAISE = [5000, 10000, 20000, 50000] as const;

// एक काम की ऊपरी सीमा। एक पोस्टर का अधिकतम खर्च ₹5 + ₹1 = ₹6, इसलिए सीमा ₹10।
export const MAX_COST_PAISE_PER_JOB = 1000;

export type Plan = "free" | "starter" | "premium" | "business";

export interface PlanConfig {
  plan: Plan;
  monthlyPricePaise: number;
  // खुला बिंदु: महीने के पोस्टर की संख्या। null = अभी तय नहीं, कोटा लागू नहीं।
  monthlyPosters: number | null;
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: { plan: "free", monthlyPricePaise: 0, monthlyPosters: null },
  starter: { plan: "starter", monthlyPricePaise: 14900, monthlyPosters: null },
  premium: { plan: "premium", monthlyPricePaise: 39900, monthlyPosters: null },
  business: { plan: "business", monthlyPricePaise: 99900, monthlyPosters: null },
};

export interface UsageState {
  plan: Plan;
  freePostersUsedToday: number;
  planPostersLeftThisMonth: number | null; // null = कोटा नहीं
  walletPaise: number;
}

export type ChargeSource =
  | { kind: "free" }
  | { kind: "plan" }
  | { kind: "wallet"; amountPaise: number }
  | { kind: "blocked"; reason: "over_job_cap" | "need_recharge" };

// क्रम: 1) मुफ़्त रोज़ का कोटा 2) प्लान का कोटा 3) वॉलेट। कुछ न हो तो रुकें।
export function chooseSource(state: UsageState, costPaise: number = POSTER_PRICE_PAISE): ChargeSource {
  if (costPaise > MAX_COST_PAISE_PER_JOB) {
    return { kind: "blocked", reason: "over_job_cap" };
  }
  if (state.plan === "free" && state.freePostersUsedToday < FREE_POSTERS_PER_DAY) {
    return { kind: "free" };
  }
  if (state.planPostersLeftThisMonth !== null && state.planPostersLeftThisMonth > 0) {
    return { kind: "plan" };
  }
  if (state.walletPaise >= costPaise) {
    return { kind: "wallet", amountPaise: costPaise };
  }
  return { kind: "blocked", reason: "need_recharge" };
}

export interface BatchQuote {
  items: number;
  freeItems: number;
  planItems: number;
  walletItems: number;
  walletTotalPaise: number;
  canStart: boolean;
  shortfallPaise: number;
}

// बैच का कुल हिसाब पहले दिखाया जाता है। पुष्टि के बाद ही कटता है।
export function quoteBatch(itemCount: number, state: UsageState): BatchQuote {
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > MAX_BATCH_SIZE) {
    throw new RangeError(`बैच 1 से ${MAX_BATCH_SIZE} पोस्टर तक हो सकता है`);
  }
  let remaining = itemCount;
  let freeItems = 0;
  if (state.plan === "free") {
    freeItems = Math.min(remaining, Math.max(0, FREE_POSTERS_PER_DAY - state.freePostersUsedToday));
    remaining -= freeItems;
  }
  let planItems = 0;
  if (state.planPostersLeftThisMonth !== null) {
    planItems = Math.min(remaining, state.planPostersLeftThisMonth);
    remaining -= planItems;
  }
  const walletItems = remaining;
  const walletTotalPaise = walletItems * POSTER_PRICE_PAISE;
  const shortfallPaise = Math.max(0, walletTotalPaise - state.walletPaise);
  return {
    items: itemCount,
    freeItems,
    planItems,
    walletItems,
    walletTotalPaise,
    canStart: shortfallPaise === 0,
    shortfallPaise,
  };
}

export function rechargeBonusPaise(amountPaise: number, isFirstRecharge: boolean): number {
  if (!isFirstRecharge || amountPaise < FIRST_RECHARGE_BONUS_MIN_PAISE) return 0;
  return Math.floor((amountPaise * FIRST_RECHARGE_BONUS_PERCENT) / 100);
}

export function formatRupees(paise: number): string {
  // 500 → "₹5", 550 → "₹5.5", 505 → "₹5.05"
  const fixed = (paise / 100).toFixed(2);
  const text = fixed.endsWith("00") ? fixed.slice(0, -3) : fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
  return `₹${text}`;
}