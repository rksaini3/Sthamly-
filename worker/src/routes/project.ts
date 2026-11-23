// Sthamly AI Worker: orchestrator ke kaam (Blueprint 4.0). Do raaste:
//  1. runProjectNow (chat se): planner ke sab kaam ek hi request mein ek-ek karke chalte hain, nateeja usi jawab mein jaata hai.
//  2. /api/project (step-by-step): POST plan banata hai, POST /:id/next ek kaam chalata hai, GET sthiti dikhata hai.
// Kaam ki file /api/create wale produce() se banti hai, isliye download bhi /api/create/:id/url se hota hai.
// Har kaam par wahi daily limit, budget aur usage rules lagte hain jo /api/create par lagte hain.
// Kaam fail ho to baaki kaam ruk jaate hain (pending rehte hain), aur /next se wahin se chal sakte hain.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { ProviderError } from "../providers/types";
import { cleanPrompt, cleanTitle, type CreateKind } from "../creators";
import { estimatePlanCostInr, planProject, type Plan } from "../orchestrator/planner";
import {
  COST_INR,
  budgetFeatureFor,
  countToday,
  insertPending,
  markFailed,
  markReady,
  planLimits,
  produce,
  recordUsage,
} from "./create";
import { uploadObject } from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

const BASE_PATH = "/api/project";
const ITEM_PATH_RE = /^\/api\/project\/([0-9a-f-]{36})$/i;
const NEXT_PATH_RE = /^\/api\/project\/([0-9a-f-]{36})\/next$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY_BYTES = 16 * 1024;
// Ek project ka adhiktam anumaanit kharcha (rupees). Isse zyada ho to plan chhota karna hoga.
const PROJECT_MAX_COST_INR = 20;
// "chal raha" kaam itne samay baad dobara liya ja sakta hai (Worker crash hone par atke nahi).
const STALE_STEP_MS = 10 * 60 * 1000;
const STEP_TITLE_CHARS = 40;

type ProjectStatus = "planned" | "running" | "done" | "failed";
type StepStatus = "pending" | "running" | "ready" | "failed";

interface ProjectRow {
  id: string;
  user_id: string;
  prompt: string;
  status: ProjectStatus;
  estimated_cost_inr: number;
  spent_cost_inr: number;
  created_at: string;
}

interface StepRow {
  id: string;
  project_id: string;
  user_id: string;
  idx: number;
  kind: CreateKind;
  prompt: string;
  status: StepStatus;
  file_id: string | null;
  error_code: string | null;
  attempts: number;
  started_at: string | null;
}

// Ek kaam ka nateeja. Chat ka jawab isi se banta hai.
export interface StepOutcome {
  idx: number;
  kind: CreateKind;
  title: string;
  status: "ready" | "failed";
  fileId: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  costInr: number;
  errorCode: string | null;
}

export interface ProjectRun {
  projectId: string;
  status: ProjectStatus;
  outcomes: StepOutcome[];
}

function invalid(message?: string): ApiError {
  return new ApiError("invalid_request", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readPrompt(request: Request): Promise<string> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw invalid();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("अनुरोध बहुत बड़ा है।");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || typeof parsed.prompt !== "string") {
    throw invalid("बताएँ कि क्या बनवाना है।");
  }
  return parsed.prompt;
}

function toProjectView(p: ProjectRow) {
  return {
    id: p.id,
    prompt: p.prompt,
    status: p.status,
    estimated_cost_inr: Number(p.estimated_cost_inr),
    spent_cost_inr: Number(p.spent_cost_inr),
    created_at: p.created_at,
  };
}

function toStepView(s: StepRow) {
  return {
    id: s.id,
    idx: s.idx,
    kind: s.kind,
    prompt: s.prompt,
    status: s.status,
    file_id: s.file_id,
    error_code: s.error_code,
    attempts: s.attempts,
  };
}

function stateResponse(project: ProjectRow, steps: StepRow[], extra: Record<string, unknown> = {}): Response {
  return json({ project: toProjectView(project), steps: steps.map(toStepView), ...extra });
}

function errorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof ProviderError) return "provider_unavailable";
  return "internal";
}

