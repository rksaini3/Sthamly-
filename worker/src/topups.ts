// Sthamly AI Worker: booster (top-up) packs. Keemat aur credits yahin tay hote hain.
// Web ki lib/plans.ts mein wahi numbers hone chahiye. Webhook amount milaata hai, taaki galat amount par credits na jaayen.
// quick_try: sirf free user ke liye. mini, growth, vip: sirf chalu paid subscription wale user ke liye.

export const TOPUP_IDS = ["quick_try", "mini", "growth", "vip"] as const;
export type TopupId = (typeof TOPUP_IDS)[number];

export interface TopupPack {
  id: TopupId;
  amountInr: number;
  credits: number;
  freeOnly: boolean;
}

export const TOPUP_PACKS: Record<TopupId, TopupPack> = {
  quick_try: { id: "quick_try", amountInr: 149, credits: 300, freeOnly: true },
  mini: { id: "mini", amountInr: 149, credits: 300, freeOnly: false },
  growth: { id: "growth", amountInr: 299, credits: 800, freeOnly: false },
  vip: { id: "vip", amountInr: 599, credits: 1500, freeOnly: false },
};

export function isTopupId(value: unknown): value is TopupId {
  return typeof value === "string" && (TOPUP_IDS as readonly string[]).includes(value);
}