import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { replyToChat } from "@/lib/assistant/chat";
import { titleFromMessage } from "@/lib/chats";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { checkUsage, recordUsage } from "@/lib/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही जानकारी भेजें" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "संदेश सही नहीं है" } }, { status: 400 });
  }

  const messages = parsed.data.messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ error: { code: "BAD_ORDER", message: "आखिरी संदेश आपका होना चाहिए" } }, { status: 400 });
  }

  // इस्तेमाल की सीमा: रोज़ की मुफ़्त सीमा के बाद वॉलेट से थोड़े पैसे, पैसे न हों तो रुकें।
  // हिसाब की टेबल (0028) न बनी हो तो चैट न रोकें।
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
    console.error("voice chat: usage check failed", error);
  }

  // इतिहास में सेव करना सहायक काम है। टेबल न बनी हो या सेव न हो पाए तो भी चैट चलती रहे।
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

  try {
    // जवाब उसी भाषा में जो ऐप में चुनी गई है
    const reply = await replyToChat(messages, parseLang(req.cookies.get(LANG_COOKIE)?.value));
    if (!reply) {
      return NextResponse.json(
        { error: { code: "EMPTY", message: "जवाब नहीं मिला, दोबारा पूछें" } },
        { status: 502 },
      );
    }

    // जवाब मिल गया: अब इस्तेमाल दर्ज करें (और ज़रूरत हो तो वॉलेट से काटें)
    await recordUsage(user.id, "chat", willPayPaise);

    if (threadId) {
      const { error: replyError } = await supabase
        .from("chat_messages")
        .insert({ thread_id: threadId, user_id: user.id, role: "assistant", content: reply.slice(0, 4000) });
      if (replyError) console.error("voice chat: reply save failed", replyError);
      // बातचीत "हाल की" सूची में ऊपर आए
      const { error: touchError } = await supabase
        .from("chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
      if (touchError) console.error("voice chat: thread touch failed", touchError);
    }

    return NextResponse.json({ reply, threadId, title });
  } catch (error) {
    console.error("voice chat failed", error);
    return NextResponse.json(
      {
        error: {
          code: "CHAT_FAILED",
          message: error instanceof Error ? error.message : "जवाब नहीं बन पाया",
        },
      },
      { status: 502 },
    );
  }
}