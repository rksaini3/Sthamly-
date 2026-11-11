// भूमिकाएं। तीन पोस्टर भूमिकाएं एक ही पाइपलाइन पर चलती हैं (टेम्पलेट, फ़ील्ड, कैप्शन शैली अलग)।
// चौथी भूमिका "finance" पोस्टर नहीं बनाती: यह शिक्षा और कंपनी-विश्लेषण के ढांचे के लिए है,
// और उसकी कोई खरीद/बेच/होल्ड राय नहीं होती (देखें src/compliance/finance.ts)।

export const POSTER_ROLES = ["shopkeeper", "seller", "creator"] as const;
export type PosterRole = (typeof POSTER_ROLES)[number];

export const FINANCE_ROLE = "finance" as const;
export const ROLES = [...POSTER_ROLES, FINANCE_ROLE] as const;
export type Role = (typeof ROLES)[number];

export type AspectRatio = "4:5" | "1:1" | "9:16";
export type CaptionStyle = "shop" | "marketplace" | "instagram";

export interface PosterRoleConfig {
  role: PosterRole;
  labelHi: string;
  defaultTemplate: "sale-poster" | "product-card" | "promo-card";
  aspect: AspectRatio;
  captionStyle: CaptionStyle;
  batchEnabled: boolean;
  maxBatchSize: number;
  suggestions: readonly string[];
}

export interface FinanceRoleConfig {
  role: typeof FINANCE_ROLE;
  labelHi: string;
  suggestions: readonly string[];
}

export const ROLE_CONFIG: Record<PosterRole, PosterRoleConfig> = {
  shopkeeper: {
    role: "shopkeeper",
    labelHi: "दुकानदार",
    defaultTemplate: "sale-poster",
    aspect: "4:5",
    captionStyle: "shop",
    batchEnabled: false,
    maxBatchSize: 1,
    suggestions: ["दीवाली सेल का पोस्टर", "प्रोडक्ट की फ़ोटो से कार्ड", "कल का मेन्यू", "कैंप का पोस्टर"],
  },
  seller: {
    role: "seller",
    labelHi: "ऑनलाइन सेलर",
    defaultTemplate: "product-card",
    aspect: "1:1",
    captionStyle: "marketplace",
    batchEnabled: true,
    maxBatchSize: 10,
    suggestions: ["एक प्रोडक्ट का कार्ड", "सेल का बैनर", "10 प्रोडक्ट का बैच", "लिस्टिंग इमेज (4:5)"],
  },
  creator: {
    role: "creator",
    labelHi: "क्रिएटर / स्टूडेंट",
    defaultTemplate: "promo-card",
    aspect: "4:5",
    captionStyle: "instagram",
    batchEnabled: false,
    maxBatchSize: 1,
    suggestions: ["कोर्स का प्रोमो कार्ड", "चैनल का थंबनेल", "क्लास का पोस्टर", "इवेंट का कार्ड"],
  },
};

export const FINANCE_CONFIG: FinanceRoleConfig = {
  role: FINANCE_ROLE,
  labelHi: "फ़ाइनेंस / शेयर बाज़ार (शिक्षा)",
  suggestions: [
    "कंपनी का विश्लेषण (अपने आंकड़ों से)",
    "P/E और ROE कैसे पढ़ें",
    "लंबी अवधि का निवेश क्या है",
    "सालाना रिपोर्ट कैसे पढ़ें",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPosterRole(role: Role): role is PosterRole {
  return (POSTER_ROLES as readonly string[]).includes(role);
}

export function roleConfig(role: PosterRole): PosterRoleConfig {
  return ROLE_CONFIG[role];
}