import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent, type ActionView, type StepView } from "@/lib/agent/loop";
import { replyToChat } from "@/lib/assistant/chat";
import { titleFromMessage } from "@/lib/chats";
import { LANG_COOKIE, parseLang, type Lang } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // पुरानी बातचीत जारी रखनी हो तो उसकी id (न हो तो नई बातचीत बनती है)
  threadId: z.uuid().optional(),
  // "फिर से लिखें": वही सवाल दोबारा, इतिहास में सवाल दूसरी बार न जुड़े
  regenerate: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(12),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  try {
    return await handleChat(req);
  } catch (error) {
    console.error("voice chat: unexpected error", error);
    return errorResponse(500, "INTERNAL", "जवाब नहीं बन पाया, दोबारा कोशिश करें");
  }
}

async function handleChat(req: NextRequest) {
  // 1. Login जांच
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 2. Body जांच
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "संदेश सही नहीं है");

  const messages = parsed.data.messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return errorResponse(400, "BAD_ORDER", "आखिरी संदेश आपका होना चाहिए");
  }

  const lang: Lang = parseLang(req.cookies.get(LANG_COOKIE)?.value);

  // 3. इस्तेमाल की सीमा: रोज़ की मुफ़्त सीमा के बाद वॉलेट से, पैसे न हों तो रुकें।
  let willPayPaise = 0;
  try {
    const usage = await checkUsage(user.id, "chat");
    if (!usage.ok) {
      return NextResponse.json(
        {
          error: {
            code: "LIMIT_REACHED",
            message: "आज की मुफ़्त बातचीत पूरी हो गई। जारी रखने के लिए वॉलेट भरें या प्लान लें।",
          },
          limit: { kind: "chat", plan: usage.plan, walletPaise: usage.walletPaise, pricePaise: usage.pricePaise },
        },
        { status: 402 },
      );
    }
    willPayPaise = usage.willPayPaise;
  } catch (error) {
    // हिसाब की टेबल न बनी हो तो भी चैट चलती रहे
    console.error("voice chat: usage check failed", error);
  }

  // 4. इतिहास में सेव: सहायक काम है, विफल हो तो भी जवाब जाए
  let threadId: string | null = null;
  let title: string | null = null;
  try {
    if (parsed.data.threadId) {
      const { data: existing } = await supabase
        .from("chat_threads")
        .select("id, title")
        .eq("id", parsed.data.threadId)
        .maybeSingle();
      if (existing) {
        threadId = existing.id;
        title = existing.title;
      }
    }
    if (!threadId) {
      const { data: created, error: createError } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, title: titleFromMessage(last.content) })
        .select("id, title")
        .single();
      if (createError) throw createError;
      threadId = created.id;
      title = created.title;
    }
    if (!parsed.data.regenerate) {
      const { error: userMsgError } = await supabase
        .from("chat_messages")
        .insert({ thread_id: threadId, user_id: user.id, role: "user", content: last.content });
      if (userMsgError) throw userMsgError;
    }
  } catch (error) {
    console.error("voice chat: history save failed", error);
    threadId = null;
  }

  // 5. जवाब: पहले agent, विफल हो तो सादा सवाल-जवाब
  const outcome = await answer({ userId: user.id, threadId, lang, messages });

  // 6. इस्तेमाल दर्ज करें (जवाब मिल गया, चाहे agent से हो या fallback से)
  try {
    await recordUsage(user.id, "chat", willPayPaise);
  } catch (error) {
    console.error("voice chat: usage record failed", error);
  }

  if (!outcome.reply) {
    return errorResponse(502, "EMPTY", "जवाब नहीं मिला, दोबारा पूछें");
  }

  // 7. जवाब इतिहास में सेव करें और बातचीत को "हाल की" सूची में ऊपर लाएं
  if (threadId) {
    try {
      const { error: replyError } = await supabase.from("chat_messages").insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: outcome.reply.slice(0, 4000),
      });
      if (replyError) console.error("voice chat: reply save failed", replyError);

      const { error: touchError } = await supabase
        .from("chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
      if (touchError) console.error("voice chat: thread touch failed", touchError);
    } catch (error) {
      console.error("voice chat: reply save failed", error);
    }
  }

  return NextResponse.json({
    reply: outcome.reply,
    threadId,
    title,
    runId: outcome.runId,
    status: outcome.status,
    steps: outcome.steps,
    actions: outcome.actions,
  });
}

// ---- जवाब बनाना: agent पहले, फिर सादा सवाल-जवाब ----

interface Answer {
  reply: string;
  runId: string | null;
  status: "done" | "waiting_confirm" | "chat";
  steps: StepView[];
  actions: ActionView[];
}

async function answer(input: {
  userId: string;
  threadId: string | null;
  lang: Lang;
  messages: { role: "user" | "assistant"; content: string }[];
}): Promise<Answer> {
  const last = input.messages[input.messages.length - 1];
  const history = input.messages.slice(0, -1);

  try {
    const outcome = await runAgent({
      userId: input.userId,
      threadId: input.threadId,
      lang: input.lang,
      goal: last.content,
      history,
    });

    if (outcome.kind === "reply") {
      return { reply: outcome.reply, runId: outcome.runId, status: "done", steps: outcome.steps, actions: [] };
    }
    if (outcome.kind === "waiting") {
      return {
        reply: outcome.reply,
        runId: outcome.runId,
        status: "waiting_confirm",
        steps: outcome.steps,
        actions: outcome.actions,
      };
    }

    // agent पूरा न कर पाया: सादा सवाल-जवाब से कोशिश करें
    const chatReply = await safeChat(input.messages, input.lang);
    return {
      reply: chatReply || outcome.reply,
      runId: outcome.runId,
      status: "chat",
      steps: outcome.steps,
      actions: [],
    };
  } catch (error) {
    console.error("voice chat: agent failed, using chat fallback", error);
    const chatReply = await safeChat(input.messages, input.lang);
    return { reply: chatReply, runId: null, status: "chat", steps: [], actions: [] };
  }
}

async function safeChat(messages: { role: "user" | "assistant"; content: string }[], lang: Lang): Promise<string> {
  try {
    return await replyToChat(messages, lang);
  } catch (error) {
    console.error("voice chat: fallback chat failed", error);
    return "";
  }
}