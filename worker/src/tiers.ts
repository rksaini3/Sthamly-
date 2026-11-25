// Sthamly AI Worker: plan ke tier, ek hi jagah.
// Database mein plan ka naam: free, plus, pro, super. Basic plan database mein 'plus' hi hai (pehle se wahi hai).
// PLAN_ORDER se hi plan check (plan.ts) aur model routing (router.ts) chalte hain. Naya plan yahin jodein.

export const PLAN_ORDER: readonly string[] = ["free", "plus", "pro", "super"];

// Kharidne wale tier. Naam app aur Razorpay ke beech ek hi jagah tay hota hai.
export const PAID_TIERS = ["basic", "pro", "super"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

// Tier -> database plan naam.
export const TIER_TO_DB_PLAN: Record<PaidTier, string> = {
  basic: "plus",
  pro: "pro",
  super: "super",
};

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && (PAID_TIERS as readonly string[]).includes(value);
}

// Plan ka rank. Ajnaat naam par -1.
export function planRank(plan: string): number {
  return PLAN_ORDER.indexOf(plan);
}