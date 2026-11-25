// Sthamly AI Worker: POST /api/ai/chat (Blueprint 3.0, section 6 aur 7, guest mode)
// Do tarah ke caller:
//  - Logged-in user (Authorization token): history DB mein, usage ek baar, quota aur budget.
//  - Guest (token nahi, X-Guest-Id header): din ke limited messages (guest.ts). Chat DB mein save nahi.
//    Guest ki history client bhejta hai, aur wo sirf is request ke liye use hoti hai.
// Order: body validate -> caller pehchan -> limit aur quota -> budget -> model chunav -> stream.
// Provider ka error pehle JSON mein jaata hai, stream tab shuru hoti hai jab reply aane lage.
// Tool loop Phase 3 mein aayega.

import { detectAutoRole } from "../providers/intent";
import { getBearerToken, verifySupabaseUser, type AuthUser } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Config, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { identifyGuest, reserveGuestMessage, type GuestIdentity } from "../guest";
import { assertWithinDailyQuota, loadUserContext, type UserContext } from "../plan";
import { planProject, type Plan } from "../orchestrator/planner";
import { runProjectNow, type StepOutcome } from "./project";
import { CREATE_TEXT_MODEL, type CreateKind } from "../creators";
import { routeChat } from "../providers/router";
import { estimateCostInr, type ChatMessage } from "../providers/types";
import { createSseResponse } from "../sse";
import { signedDownloadUrl } from "../storage";
import { createSupabase, type SupabaseClient } from "../supabase";

// ---- Limits ----
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ITEMS = 20;
const TITLE_CHARS = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;

// USD se INR. Open decision (blueprint 13). Baad mein config variable mein jaayega.
const USD_TO_INR = 85;

// Guest ka plan free jaisa hai. Guest ko login wale plan ke fayde nahi milte.
const GUEST_PLAN = "free";
const GUEST_MAX_OUTPUT_TOKENS = 1024;
const GUEST_LANGUAGE: UserContext["language"] = "hi";

// Server-side system prompt. Client ise nahi bhej sakta.
const SYSTEM_PROMPTS: Record<UserContext["language"], string> = {
  hi: "आप Sthamly AI हैं, छोटे दुकानदारों और उद्यमियों के लिए एक सहायक। सरल हिंदी में, छोटे और साफ़ जवाब दें। जो न पता हो, साफ़ कहें, अंदाज़ा न लगाएँ।",
  hinglish:
    "You are Sthamly AI, an assistant for small shopkeepers and entrepreneurs. Reply in simple Hinglish (Hindi written in Roman script mixed with English). Keep answers short and clear. If you do not know something, say so; do not guess.",
  en: "You are Sthamly AI, an assistant for small shopkeepers and entrepreneurs. Reply in simple English. Keep answers short and clear. If you do not know something, say so; do not guess.",
};

