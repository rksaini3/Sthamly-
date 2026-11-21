// Sthamly AI Worker: project orchestrator (Blueprint 4.0). Ek request, kai kaam (image, slides, website, document).
// POST /api/project              plan banao (body: { prompt }). Is call mein file nahi banti, sirf plan save hota hai.
// GET  /api/project/:id          project aur uske steps ki sthiti
// POST /api/project/:id/next     agla kaam chalao (ek call = ek kaam). Fail kaam ko dobara chalane ke liye bhi yahi.
// Sirf login user. Har kaam par wahi daily limit, budget aur usage rules lagte hain jo /api/create par lagte hain.
// Kaam ek-ek karke chalte hain, taaki Worker ka time limit न टूटे और user har kaam ki sthiti dekhe.
// Kaam ki file /api/create wale raste se hi banti hai (produce), isliye download bhi /api/create/:id/url se hota hai.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { loadUserContext, type UserContext } from "../plan";
import { ProviderError } from "../providers/types";
import { cleanPrompt, cleanTitle, type CreateKind } from "../creators";
import { estimatePlanCostInr, planProject } from "../orchestrator/planner";
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
// एक project का अधिकतम अनुमानित खर्च (rupees). इससे ज़्यादा हो तो plan छोटा करना होगा।
const PROJECT_MAX_COST_INR = 20;
// "चल रहा" कदम इतने समय बाद दोबारा लिया जा सकता है (Worker crash होने पर अटके नहीं)।
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

async function loadOwnedProject(db: SupabaseClient, userId: string, projectId: string): Promise<ProjectRow> {
  const rows = await db.select<ProjectRow>(
    "projects",
    `id=eq.${projectId}&user_id=eq.${userId}&select=*`,
  );
  const row = rows[0];
  if (!row) throw invalid("प्रोजेक्ट नहीं मिला।");
  return row;
}

async function loadSteps(db: SupabaseClient, projectId: string): Promise<StepRow[]> {
  return db.select<StepRow>("project_steps", `project_id=eq.${projectId}&select=*&order=idx.asc`);
}

// वही daily limit जो /api/create पर है: image की अलग, बाकी की अलग गिनती।
async function assertDailyRoom(db: SupabaseClient, ctx: UserContext, kind: CreateKind): Promise<void> {
  const limits = await planLimits(db, ctx.plan.plan);
  const isImage = kind === "image";
  const used = isImage
    ? await countToday(db, "user_images_today", ctx.userId)
    : await countToday(db, "user_creations_today", ctx.userId);
  const limit = isImage ? limits.dailyImages : limits.dailyCreations;
  if (used >= limit) {
    throw new ApiError(
      "budget_exceeded",
      "आज की सीमा पूरी हो गई। कल फिर कोशिश करें या प्लान बदलें।",
    );
  }
}

// कदम तब चलाने लायक है: pending, या fail हुआ, या बहुत देर से "चल रहा" (अटका हुआ)।
function isRunnable(step: StepRow, nowMs: number): boolean {
  if (step.status === "pending" || step.status === "failed") return true;
  if (step.status === "running" && step.started_at !== null) {
    return nowMs - Date.parse(step.started_at) > STALE_STEP_MS;
  }
  return false;
}

// POST /api/project: plan banao, save karo. Yahan file nahi banti.
async function createProject(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  ctx: UserContext,
): Promise<Response> {
  const prompt = cleanPrompt(await readPrompt(request));

  // Planning mein text model lagta hai, isliye budget dekh lo.
  await assertBudget(env, db, config, {
    feature: "document",
    isFreePlan: ctx.plan.plan === "free",
  });

  const planned = await planProject(env, prompt, request.signal);

  await db
    .insert(
      "usage_logs",
      {
        user_id: ctx.userId,
        request_id: `${ctx.userId}:project_plan:${crypto.randomUUID()}`,
        feature: "project_plan",
        provider: "gemini",
        model: planned.model,
        input_tokens: planned.inputTokens,
        output_tokens: planned.outputTokens,
        estimated_cost_inr: Number(COST_INR.document.toFixed(4)),
      },
      { onConflict: "request_id", conflict: "ignore" },
    )
    .catch(() => undefined);

  const estimate = estimatePlanCostInr(planned.plan.steps);
  if (estimate > PROJECT_MAX_COST_INR) {
    throw invalid("यह काम बहुत बड़ा है। विवरण छोटा करके दोबारा कोशिश करें।");
  }

  const projectRows = await db.insert<ProjectRow>("projects", {
    user_id: ctx.userId,
    prompt,
    status: "planned",
    estimated_cost_inr: Number(estimate.toFixed(2)),
    spent_cost_inr: 0,
  });
  const project = projectRows[0];
  if (!project) throw new ApiError("internal");

  const stepRows = await db.insert<StepRow>(
    "project_steps",
    planned.plan.steps.map((s, idx) => ({
      project_id: project.id,
      user_id: ctx.userId,
      idx,
      kind: s.kind,
      prompt: s.prompt,
      status: "pending",
      attempts: 0,
    })),
  );

  return stateResponse(project, stepRows, {});
}

