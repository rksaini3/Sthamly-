// Sthamly AI Worker — POST /api/ai/chat (Blueprint 3.0, section 6 and 7)
// Streaming chat. Order (blueprint section 6):
//  1. Request shape validate            2. Login token verify
//  3. Plan aur usage DB se              4. Quota aur budget check
//  5. Model router (provider chunav)    6. Stream (SSE)
//  8. Result normalize                  9. Usage ek baar (request_id unique)
//  10. Logs aur save ctx.waitUntil se, user ko intezaar nahi
// Tool loop Phase 3 mein aayega. Abhi koi tool nahi chalta.

import { authenticate } from "../auth";
import { assertBudget } from "../budget";
import { assertSecretsPresent, loadConfig, type Env } from "../env";
import { ApiError, toErrorResponse } from "../errors";
import { assertWithinDailyQuota, loadUserContext, type UserContext } from "../plan";
import { routeChat } from "../providers/router";
import { estimateCostInr, type ChatMessage } from "../providers/types";
import { createSseResponse } from "../sse";
import { createSupabase, type SupabaseClient } from "../supabase";

// ---- Limits ----
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ITEMS = 20;
const TITLE_CHARS = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;

// USD se INR. Ye open decision hai (blueprint 13). Baad mein config variable mein jaayega.
const USD_TO_INR = 85;

// Server-side system prompt. Client ise nahi bhej sakta.
const SYSTEM_PROMPTS: Record<UserContext["language"], string> = {
  hi: "आप Sthamly AI हैं, छोटे दुकानदारों और उद्यमियों के लिए एक सहायक। सरल हिंदी में, छोटे और साफ़ जवाब दें। जो न पता हो, साफ़ कहें, अंदाज़ा न लगाएँ।",
  hinglish:
    "You are Sthamly AI, an assistant for small shopkeepers and entrepreneurs. Reply in simple Hinglish (Hindi written in Roman script mixed with English). Keep answers short and clear. If you do not know something, say so; do not guess.",
  en: "You are Sthamly AI, an assistant for small shopkeepers and entrepreneurs. Reply in simple English. Keep answers short and clear. If you do not know something, say so; do not guess.",
};

interface ChatBody {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
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

  // History sirf tab use hoti hai jab user ne history band rakhi ho.
  // History on ho to server apni DB se load karta hai, client ki history par bharosa nahi.
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

  return { message, conversationId, history };
}

// Idempotency-Key header: sahi format ho ya na ho to request galat.
// Na ho to server apna trace id use karta hai.
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
    `conversation_id=eq.${conversationId}&select=role,content&order=created_at.desc&limit=${MAX_HISTORY_ITEMS}`,
  );
  return rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content }));
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
  await db.insert("messages", [
    {
      conversation_id: p.conversationId,
      role: "user",
      content: p.userMessage,
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
  await db.update(
    "conversations",
    `id=eq.${p.conversationId}`,
    { updated_at: new Date().toISOString() },
  );
}

// Log mein sirf event, code aur request id. Message, prompt ya token kabhi nahi.
function logFailure(event: string, requestId: string): (err: unknown) => void {
  return (err: unknown): void => {
    const code = err instanceof ApiError ? err.code : "internal";
    console.error(JSON.stringify({ event, code, request_id: requestId }));
  };
}

export async function handleChat(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const traceId = crypto.randomUUID();

  try {
    if (request.method !== "POST") throw invalid();

    const config = loadConfig(env);
    assertSecretsPresent(env);

    // 2. Login token verify
    const user = await authenticate(request, env);

    // 1. Shape validate
    const body = await parseBody(request);
    const idemKey = readIdempotencyKey(request);
    const usageRequestId = `${user.id}:${idemKey ?? traceId}`;

    // 3. Plan aur usage DB se (client se nahi)
    const db = createSupabase(env);
    const userCtx = await loadUserContext(db, user);

    if (!userCtx.historyEnabled && body.conversationId) {
      throw invalid("इतिहास बंद है, इसलिए बातचीत ID नहीं चल सकती।");
    }

    if (await usageExists(db, usageRequestId)) {
      throw invalid("यह अनुरोध पहले ही हो चुका है।");
    }

    // Pichhla context: history on ho to DB se, warna client ki history
    let priorMessages: ChatMessage[] = body.history;
    if (userCtx.historyEnabled) {
      if (body.conversationId) {
        await assertOwnsConversation(db, user.id, body.conversationId);
        priorMessages = await loadStoredHistory(db, body.conversationId);
      } else {
        priorMessages = [];
      }
    }

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPTS[userCtx.language] },
      ...priorMessages,
      { role: "user", content: body.message },
    ];

    // 4. Quota aur budget
    const inputEstimate = messages.reduce((sum, m) => sum + approxTokens(m.content), 0);
    assertWithinDailyQuota(userCtx, inputEstimate + userCtx.plan.maxOutputTokens);

    const budget = await assertBudget(env, db, config, {
      feature: "chat",
      isFreePlan: userCtx.plan.plan === "free",
    });

    // Nayi conversation: provider call se pehle bana do, taaki reply ka sahi id mile.
    let conversationId: string | null = body.conversationId;
    if (userCtx.historyEnabled && conversationId === null) {
      conversationId = await createConversation(db, user.id, body.message);
    }

    // 5. Model chunav. Yahin provider ka pehla chunk tak wait hota hai,
    //    isliye galat connection par JSON error milta hai, khaali stream nahi.
    const routed = await routeChat(env, db, {
      planName: userCtx.plan.plan,
      budget,
      hindi: userCtx.language !== "en",
      preferTier: "standard",
      request: {
        messages,
        maxOutputTokens: userCtx.plan.maxOutputTokens,
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
      const succeeded = !aborted && reply.length > 0;

      // 9 aur 10. Usage ek baar, aur save. User ko intezaar nahi.
      const usageWrite = recordUsage(db, {
        userId: user.id,
        usageRequestId,
        provider: routed.provider,
        model: routed.model,
        inputTokens,
        outputTokens,
        costInr,
      }).catch(logFailure("usage_write_failed", traceId));

      const saveWrite =
        succeeded && userCtx.historyEnabled && conversationId !== null
          ? saveTurn(db, {
              conversationId,
              traceId,
              userMessage: body.message,
              reply,
              provider: routed.provider,
              model: routed.model,
              inputTokens,
              outputTokens,
              finishReason,
            }).catch(logFailure("save_turn_failed", traceId))
          : Promise.resolve();

      ctx.waitUntil(Promise.all([usageWrite, saveWrite]));

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
  } catch (err) {
    logFailure("chat_request_failed", traceId)(err);
    return toErrorResponse(err, traceId);
  }
}