function stepTitle(prompt: string, idx: number): string {
  const head = Array.from(prompt).slice(0, STEP_TITLE_CHARS).join("");
  return cleanTitle(null, `${head} – चरण ${idx + 1}`);
}

async function loadOwnedProject(db: SupabaseClient, userId: string, projectId: string): Promise<ProjectRow> {
  const rows = await db.select<ProjectRow>("projects", `id=eq.${projectId}&user_id=eq.${userId}&select=*`);
  const row = rows[0];
  if (!row) throw invalid("प्रोजेक्ट नहीं मिला।");
  return row;
}

async function loadSteps(db: SupabaseClient, projectId: string): Promise<StepRow[]> {
  return db.select<StepRow>("project_steps", `project_id=eq.${projectId}&select=*&order=idx.asc`);
}

// Wahi daily limit jo /api/create par hai: image ki alag, baaki kaam ki alag ginti.
async function assertDailyRoom(db: SupabaseClient, ctx: UserContext, kind: CreateKind): Promise<void> {
  const limits = await planLimits(db, ctx.plan.plan);
  const isImage = kind === "image";
  const used = isImage
    ? await countToday(db, "user_images_today", ctx.userId)
    : await countToday(db, "user_creations_today", ctx.userId);
  const limit = isImage ? limits.dailyImages : limits.dailyCreations;
  if (used >= limit) {
    throw new ApiError("budget_exceeded", "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।");
  }
}

// Kaam tab chalane layak hai: pending, fail hua, ya bahut der se "chal raha" (atka hua).
function isRunnable(step: StepRow, nowMs: number): boolean {
  if (step.status === "pending" || step.status === "failed") return true;
  if (step.status === "running" && step.started_at !== null) {
    return nowMs - Date.parse(step.started_at) > STALE_STEP_MS;
  }
  return false;
}

function assertAffordable(plan: Plan): number {
  const estimate = estimatePlanCostInr(plan.steps);
  if (estimate > PROJECT_MAX_COST_INR) {
    throw invalid("यह काम बहुत बड़ा है। विवरण छोटा करके दोबारा कोशिश करें।");
  }
  return estimate;
}

// Project aur uske steps ek saath save karta hai. Steps idx ke order mein lautate hain.
async function insertProject(
  db: SupabaseClient,
  userId: string,
  prompt: string,
  plan: Plan,
  estimate: number,
): Promise<{ project: ProjectRow; steps: StepRow[] }> {
  const projectRows = await db.insert<ProjectRow>("projects", {
    user_id: userId,
    prompt,
    status: "planned",
    estimated_cost_inr: Number(estimate.toFixed(2)),
    spent_cost_inr: 0,
  });
  const project = projectRows[0];
  if (!project) throw new ApiError("internal");

  const stepRows = await db.insert<StepRow>(
    "project_steps",
    plan.steps.map((s, idx) => ({
      project_id: project.id,
      user_id: userId,
      idx,
      kind: s.kind,
      prompt: s.prompt,
      status: "pending",
      attempts: 0,
    })),
  );
  return { project, steps: [...stepRows].sort((a, b) => a.idx - b.idx) };
}

// Kaam ko "chal raha" pakka karta hai. Sirf ek request ise le sakti hai (dono ek saath na chalein).
async function claimStep(db: SupabaseClient, step: StepRow, nowMs: number): Promise<void> {
  const staleIso = new Date(nowMs - STALE_STEP_MS).toISOString();
  const claimed = await db.update<StepRow>(
    "project_steps",
    `id=eq.${step.id}&or=(status.in.(pending,failed),and(status.eq.running,started_at.lt.${encodeURIComponent(staleIso)}))`,
    {
      status: "running",
      attempts: step.attempts + 1,
      started_at: new Date(nowMs).toISOString(),
      error_code: null,
    },
  );
  if (claimed.length === 0) {
    throw invalid("यह कदम अभी चल रहा है। थोड़ी देर बाद देखें।");
  }
}

