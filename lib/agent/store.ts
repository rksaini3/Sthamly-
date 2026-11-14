import type { Json } from "@/types/database";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ---- Types ----

export type RunStatus = "running" | "waiting_confirm" | "done" | "failed";
export type ActionStatus = "pending" | "approved" | "rejected" | "done" | "failed" | "expired";

export interface RunStep {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  at: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  threadId: string | null;
  goal: string;
  status: RunStatus;
  steps: RunStep[];
  stepCount: number;
}

export interface AgentAction {
  id: string;
  runId: string;
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: ActionStatus;
  expiresAt: string;
}

// ---- Helpers ----

// app का डेटा (जो JSON-सुरक्षित है) को database के Json type में रखें
function asJson(value: unknown): Json {
  return value as Json;
}

// DB की row (snake_case) को app के रूप (camelCase) में बदलें
function toRun(row: {
  id: string;
  user_id: string;
  thread_id: string | null;
  goal: string;
  status: string;
  steps: unknown;
  step_count: number;
}): AgentRun {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    goal: row.goal,
    status: row.status as RunStatus,
    steps: Array.isArray(row.steps) ? (row.steps as RunStep[]) : [],
    stepCount: row.step_count,
  };
}

function toAction(row: {
  id: string;
  run_id: string;
  user_id: string;
  tool: string;
  args: unknown;
  summary: string;
  status: string;
  expires_at: string;
}): AgentAction {
  return {
    id: row.id,
    runId: row.run_id,
    userId: row.user_id,
    tool: row.tool,
    args: (row.args ?? {}) as Record<string, unknown>,
    summary: row.summary,
    status: row.status as ActionStatus,
    expiresAt: row.expires_at,
  };
}

// ---- Runs ----

/** नया run बनाएं। goal छोटा करके सेव होता है (DB में 1000 अक्षर की सीमा है)। */
export async function createRun(input: {
  userId: string;
  threadId: string | null;
  goal: string;
}): Promise<AgentRun> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_runs")
    .insert({
      user_id: input.userId,
      thread_id: input.threadId,
      goal: input.goal.slice(0, 1000),
      status: "running",
      steps: [],
      step_count: 0,
    })
    .select("id, user_id, thread_id, goal, status, steps, step_count")
    .single();

  if (error || !data) throw new Error(`run create failed: ${error?.message ?? "no row"}`);
  return toRun(data);
}

/** run पढ़ें, सिर्फ़ उसी user का। दूसरे का run मिला तो null। */
export async function getRun(runId: string, userId: string): Promise<AgentRun | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_runs")
    .select("id, user_id, thread_id, goal, status, steps, step_count")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`run read failed: ${error.message}`);
  return data ? toRun(data) : null;
}

/** एक कदम जोड़ें और गिनती बढ़ाएं। */
export async function appendStep(input: {
  runId: string;
  userId: string;
  step: RunStep;
  currentSteps: RunStep[];
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const steps = [...input.currentSteps, input.step].slice(-30);
  const { error } = await admin
    .from("agent_runs")
    .update({
      steps: asJson(steps),
      step_count: steps.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId);

  if (error) throw new Error(`step save failed: ${error.message}`);
}

/** run की स्थिति बदलें (done, failed, waiting_confirm)। */
export async function setRunStatus(input: {
  runId: string;
  userId: string;
  status: RunStatus;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("agent_runs")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.runId)
    .eq("user_id", input.userId);

  if (error) throw new Error(`run status update failed: ${error.message}`);
}

// ---- Actions (मंज़ूरी वाले काम) ----

/** मंज़ूरी का अनुरोध बनाएं। summary user को दिखेगी। */
export async function createAction(input: {
  runId: string;
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}): Promise<AgentAction> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_actions")
    .insert({
      run_id: input.runId,
      user_id: input.userId,
      tool: input.tool,
      args: asJson(input.args),
      summary: input.summary.slice(0, 300),
      status: "pending",
    })
    .select("id, run_id, user_id, tool, args, summary, status, expires_at")
    .single();

  if (error || !data) throw new Error(`action create failed: ${error?.message ?? "no row"}`);
  return toAction(data);
}

/** action पढ़ें, सिर्फ़ उसी user का। */
export async function getAction(actionId: string, userId: string): Promise<AgentAction | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_actions")
    .select("id, run_id, user_id, tool, args, summary, status, expires_at")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`action read failed: ${error.message}`);
  return data ? toAction(data) : null;
}

/**
 * action की स्थिति बदलें, लेकिन सिर्फ़ तभी जब वो अभी भी pending हो।
 * यही दो बार क्लिक (double approve) को रोकता है: दूसरी बार 0 rows मिलेंगी।
 */
export async function moveAction(input: {
  actionId: string;
  userId: string;
  from: "pending";
  to: ActionStatus;
  result?: Record<string, unknown>;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_actions")
    .update({
      status: input.to,
      result: input.result ? asJson(input.result) : null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.actionId)
    .eq("user_id", input.userId)
    .eq("status", input.from)
    .select("id");

  if (error) throw new Error(`action update failed: ${error.message}`);
  return (data ?? []).length === 1;
}

/** किसी run के सारे pending actions (जो अभी मंज़ूरी के इंतज़ार में हैं)। */
export async function pendingActionsForRun(runId: string, userId: string): Promise<AgentAction[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agent_actions")
    .select("id, run_id, user_id, tool, args, summary, status, expires_at")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error) throw new Error(`pending read failed: ${error.message}`);
  return (data ?? []).map(toAction);
}

/** समय सीमा निकल चुके pending actions को expired करें (हर नए run से पहले)। */
export async function expireOldActions(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("agent_actions")
    .update({ status: "expired", decided_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  if (error) throw new Error(`expire failed: ${error.message}`);
}