// Domain types: पूरे app में एक ही जगह से import करें (`@/types/domain`)

export const SHOP_CATEGORIES = ["general", "kirana", "salon", "clothing", "mobile", "clinic", "coaching"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const OUTPUT_TYPES = ["reel", "poster", "caption"] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

// प्लान: मुफ़्त, स्टार्टर, प्रीमियम, बिज़नेस। वॉलेट (टॉप-अप) अलग से चलता है।
export const PLANS = ["free", "starter", "premium", "business"] as const;
export type Plan = (typeof PLANS)[number];

// यूज़र की भूमिका। गिरगिट मोड: हर भूमिका का अलग home और टेम्पलेट।
// "finance" सिर्फ़ एडमिन के लिए है (शेयर और कंपनी विश्लेषण, निजी)। lib/admin.ts देखें।
// "lawyer" (वकील): कानूनी मसौदे का pack अभी नहीं बना, इसलिए शुरू में "जल्द आएगा" दिखेगा।
export const ROLES = ["shopkeeper", "student", "creator", "lawyer", "finance"] as const;
export type Role = (typeof ROLES)[number];

export type Language = "hinglish" | "hindi" | "bhojpuri" | "awadhi";

export interface JobInput {
  shopName: string;
  category: ShopCategory;
  city: string;
  offerText: string;
  occasion: string | null; // जैसे "छठ", "शादी सीज़न", "सेल"
  photoPaths: string[]; // Supabase Storage paths
  language: Language;
}