// Ek kaam chalata hai: limit aur budget dekhta hai, file banati hai, store karti hai.
// Limit ya budget ka error throw hota hai (kaam claim nahi hota). Provider ka error "failed" nateeja banta hai.
async function executeStep(
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  project: ProjectRow,
  step: StepRow,
  signal: AbortSignal,
  execCtx: ExecutionContext,
): Promise<StepOutcome> {
  await assertDailyRoom(db, ctx, step.kind);
  await assertBudget(env, db, config, {
    feature: budgetFeatureFor(step.kind),
    isFreePlan: ctx.plan.plan === "free",
  });

  await claimStep(db, step, Date.now());
  await db.update("projects", `id=eq.${project.id}`, { status: "running" });

  const title = stepTitle(project.prompt, step.idx);
  const requestId = `${ctx.userId}:project:${project.id}:${step.idx}:${step.attempts + 1}`;
  const row = await insertPending(db, ctx.userId, step.kind, title, requestId);

  try {
    const produced = await produce(step.kind, env, config, step.prompt, signal);
    const stored = await uploadObject(env, {
      userId: ctx.userId,
      fileId: row.id,
      mimeType: produced.mimeType,
      bytes: produced.bytes,
    });
    await markReady(db, row.id, stored.path, stored.mimeType, stored.sizeBytes);
    await db.update("project_steps", `id=eq.${step.id}`, { status: "ready", file_id: row.id });

    execCtx.waitUntil(
      recordUsage(db, {
        userId: ctx.userId,
        requestId,
        kind: step.kind,
        model: produced.model,
        inputTokens: produced.inputTokens,
        outputTokens: produced.outputTokens,
        costInr: produced.costInr,
      }).catch(() => {
        console.error(JSON.stringify({ event: "project_usage_write_failed" }));
      }),
    );

    return {
      idx: step.idx,
      kind: step.kind,
      title,
      status: "ready",
      fileId: row.id,
      storagePath: stored.path,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      costInr: produced.costInr,
      errorCode: null,
    };
  } catch (err) {
    await markFailed(db, row.id);
    const code = errorCode(err);
    await db.update("project_steps", `id=eq.${step.id}`, { status: "failed", error_code: code });
    return {
      idx: step.idx,
      kind: step.kind,
      title,
      status: "failed",
      fileId: null,
      storagePath: null,
      mimeType: null,
      sizeBytes: null,
      costInr: 0,
      errorCode: code,
    };
  }
}

// Chat ke liye: plan ke sab kaam ek-ek karke chalte hain. Pehla fail kaam ruk jaata hai.
// Limit ya budget ki wajah se ruka kaam bhi "failed" nateeja banta hai, taaki jo ban chuka wo user ko dikhe.
export async function runProjectNow(
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  prompt: string,
  plan: Plan,
  signal: AbortSignal,
  execCtx: ExecutionContext,
): Promise<ProjectRun> {
  const clean = cleanPrompt(prompt);
  const estimate = assertAffordable(plan);
  const { project, steps } = await insertProject(db, ctx.userId, clean, plan, estimate);

  await db.update("projects", `id=eq.${project.id}`, { status: "running" });

  const outcomes: StepOutcome[] = [];
  let spent = 0;
  let failed = false;

  for (const step of steps) {
    if (signal.aborted) {
      failed = true;
      break;
    }
    let outcome: StepOutcome;
    try {
      outcome = await executeStep(env, config, db, ctx, project, step, signal, execCtx);
    } catch (err) {
      // Limit ya budget ka error: is kaam ko "failed" dikhao, aur baaki ruk jaayein.
      outcome = {
        idx: step.idx,
        kind: step.kind,
        title: stepTitle(project.prompt, step.idx),
        status: "failed",
        fileId: null,
        storagePath: null,
        mimeType: null,
        sizeBytes: null,
        costInr: 0,
        errorCode: errorCode(err),
      };
    }
    outcomes.push(outcome);
    spent += outcome.costInr;
    if (outcome.status === "failed") {
      failed = true;
      break;
    }
  }

  const status: ProjectStatus = failed || outcomes.length < steps.length ? "failed" : "done";
  await db.update("projects", `id=eq.${project.id}`, {
    spent_cost_inr: Number((Number(project.spent_cost_inr) + spent).toFixed(2)),
    status,
  });

  return { projectId: project.id, status, outcomes };
}

