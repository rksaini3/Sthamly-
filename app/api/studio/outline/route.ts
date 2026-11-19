import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { allowRequest } from "@/lib/rate-limit";
import { completeText, type ChatMessage } from "@/lib/studio/cloudflare";
import { parseOutline } from "@/lib/studio/parse";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_REQUESTS = 20;

const bodySchema = z.object({
  topic: z.string().trim().min(3).max(300),
  slideCount: z.number().int().min(3).max(10).default(6),
});

const SYSTEM_PROMPT = [
  "तुम प्रेज़ेंटेशन का outline बनाते हो। सिर्फ़ एक JSON ऑब्जेक्ट लौटाओ, इसके आगे-पीछे कुछ मत लिखो।",
  'फ़ॉर्मेट: {"title": "प्रेज़ेंटेशन का शीर्षक", "slides": [{"title": "स्लाइड का शीर्षक", "bullets": ["बिंदु 1", "बिंदु 2"]}]}',
  "हर स्लाइड में 2 से 5 छोटे बिंदु हों। भाषा यूज़र के विषय वाली रखो (हिंदी या Hinglish)।",
].join("\n");

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  const allowed = await allowRequest(`studio-outline:${user.id}`, RATE_WINDOW_SECONDS, RATE_MAX_REQUESTS);
  if (!allowed) return errorResponse(429, "RATE_LIMITED", "थोड़ी देर बाद दोबारा कोशिश करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "विषय कम से कम 3 अक्षर का लिखें");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `विषय: ${parsed.data.topic}\nस्लाइड की संख्या: ${parsed.data.slideCount}`,
    },
  ];

  try {
    const text = await completeText(messages, 2000);
    const outline = parseOutline(text);
    if (!outline) {
      return errorResponse(502, "BAD_OUTPUT", "outline सही नहीं बना, दोबारा कोशिश करें");
    }
    return NextResponse.json({ outline });
  } catch (error) {
    console.error("studio outline failed", error instanceof Error ? error.message : error);
    return errorResponse(502, "AI_UNAVAILABLE", "outline नहीं बन पाया, थोड़ी देर बाद दोबारा कोशिश करें");
  }
}