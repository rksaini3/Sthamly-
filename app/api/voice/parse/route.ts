import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { parseOfferFromText } from "@/lib/voice/parse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(3).max(1000),
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
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही JSON भेजें" } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "लिखा हुआ text छोटा है" } }, { status: 400 });
  }

  try {
    const offer = await parseOfferFromText(parsed.data.text);
    return NextResponse.json({ offer, provider: getAIProvider().name });
  } catch (error) {
    console.error("voice web parse failed", error);
    return NextResponse.json(
      {
        error: {
          code: "PARSE_FAILED",
          message: error instanceof Error ? error.message : "ऑफर समझ नहीं आया",
        },
      },
      { status: 502 },
    );
  }
}