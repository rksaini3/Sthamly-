import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { openrouterProvider } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// टेस्ट route: ?key=CRON_SECRET के साथ खोलें। जांच पूरी होने पर यह फ़ाइल हटा दें।
export async function GET(req: NextRequest) {
  const { CRON_SECRET } = getServerEnv();
  if (req.nextUrl.searchParams.get("key") !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await openrouterProvider.generateText({
      prompt: "Reply with only the word OK.",
      maxTokens: 5,
    });
    return NextResponse.json({ ok: true, reply: result.text ?? null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}