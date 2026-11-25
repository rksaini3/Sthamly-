// Sthamly AI web: plan aur top-up ki jaankari, ek hi jagah.
// Payment (Razorpay) abhi jud nahi hai, isliye PlansPage par kharidne ka button "जल्द" dikhta hai.
// Credits: chat 1, tasveer 10. Plan ke credits har mahine reset hote hain; booster ke kabhi expire nahi hote.

export interface TopupPack {
  id: string;
  title: string;
  note: string;
  priceInr: number;
  credits: number;
}

export interface PaidPlan {
  id: "basic" | "pro" | "super";
  title: string;
  priceInr: number;
  monthlyCredits: number;
  featured: boolean;
  benefits: readonly string[];
}

// Booster: sirf paid plan wale kharid sakte hain. Credits kabhi expire nahi hote.
// Keemat final hai (Nov 2026). Per credit ka rate plan se kam nahi hona chahiye.
export const TOPUP_PACKS: readonly TopupPack[] = [
  { id: "mini", title: "मिनी बूस्टर", note: "300 क्रेडिट, हल्के इस्तेमाल के लिए", priceInr: 149, credits: 300 },
  { id: "growth", title: "ग्रोथ बूस्टर", note: "800 क्रेडिट, रोज़ के काम के लिए", priceInr: 299, credits: 800 },
  { id: "vip", title: "VIP बूस्टर", note: "1,500 क्रेडिट, ज़्यादा प्रोडक्ट फ़ोटो के लिए", priceInr: 599, credits: 1500 },
];

// Free user ke liye ek hi pack: 300 क्रेडिट, ₹149. (Free user ke liye kharid ka button tabhi dikhega jab billing chalu ho.)
export const QUICK_TRY_PACK: TopupPack = {
  id: "quick_try",
  title: "क्विक ट्राई पैक",
  note: "300 क्रेडिट, आज़माने के लिए",
  priceInr: 149,
  credits: 300,
};

// Teen paid tier. Keemat aur credits final hain (Nov 2026). Database ka naam: basic = plus, pro = pro, super = super.
export const PAID_PLANS: readonly PaidPlan[] = [
  {
    id: "basic",
    title: "बेसिक",
    priceInr: 199,
    monthlyCredits: 1000,
    featured: false,
    benefits: [
      "हर महीने 1,000 क्रेडिट (लगभग 1,000 चैट जवाब या 100 तस्वीरें)",
      "सभी चैट मोड: दुकान, पढ़ाई, कानूनी, क्रिएटर",
      "हर महीने अपने-आप नवीनीकरण, कभी भी रद्द करें",
    ],
  },
  {
    id: "pro",
    title: "प्रो",
    priceInr: 499,
    monthlyCredits: 3000,
    featured: true,
    benefits: [
      "हर महीने 3,000 क्रेडिट (लगभग 300 तस्वीरें)",
      "सभी चैट मोड: दुकान, पढ़ाई, कानूनी, क्रिएटर",
      "हर महीने अपने-आप नवीनीकरण, कभी भी रद्द करें",
    ],
  },
  {
    id: "super",
    title: "सुपर",
    priceInr: 1499,
    monthlyCredits: 12000,
    featured: false,
    benefits: [
      "हर महीने 12,000 क्रेडिट (लगभग 1,200 तस्वीरें)",
      "सभी चैट मोड: दुकान, पढ़ाई, कानूनी, क्रिएटर",
      "हर महीने अपने-आप नवीनीकरण, कभी भी रद्द करें",
    ],
  },
];

export const FREE_PLAN = {
  title: "फ़्री",
  priceInr: 0,
  benefits: [
    "रोज़ की सीमित चैट और बनाना",
    "बुनियादी सुविधाएँ",
  ],
};