// Role mode: web ke mode chip se aata hai. Ajnaat value aaye to 'general' maana jaata hai.
export const CHAT_MODES = ["general", "shop", "study", "legal", "creator"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

// Ye batata hai ki app kya-kya bana sakta hai, taaki model khud ko sirf text AI na kahe.
import { fetchLiveAnswer, needsLiveInfo, withLiveContext } from "../providers/web-grounding";

const CAPABILITY_NOTE =
  "Sthamly AI can also create images (posters, logos, product pictures), slides, one-page websites and documents. " +
  "When the user asks for one of these in chat, do not say you cannot make images. Briefly say you will make it, " +
  "and if the details are missing, ask for them in one short line (name, price, colours, language). " +
  "Never describe yourself only as a text-based AI.";

// Har mode ka chhota instruction. Base prompt (bhasha wala) ke baad jodta hai.
// General mode mein kuch nahi jodte, taaki purana behavior waisa hi rahe.
const MODE_HINTS: Record<ChatMode, string | null> = {
  general: null,
  shop:
    "The user is a small shopkeeper. Give practical, short answers for running a shop: offers, WhatsApp messages, simple bills, credit (udhaar) reminders. Keep wording polite and easy to copy-paste.",
  study:
    "The user is a student. Explain step by step in very simple words, with a short example. For quizzes, give MCQs with the correct answer and a one-line reason. Do not write long essays unless asked.",
  legal:
    "The user needs help with legal paperwork (notices, applications, complaint letters). Give a clear draft or explanation. Always end with a one-line note that this is not legal advice and the user should consult a lawyer before acting. Cite a law or section only if you are sure of it; otherwise say you are not sure.",
  creator:
    "The user is a content creator. Give short hooks, captions, hashtags as suggestions (not trend claims), thumbnail text and short video scripts (hook, main part, call to action). Keep it energetic and easy to read.",
};

interface ChatBody {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
  mode: ChatMode;
}

type Caller =
  | { kind: "user"; user: AuthUser }
  | { kind: "guest"; guest: GuestIdentity };

// Sirf logged-in user ke liye: usage darj karna aur (history on ho to) conversation save karna.
interface OwnerContext {
  userId: string;
  usageRequestId: string;
  // History on ho to conversation id lautata hai (naya ho to banata hai). Band ho to null.
  resolveConversation: () => Promise<string | null>;
}

interface ChatRun {
  env: Env;
  config: Config;
  db: SupabaseClient;
  execCtx: ExecutionContext;
  request: Request;
  traceId: string;
  userMessage: string;
  messages: ChatMessage[];
  inputEstimate: number;
  planName: string;
  maxOutputTokens: number;
  hindi: boolean;
  isFreePlan: boolean;
  owner: OwnerContext | null;
}

function invalid(message?: string): ApiError {
  return new ApiError("invalid_request", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Rough token estimate (Hindi aur English dono ke liye). Sirf quota aur fallback ke liye.
function approxTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function buildMessages(
  language: UserContext["language"],
  mode: ChatMode,
  prior: ChatMessage[],
  message: string,
): ChatMessage[] {
  const hint = MODE_HINTS[mode];
  const base = `${SYSTEM_PROMPTS[language]}\n\n${CAPABILITY_NOTE}`;
  const system = hint === null ? base : `${base}\n\n${hint}`;
  return [
    { role: "system", content: system },
    ...prior,
    { role: "user", content: message },
  ];
}

function estimateInput(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + approxTokens(m.content), 0);
}

// Request body validate karta hai. Galat shape par 'invalid_request'.
async function parseBody(request: Request): Promise<ChatBody> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw invalid();
  }

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
  if (!isRecord(parsed)) throw invalid();

  const messageRaw = parsed.message;
  if (typeof messageRaw !== "string") throw invalid();
  const message = messageRaw.trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_CHARS) {
    throw invalid(`संदेश 1 से ${MAX_MESSAGE_CHARS} अक्षर के बीच होना चाहिए।`);
  }

  let conversationId: string | null = null;
  const convRaw = parsed.conversation_id;
  if (convRaw !== undefined && convRaw !== null) {
    if (typeof convRaw !== "string" || !UUID_RE.test(convRaw)) throw invalid();
    conversationId = convRaw.toLowerCase();
  }

  // History: logged-in user ke liye sirf fallback (history on ho to server DB se leta hai).
  // Guest ke liye yahi asli history hai, kyunki guest ki chat server par save nahi hoti.
  const history: ChatMessage[] = [];
  const historyRaw = parsed.history;
  if (historyRaw !== undefined && historyRaw !== null) {
    if (!Array.isArray(historyRaw) || historyRaw.length > MAX_HISTORY_ITEMS) throw invalid();
    for (const item of historyRaw) {
      if (!isRecord(item)) throw invalid();
      const role = item.role;
      const content = item.content;
      if (
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string" ||
        content.length > MAX_MESSAGE_CHARS
      ) {
        throw invalid();
      }
      history.push({ role, content });
    }
  }

  // Mode: na ho ya ajnaat ho to 'general'. Galat type par request galat.
  let mode: ChatMode = "general";
  const modeRaw = parsed.mode;
  if (modeRaw !== undefined && modeRaw !== null) {
    if (typeof modeRaw !== "string" || !(CHAT_MODES as readonly string[]).includes(modeRaw)) {
      throw invalid();
    }
    mode = modeRaw as ChatMode;
  }

  return { message, conversationId, history, mode };
}

