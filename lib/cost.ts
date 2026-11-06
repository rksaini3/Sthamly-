import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// migration 0005_cost_events.sql के step values से मेल खाते हैं
export const COST_STEPS = [
  "caption",
  "poster_base",
  "reel",
  "voice",
  "whatsapp",
  "other",
] as const;
export type CostStep = (typeof COST_STEPS)[number];

export interface CostEvent {
  jobId?: string | null; // WhatsApp जैसी सेवाओं के लिए job नहीं होता
  step: CostStep;
  provider: string;
  model?: string | null;
  costPaise: number; // paise में, पूर्णांक
  meta?: Json; // DB का jsonb टाइप
}

function assertValid(event: CostEvent): void {
  if (!Number.isInteger(event.costPaise) || event.costPaise < 0) {
    throw new Error(`invalid costPaise for ${event.step}: ${event.costPaise}`);
  }
  if (!COST_STEPS.includes(event.step)) {
    throw new Error(`invalid cost step: ${event.step}`);
  }
}

/**
 * एक या कई लागत entries एक साथ लिखें (एक insert, कम round-trip)।
 */
export async function logCosts(events: CostEvent[]): Promise<void> {
  if (events.length === 0) return;
  events.forEach(assertValid);

  const admin = createSupabaseAdminClient();
  const rows = events.map((event) => ({
    job_id: event.jobId ?? null,
    step: event.step,
    provider: event.provider,
    model: event.model ?? null,
    cost_paise: event.costPaise,
    meta: event.meta ?? {},
  }));

  const { error } = await admin.from("cost_events").insert(rows);
  if (error) throw error;
}

/** एक entry लिखें। */
export function logCost(event: CostEvent): Promise<void> {
  return logCosts([event]);
}

/** किसी job पर अभी तक की कुल लागत (paise में)। */
export async function getJobCostPaise(jobId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cost_events")
    .select("cost_paise")
    .eq("job_id", jobId);

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.cost_paise, 0);
}

/**
 * क्या job की लागत सीमा (MAX_COST_PAISE_PER_JOB) से ऊपर गई?
 * Worker हर stage के बाद यह जांचेगा और ऊपर जाने पर रुकेगा।
 */
export function isOverJobCap(totalPaise: number): boolean {
  const { MAX_COST_PAISE_PER_JOB } = getServerEnv();
  return totalPaise > MAX_COST_PAISE_PER_JOB;
}