// POST /api/project: sirf plan banao aur save karo. Yahan file nahi banti.
async function createProject(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
): Promise<Response> {
  const prompt = cleanPrompt(await readPrompt(request));

  await assertBudget(env, db, config, {
    feature: "document",
    isFreePlan: ctx.plan.plan === "free",
  });

  let planned: Awaited<ReturnType<typeof planProject>>;
  try {
    planned = await planProject(env, prompt, request.signal);
  } catch (err) {
    if (err instanceof ProviderError) throw new ApiError("provider_unavailable");
    throw err;
  }
  if (planned.plan.route !== "create") {
    throw invalid("यह अनुरोध किसी फ़ाइल के लिए नहीं लगता। चैट में सवाल पूछें।");
  }

  await db
    .insert(
      "usage_logs",
      {
        user_id: ctx.userId,
        request_id: `${ctx.userId}:project_plan:${crypto.randomUUID()}`,
        feature: "project_plan",
        provider: "groq",
        model: planned.model,
        input_tokens: planned.inputTokens,
        output_tokens: planned.outputTokens,
        estimated_cost_inr: Number(COST_INR.document.toFixed(4)),
      },
      { onConflict: "request_id", conflict: "ignore" },
    )
    .catch(() => undefined);

  const estimate = assertAffordable(planned.plan);
  const { project, steps } = await insertProject(db, ctx.userId, prompt, planned.plan, estimate);
  return stateResponse(project, steps);
}

// GET /api/project/:id: sthiti.
async function getProject(db: SupabaseClient, userId: string, projectId: string): Promise<Response> {
  const project = await loadOwnedProject(db, userId, projectId);
  const steps = await loadSteps(db, project.id);
  return stateResponse(project, steps);
}

// POST /api/project/:id/next: agla kaam ek baar chalao. Fail kaam ko dobara chalane ke liye bhi yahi.
async function runNextStep(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
  projectId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  const project = await loadOwnedProject(db, ctx.userId, projectId);
  const steps = await loadSteps(db, project.id);

  if (project.status === "done") return stateResponse(project, steps);

  const step = steps.find((s) => isRunnable(s, Date.now()));
  if (!step) {
    await db.update("projects", `id=eq.${project.id}`, { status: "done" });
    return stateResponse({ ...project, status: "done" }, steps);
  }

  const outcome = await executeStep(env, config, db, ctx, project, step, request.signal, execCtx);

  const spent = Number((Number(project.spent_cost_inr) + outcome.costInr).toFixed(2));
  const fresh = await loadSteps(db, project.id);
  const nextStatus: ProjectStatus =
    outcome.status === "failed" ? "failed" : fresh.every((s) => s.status === "ready") ? "done" : "running";
  await db.update("projects", `id=eq.${project.id}`, { spent_cost_inr: spent, status: nextStatus });

  const extra =
    outcome.status === "ready"
      ? { completed_step_idx: step.idx, file_id: outcome.fileId }
      : { failed_step_idx: step.idx, error_code: outcome.errorCode };
  return stateResponse({ ...project, spent_cost_inr: spent, status: nextStatus }, fresh, extra);
}

export async function handleProject(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    const config = loadConfig(env);
    assertSecretsPresent(env);

    const user = await authenticate(request, env);
    const db = createSupabase(env);
    const ctx = await loadUserContext(db, user);

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === BASE_PATH) {
      if (method === "POST") return await createProject(request, env, config, db, ctx);
      throw invalid();
    }

    const nextMatch = NEXT_PATH_RE.exec(pathname);
    if (nextMatch && nextMatch[1] && method === "POST") {
      const id = nextMatch[1].toLowerCase();
      if (!UUID_RE.test(id)) throw invalid();
      return await runNextStep(request, env, config, db, ctx, id, execCtx);
    }

    const itemMatch = ITEM_PATH_RE.exec(pathname);
    if (itemMatch && itemMatch[1] && method === "GET") {
      const id = itemMatch[1].toLowerCase();
      if (!UUID_RE.test(id)) throw invalid();
      return await getProject(db, user.id, id);
    }

    throw new ApiError("invalid_request", "रास्ता नहीं मिला।");
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event: "project_request_failed", code, request_id: traceId }));
    return toErrorResponse(err, traceId);
  }
}