// Pehchan: Authorization token ho to user, warna guest. Token galat ho to 'unauthenticated'.
async function resolveCaller(request: Request, env: Env): Promise<Caller> {
  const token = getBearerToken(request);
  if (token !== null) {
    return { kind: "user", user: await verifySupabaseUser(env, token) };
  }
  return { kind: "guest", guest: await identifyGuest(request, env) };
}

// Idempotency-Key header: sahi format ho ya na ho to request galat.
function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null) return null;
  if (!IDEMPOTENCY_RE.test(raw)) throw invalid();
  return raw;
}

// Conversation us user ki hi hai ya nahi. Galat ho to 'nahi mili' (kisi aur ka data nahi dikhta).
async function assertOwnsConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<void> {
  const rows = await db.select<{ id: string }>(
    "conversations",
    `id=eq.${conversationId}&user_id=eq.${userId}&select=id`,
  );
  if (rows.length === 0) throw invalid("बातचीत नहीं मिली।");
}

// Pichhle messages DB se, purane se naye ke order mein.
async function loadStoredHistory(
  db: SupabaseClient,
  conversationId: string,
): Promise<ChatMessage[]> {
  const rows = await db.select<{ role: "user" | "assistant"; content: string }>(
    "messages",
    `conversation_id=eq.${conversationId}&select=role,content&order=created_at.desc,role.asc&limit=${MAX_HISTORY_ITEMS}`,
  );
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

// Nayi conversation. Title pehle message se, 40 characters tak.
async function createConversation(
  db: SupabaseClient,
  userId: string,
  firstMessage: string,
): Promise<string> {
  const title = Array.from(firstMessage).slice(0, TITLE_CHARS).join("");
  const rows = await db.insert<{ id: string }>("conversations", {
    user_id: userId,
    title,
  });
  const row = rows[0];
  if (!row) throw new ApiError("internal");
  return row.id;
}

// Is request ka usage pehle se darj hai ya nahi (double charge se bachne ke liye).
async function usageExists(db: SupabaseClient, usageRequestId: string): Promise<boolean> {
  const rows = await db.select<{ request_id: string }>(
    "usage_logs",
    `request_id=eq.${encodeURIComponent(usageRequestId)}&select=request_id&limit=1`,
  );
  return rows.length > 0;
}

interface UsageRecord {
  userId: string;
  usageRequestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costInr: number;
}

// Usage ek hi baar: request_id unique hai, duplicate ko ignore karta hai.
async function recordUsage(db: SupabaseClient, u: UsageRecord): Promise<void> {
  await db.insert(
    "usage_logs",
    {
      user_id: u.userId,
      request_id: u.usageRequestId,
      feature: "chat",
      provider: u.provider,
      model: u.model,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      estimated_cost_inr: Number(u.costInr.toFixed(4)),
    },
    { onConflict: "request_id", conflict: "ignore" },
  );
}

// User ka sawal aur AI ka jawab dono save hote hain, sirf tab jab reply poori aayi ho.
async function saveTurn(
  db: SupabaseClient,
  p: {
    conversationId: string;
    traceId: string;
    userMessage: string;
    reply: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    finishReason: string;
  },
): Promise<void> {
  // PostgREST bulk insert mein sab objects ke keys ek jaise hone chahiye (warna poora insert rad hota hai).
  // Isliye user row mein bhi wahi keys hain, khaali values ke saath.
  await db.insert("messages", [
    {
      conversation_id: p.conversationId,
      role: "user",
      content: p.userMessage,
      provider: null,
      model: null,
      input_tokens: 0,
      output_tokens: 0,
      finish_reason: null,
      request_id: p.traceId,
    },
    {
      conversation_id: p.conversationId,
      role: "assistant",
      content: p.reply,
      provider: p.provider,
      model: p.model,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      finish_reason: p.finishReason,
      request_id: p.traceId,
    },
  ]);
  await db.update("conversations", `id=eq.${p.conversationId}`, {
    updated_at: new Date().toISOString(),
  });
}

// Log mein sirf event, code aur request id. Message, prompt ya token kabhi nahi.
function logFailure(event: string, requestId: string): (err: unknown) => void {
  return (err: unknown): void => {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event, code, request_id: requestId }));
  };
}

