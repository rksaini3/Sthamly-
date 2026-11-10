// सारी रकम paise में (₹1 = 100 paise)। पूर्णांक रखने से float की गलती नहीं होती।
// यह फ़ाइल कीमतों का एकमात्र स्रोत है। कीमत बदलनी हो तो सिर्फ़ यहीं बदलें।
//
// ध्यान: ये कीमतें GST सहित (ग्राहक को दिखने वाली) हैं।
// लागत और मार्जिन का हिसाब इस फ़ाइल में नहीं है।

// प्लान के नाम (कोटा और कीमत के लिए)। types/domain.ts का Plan अभी पुराना है, इसलिए यहाँ अलग।
export type PricingPlan = "free" | "starter" | "premium" | "business";

// ---- 1. वॉलेट के माइक्रो-आइटम (खुद खरीदने पर) ----
export const PRICE_PAISE = {
  watermark_removal: 100, // ₹1 लाइब्रेरी पोस्टर से वॉटरमार्क हटाना
  ai_poster: 500, // ₹5 AI बैकग्राउंड पोस्टर
  ai_banner: 1000, // ₹10 AI बैनर
  slide_reel: 1500, // ₹15 स्लाइड-शो रील
  voice_over: 1500, // ₹15 वॉइस-ओवर (30 सेकंड)
  ai_reel_540p_5s: 9900, // ₹99 AI रील, 5 सेकंड, 540p (ड्राफ़्ट)
  ai_reel_720p_5s: 19900, // ₹199 AI रील, 5 सेकंड, 720p
  ai_reel_720p_5s_member: 16900, // ₹169 प्रीमियम/बिज़नेस सदस्यों के लिए
} as const;

export type PaidItem = keyof typeof PRICE_PAISE;

// ---- 2. टॉप-अप ----
export const TOPUP_MIN_PAISE = 5000; // ₹50 न्यूनतम
export const TOPUP_PRESETS_PAISE = [5000, 10000, 20000, 50000] as const; // ₹50, ₹100, ₹200, ₹500
export const FIRST_TOPUP_BONUS_PERCENT = 10; // पहली बार बोनस
export const FIRST_TOPUP_BONUS_MIN_PAISE = 10000; // बोनस के लिए कम से कम ₹100
export const WALLET_EXPIRY_DAYS = 90; // कानूनी राय के बाद पक्का करें

// ---- 3. प्लान की कीमत (GST सहित) ----
export const PLAN_PRICE_PAISE = {
  starter: { monthly: 14900, yearly: 149000 }, // ₹149 / ₹1,490
  premium: { monthly: 39900, yearly: 399000 }, // ₹399 / ₹3,990
  business: { monthly: 99900, yearly: 999000 }, // ₹999 / ₹9,990
} as const;

export type PaidPlan = keyof typeof PLAN_PRICE_PAISE;

// ---- 4. हर प्लान में क्या शामिल है (कोटा) ----
// window: "day" = आज (IST), "week" = पिछले 7 दिन, "month" = IST कैलेंडर महीना
export type QuotaWindow = "day" | "week" | "month";

export interface Allowance {
  limit: number;
  window: QuotaWindow;
}

export interface PlanAllowances {
  poster: Allowance;
  reel: Allowance;
  logins: number; // एक दुकान पर कितने लॉगिन
  whatsappAutoPostPerMonth: number; // WhatsApp पर ऑटो-पोस्ट (0 = सिर्फ़ मैन्युअल Share)
  libraryPerDay: number | null;
}

export const PLAN_ALLOWANCES: Record<PricingPlan, PlanAllowances> = {
  free: {
    poster: { limit: 3, window: "day" },
    reel: { limit: 1, window: "week" },
    logins: 1,
    whatsappAutoPostPerMonth: 0,
    libraryPerDay: 3,
  },
  starter: {
    poster: { limit: 20, window: "month" },
    reel: { limit: 4, window: "month" },
    logins: 1,
    whatsappAutoPostPerMonth: 0,
    libraryPerDay: 30, // दुरुपयोग रोकने की सीमा
  },
  premium: {
    poster: { limit: 40, window: "month" },
    reel: { limit: 12, window: "month" },
    logins: 2,
    whatsappAutoPostPerMonth: 13, // हफ़्ते में लगभग 3
    libraryPerDay: 50,
  },
  business: {
    poster: { limit: 80, window: "month" },
    reel: { limit: 20, window: "month" },
    logins: 3,
    whatsappAutoPostPerMonth: 30, // हर दिन
    libraryPerDay: 100,
  },
};

// ---- 5. मुफ़्त टियर के नियम ----
export const FREE_TIER = {
  aiPosterFirstClean: true, // पहला AI पोस्टर बिना वॉटरमार्क
  aiPosterWatermarkedDays: 14, // उसके बाद 14 दिन तक रोज़ 1 AI पोस्टर (वॉटरमार्क के साथ)
  referralBonusAiPosters: 5, // दोनों को, पहला पोस्टर बनने पर
  referralExpiryDays: 30,
  festivalPackExtraLibrary: 5,
} as const;

// ---- 6. रिफ़ंड नियम ----
// फ़ेल हुआ काम: पूरा पैसा वॉलेट में वापस।
// डिलीवर हो चुका काम: रिफ़ंड नहीं।
export const REFUND_POLICY = "failed_only" as const;

// ---- 7. प्लान के नाम (स्क्रीन पर दिखाने के लिए) ----
export const PLAN_LABEL: Record<PricingPlan, string> = {
  free: "मुफ़्त",
  starter: "स्टार्टर",
  premium: "प्रीमियम",
  business: "बिज़नेस",
};

// ---- 8. सहायक फ़ंक्शन ----
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}