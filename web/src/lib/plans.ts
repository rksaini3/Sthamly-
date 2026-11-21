// Sthamly AI web: plan aur top-up ki jaankari, ek hi jagah.
// ⚠️ Yahan ki keemat aur benefits ABHI ANUMAAN (placeholder) hain. Asli rupaye aur sahi benefits
// yahin badlein. Payment (Razorpay) abhi jud nahi hai, isliye PlansPage par kharidne ka button "जल्द" dikhta hai.

export interface TopupPack {
  id: string;
  title: string;
  note: string;
  priceInr: number;
}

export const TOPUP_PACKS: readonly TopupPack[] = [
  { id: "small", title: "छोटा पैक", note: "हल्के इस्तेमाल के लिए", priceInr: 49 },
  { id: "medium", title: "मध्यम पैक", note: "रोज़ के काम के लिए", priceInr: 99 },
  { id: "large", title: "बड़ा पैक", note: "ज़्यादा बनाने वालों के लिए", priceInr: 199 },
];

export const PREMIUM_PLAN = {
  title: "प्रीमियम",
  priceInr: 299,
  period: "महीना",
  benefits: [
    "रोज़ की सीमा ज़्यादा (चैट, तस्वीरें, दस्तावेज़)",
    "प्राथमिकता वाले जवाब",
    "सभी बनाने वाले टूल: तस्वीर, स्लाइड, वेबसाइट, दस्तावेज़",
    "हर महीने अपने-आप नवीनीकरण, कभी भी रद्द करें",
  ],
};

export const FREE_PLAN = {
  title: "फ़्री",
  priceInr: 0,
  benefits: [
    "रोज़ की सीमित चैट और बनाना",
    "बुनियादी सुविधाएँ",
  ],
};