// GET /api/project/:id: sthiti.
async function getProject(db: SupabaseClient, userId: string, projectId: string): Promise<Response> {
  const project = await loadOwnedProject(db, userId, projectId);
  const steps = await loadSteps(db, project.id);
  return stateResponse(project, steps);
}

// POST /api/project/:id/next: agla kaam ek baar chalao.
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

  const nowMs = Date.now();
  const step = steps.find((s) => isRunnable(s, nowMs));
  if (!step) {
    // Sab kaam ready hain: project poora.
    const done = { ...project, status: "done" as const };
    await db.update("projects", `id=eq.${project.id}`, { status: "done" });
    return stateResponse(done, steps);
  }

  // Wahi limit aur budget jo /api/create par hai, har kaam se pehle.
  await assertDailyRoom(db, ctx, step.kind);
  await assertBudget(env, db, config, {
    feature: budgetFeatureFor(step.kind),
    isFreePlan: ctx.plan.plan === "free",
  });

  // Kaam pakka karo: sirf ek request ise le sakti hai (दोनों एक साथ न चलें).
  const attempt = step.attempts + 1;
  const staleIso = new Date(nowMs - STALE_STEP_MS).toISOString();
  const claimed = await db.update<StepRow>(
    "project_steps",
    `id=eq.${step.id}&or=(status.in.(pending,failed),and(status.eq.running,started_at.lt.${encodeURIComponent(staleIso)}))`,
    { status: "running", attempts: attempt, started_at: new Date(nowMs).toISOString(), error_code: null },
  );
  if (claimed.length === 0) {
    throw invalid("यह कदम अभी चल रहा है। थोड़ी देर बाद देखें।");
  }
  await db.update("projects", `id=eq.${project.id}`, { status: "running" });

  const title = cleanTitle(null, `${Array.from(project.prompt).slice(0, STEP_TITLE_CHARS).join("")} – चरण ${step.idx + 1}`);
  const requestId = `${ctx.userId}:project:${project.id}:${step.idx}:${attempt}`;
  const row = await insertPending(db, ctx.userId, step.kind, title, requestId);

  try {
    const produced = await produce(step.kind, env, config, step.prompt, request.signal);

    const stored = await uploadObject(env, {
      userId: ctx.userId,
      fileId: row.id,
      mimeType: produced.mimeType,
      bytes: produced.bytes,
    });
    await markReady(db, row.id, stored.path, stored.mimeType, stored.sizeBytes);
    await db.update("project_steps", `id=eq.${step.id}`, { status: "ready", file_id: row.id });

    const spent = Number(project.spent_cost_inr) + produced.costInr;
    const allReady = steps.every((s) => s.id === step.id || s.status === "ready");
    const nextStatus: ProjectStatus = allReady ? "done" : "running";
    await db.update("projects", `id=eq.${project.id}`, {
      spent_cost_inr: Number(spent.toFixed(2)),
      status: nextStatus,
    });

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

    const fresh = await loadSteps(db, project.id);
    return stateResponse(
      { ...project, spent_cost_inr: Number(spent.toFixed(2)), status: nextStatus },
      fresh,
      { completed_step_idx: step.idx, file_id: row.id },
    );
  } catch (err) {
    await markFailed(db, row.id);
    const code =
      err instanceof ApiError ? err.code : err instanceof ProviderError ? "provider_unavailable" : "internal";
    await db.update("project_steps", `id=eq.${step.id}`, { status: "failed", error_code: code });
    await db.update("projects", `id=eq.${project.id}`, { status: "failed" });

    const fresh = await loadSteps(db, project.id);
    return stateResponse({ ...project, status: "failed" }, fresh, {
      failed_step_idx: step.idx,
      error_code: code,
    });
  }
}

export async function handleProject(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
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