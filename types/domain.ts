// Domain types: पूरे app में एक ही जगह से import करें (`@/types/domain`)

export const SHOP_CATEGORIES = ["sweets", "salon", "coaching_clinic"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const OUTPUT_TYPES = ["reel", "poster", "caption"] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const PLANS = ["free", "starter", "growth", "shop_pro"] as const;
export type Plan = (typeof PLANS)[number];

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