// Model chalata hai aur stream karta hai. Dono tarah ke callers ke liye ek hi jagah.
async function runChat(run: ChatRun): Promise<Response> {
  const { env, config, db, execCtx, request, traceId, messages, inputEstimate } = run;
  const owner = run.owner;

  // 4. Budget (100% par free users band). Chat ke liye cheap model bhi yahin tay hota hai.
  const budget = await assertBudget(env, db, config, {
    feature: "chat",
    isFreePlan: run.isFreePlan,
  });

  // Nayi conversation: provider call se pehle bana do, taaki reply ka sahi id mile.
  const conversationId = owner ? await owner.resolveConversation() : null;

  // 5. Model chunav. Yahin provider ka pehla chunk tak wait hota hai.
  const routed = await routeChat(env, db, {
    planName: run.planName,
    budget,
    hindi: run.hindi,
    preferTier: "standard",
    request: {
      messages,
      maxOutputTokens: run.maxOutputTokens,
      signal: request.signal,
    },
  });

  // 6. Stream
  const response = createSseResponse(async (send) => {
    let reply = "";
    let finishReason: "stop" | "length" | "error" = "stop";
    let providerInput = 0;
    let providerOutput = 0;

    for await (const chunk of routed.stream) {
      if (request.signal.aborted) break;
      if (chunk.type === "text") {
        reply += chunk.text;
        await send({ event: "delta", data: { text: chunk.text } });
      } else {
        finishReason = chunk.finishReason;
        providerInput = chunk.inputTokens;
        providerOutput = chunk.outputTokens;
      }
    }

    // 8. Normalize. Provider ne token na bataye to estimate.
    const inputTokens = providerInput > 0 ? providerInput : inputEstimate;
    const outputTokens = providerOutput > 0 ? providerOutput : approxTokens(reply);
    const costInr = estimateCostInr(routed.entry, inputTokens, outputTokens, USD_TO_INR);
    const aborted = request.signal.aborted;
    // Jitna jawab aaya woh save hota hai, chahe user ne beech mein roka ho (warna reload par sawal aur adhoora jawab dono gaayab).
    // Khaali jawab (koi text nahi) kabhi save nahi hota.
    const saveable = reply.length > 0;

    // 9 aur 10. Sirf logged-in user ka usage aur save. Guest ka kuch darj nahi hota.
    if (owner) {
      const usageWrite = recordUsage(db, {
        userId: owner.userId,
        usageRequestId: owner.usageRequestId,
        provider: routed.provider,
        model: routed.model,
        inputTokens,
        outputTokens,
        costInr,
      }).catch(logFailure("usage_write_failed", traceId));

      const saveWrite =
        saveable && conversationId !== null
          ? saveTurn(db, {
              conversationId,
              traceId,
              userMessage: run.userMessage,
              reply,
              provider: routed.provider,
              model: routed.model,
              inputTokens,
              outputTokens,
              finishReason: aborted ? "stopped" : finishReason,
            }).catch(logFailure("save_turn_failed", traceId))
          : Promise.resolve();

      execCtx.waitUntil(Promise.all([usageWrite, saveWrite]));
    }

    if (aborted) return;

    // Provider ne error diya aur koi text nahi aaya: user ko clean error
    if (finishReason === "error" && reply.length === 0) {
      throw new ApiError("provider_unavailable");
    }

    await send({
      event: "done",
      data: {
        request_id: traceId,
        provider: routed.provider,
        model: routed.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        finish_reason: finishReason,
      },
    });
  }, traceId);

  if (conversationId !== null) {
    response.headers.set("X-Conversation-Id", conversationId);
  }
  return response;
}

// Planner ka fallback: error aaye to user ka sawal chat mein hi jaata hai.
async function planOrChat(
  env: Env,
  message: string,
  recent: ChatMessage[],
  signal: AbortSignal,
  traceId: string,
): Promise<Plan> {
  try {
    return (await planProject(env, message, signal, recent)).plan;
  } catch {
    console.error(JSON.stringify({ event: "planner_failed", request_id: traceId }));
    return { route: "chat", role: "general", steps: [] };
  }
}

const KIND_LABEL: Record<CreateKind, string> = {
  image: "तस्वीर",
  slides: "स्लाइड्स",
  website: "वेबसाइट",
  document: "दस्तावेज़",
};

