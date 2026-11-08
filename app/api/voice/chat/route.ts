import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { replyToChat } from "@/lib/assistant/chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
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

  try {
    const reply = await replyToChat(messages);
    if (!reply) {
      return NextResponse.json({ error: { code: "EMPTY", message: "जवाब नहीं मिला, दोबारा पूछें" } }, { status: 502 });
    }
    return NextResponse.json({ reply });
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