interface ReadyFile {
  id: string;
  kind: CreateKind;
  title: string;
  mime_type: string | null;
  size_bytes: number | null;
  download_url: string;
}

// Jo kaam ready hue, unke signed download link (1 ghanta chalte hain).
async function readyFiles(env: Env, outcomes: readonly StepOutcome[]): Promise<ReadyFile[]> {
  const files: ReadyFile[] = [];
  for (const o of outcomes) {
    if (o.status !== "ready" || o.fileId === null || o.storagePath === null) continue;
    files.push({
      id: o.fileId,
      kind: o.kind,
      title: o.title,
      mime_type: o.mimeType,
      size_bytes: o.sizeBytes,
      download_url: await signedDownloadUrl(env, o.storagePath),
    });
  }
  return files;
}

// Saved jawab mein link nahi jaate (link 1 ghante mein expire hote hain). Sirf kaam ka saar.
function summaryText(outcomes: readonly StepOutcome[], allDone: boolean): string {
  const header = allDone ? "आपका काम तैयार है:" : "काम पूरा नहीं हो सका। जितना बना, वो नीचे है:";
  const lines = outcomes.map((o) =>
    o.status === "ready"
      ? `✅ ${KIND_LABEL[o.kind]}: ${o.title}`
      : `❌ ${KIND_LABEL[o.kind]}: नहीं बन सका (${o.errorCode ?? "त्रुटि"})`,
  );
  return [header, ...lines].join("\n");
}

// Orchestrator ka rasta: kaam chalao, file banao, aur chat mein saar aur download link do.
async function handleCreateRoute(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  user: AuthUser,
  userCtx: UserContext,
  body: ChatBody,
  plan: Plan,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  // Conversation: history on ho to naya ya wahi jo user ne bheja (ownership pehle check ho chuki hai).
  const conversationId = userCtx.historyEnabled
    ? (body.conversationId ?? (await createConversation(db, user.id, body.message)))
    : null;

  const response = createSseResponse(async (send) => {
    await send({ event: "delta", data: { text: "योजना बन गई। काम शुरू कर रहा हूँ…\n" } });

    const run = await runProjectNow(env, config, db, userCtx, body.message, plan, request.signal, execCtx);
    const summary = summaryText(run.outcomes, run.status === "done");
    const files = await readyFiles(env, run.outcomes);

    const links =
      files.length === 0
        ? ""
        : "\n\nडाउनलोड लिंक (1 घंटे तक चलेंगे):\n" +
          files.map((f) => `${KIND_LABEL[f.kind]} – ${f.title}: ${f.download_url}`).join("\n");
    await send({ event: "delta", data: { text: `\n${summary}${links}` } });

    if (conversationId !== null) {
      execCtx.waitUntil(
        saveTurn(db, {
          conversationId,
          traceId,
          userMessage: body.message,
          reply: summary,
          provider: "groq",
          model: CREATE_TEXT_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          finishReason: "stop",
        }).catch(logFailure("save_turn_failed", traceId)),
      );
    }

    // Idempotency ke liye ek usage row: same Idempotency-Key par dobara kaam nahi chalega.
    const usageRequestId = `${user.id}:${readIdempotencyKey(request) ?? traceId}`;
    execCtx.waitUntil(
      recordUsage(db, {
        userId: user.id,
        usageRequestId,
        provider: "groq",
        model: CREATE_TEXT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        costInr: 0,
      }).catch(logFailure("usage_write_failed", traceId)),
    );

    await send({
      event: "done",
      data: {
        request_id: traceId,
        provider: "groq",
        model: CREATE_TEXT_MODEL,
        input_tokens: 0,
        output_tokens: 0,
        finish_reason: "stop",
      },
    });
  }, traceId);

  if (conversationId !== null) {
    response.headers.set("X-Conversation-Id", conversationId);
  }
  return response;
}

// Logged-in user ka poora flow.
async function handleUserChat(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  user: AuthUser,
  body: ChatBody,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  // 3. Plan aur usage DB se (client se nahi)
  const userCtx = await loadUserContext(db, user);
  const idemKey = readIdempotencyKey(request);
  const usageRequestId = `${user.id}:${idemKey ?? traceId}`;

  if (!userCtx.historyEnabled && body.conversationId !== null) {
    throw invalid("इतिहास बंद है, इसलिए बातचीत ID नहीं चल सकती।");
  }

  if (await usageExists(db, usageRequestId)) {
    throw invalid("यह अनुरोध पहले ही हो चुका है।");
  }

  // Pichhla context: history on ho to DB se, warna client ki history
  let priorMessages: ChatMessage[] = body.history;
  if (userCtx.historyEnabled) {
    if (body.conversationId !== null) {
      await assertOwnsConversation(db, user.id, body.conversationId);
      priorMessages = await loadStoredHistory(db, body.conversationId);
    } else {
      priorMessages = [];
    }
  }

  // Orchestrator: planner tay karta hai ki ye baatcheet hai ya kuch banana hai.
  const plan = await planOrChat(env, body.message, priorMessages, request.signal, traceId);

  if (plan.route === "create") {
    return handleCreateRoute(request, env, config, db, user, userCtx, body, plan, traceId, execCtx);
  }

  // Mode "general" (default) ho to planner ka role lete hain. Chip se chuna role wahi rehta hai.
  const mode = body.mode === "general" ? plan.role : body.mode;
  let messages = buildMessages(userCtx.language, mode, priorMessages, body.message);
  // Taaza jaankari wale sawal (train, hotel, kiraya, khabar): Google Search se live data.
  if (needsLiveInfo(body.message)) {
    const live = await fetchLiveAnswer(env, body.message, request.signal);
    if (live !== null) messages = withLiveContext(messages, live);
  }
  const inputEstimate = estimateInput(messages);

  // 4. Daily token quota
  assertWithinDailyQuota(userCtx, inputEstimate + userCtx.plan.maxOutputTokens);

  return runChat({
    env,
    config,
    db,
    execCtx,
    request,
    traceId,
    userMessage: body.message,
    messages,
    inputEstimate,
    planName: userCtx.plan.plan,
    maxOutputTokens: userCtx.plan.maxOutputTokens,
    hindi: userCtx.language !== "en",
    isFreePlan: userCtx.plan.plan === "free",
    owner: {
      userId: user.id,
      usageRequestId,
      resolveConversation: async () => {
        if (!userCtx.historyEnabled) return null;
        if (body.conversationId !== null) return body.conversationId;
        return createConversation(db, user.id, body.message);
      },
    },
  });
}

// Guest ka flow: login nahi, limited messages, kuch save nahi.
async function handleGuestChat(
  request: Request,
  env: Env,
  config: Config,
  db: SupabaseClient,
  guest: GuestIdentity,
  body: ChatBody,
  traceId: string,
  execCtx: ExecutionContext,
): Promise<Response> {
  if (body.conversationId !== null) {
    throw invalid("मेहमान मोड में बातचीत सेव नहीं होती। लॉग-इन करें।");
  }

  // Guest ka message limit pehle lagta hai, taaki limit ke baad koi kaam na ho.
  await reserveGuestMessage(env, guest);

  const mode =
    body.mode === "general" ? await detectAutoRole(env, body.message, request.signal) : body.mode;
  const messages = buildMessages(GUEST_LANGUAGE, mode, body.history, body.message);
  const inputEstimate = estimateInput(messages);

  return runChat({
    env,
    config,
    db,
    execCtx,
    request,
    traceId,
    userMessage: body.message,
    messages,
    inputEstimate,
    planName: GUEST_PLAN,
    maxOutputTokens: GUEST_MAX_OUTPUT_TOKENS,
    hindi: true,
    isFreePlan: true,
    owner: null,
  });
}

export async function handleChat(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    if (request.method !== "POST") throw invalid();

    const config = loadConfig(env);
    assertSecretsPresent(env);

    // 1. Shape validate (pehle, taaki galat request limit na kharche)
    const body = await parseBody(request);

    // 2. Pehchan: user ya guest
    const caller = await resolveCaller(request, env);
    const db = createSupabase(env);

    if (caller.kind === "guest") {
      return await handleGuestChat(request, env, config, db, caller.guest, body, traceId, execCtx);
    }
    return await handleUserChat(request, env, config, db, caller.user, body, traceId, execCtx);
  } catch (err) {
    logFailure("chat_request_failed", traceId)(err);
    return toErrorResponse(err, traceId);
  }
}