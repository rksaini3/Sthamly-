import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { allowRequest } from "@/lib/rate-limit";
import { streamText, type ChatMessage } from "@/lib/studio/cloudflare";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby की अधिकतम सीमा 300 सेकंड है; स्ट्रीमिंग से जवाब लगातार आता रहता है
export const maxDuration = 300;

const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_MAX_REQUESTS = 10;
const MAX_TOKENS = 6000;

const bodySchema = z.object({
  prompt: z.string().trim().min(10).max(1000),
});

const SYSTEM_PROMPT = [
  "तुम एक वेबसाइट बनाने वाले असिस्टेंट हो। यूज़र के विवरण से एक पूरी, सिंगल-फ़ाइल वेबसाइट बनाओ।",
  "सिर्फ़ एक पूरा HTML दस्तावेज़ लौटाओ, जो <!DOCTYPE html> से शुरू हो और </html> पर खत्म हो।",
  "स्टाइल के लिए Tailwind CDN इस्तेमाल करो: <script src=\"https://cdn.tailwindcss.com\"></script>।",
  "JavaScript सिर्फ़ inline लिखो। बाहरी images, fonts या APIs मत लगाओ; placeholder के लिए रंगीन blocks या SVG इस्तेमाल करो।",
  "मोबाइल पर अच्छी दिखे। यूज़र की भाषा (हिंदी/Hinglish) में टेक्स्ट लिखो।",
  "कोई समझाने वाली बात, markdown या कोड-फ़ेंस मत लिखो, सिर्फ़ HTML।",
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

  const allowed = await allowRequest(`studio-website:${user.id}`, RATE_WINDOW_SECONDS, RATE_MAX_REQUESTS);
  if (!allowed) {
    return errorResponse(429, "RATE_LIMITED", "थोड़ी देर बाद दोबारा कोशिश करें");
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_FAILED", "वेबसाइट का विवरण कम से कम 10 अक्षर का लिखें");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: parsed.data.prompt },
  ];

  try {
    const stream = await streamText(messages, MAX_TOKENS);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("studio website: stream failed", error instanceof Error ? error.message : error);
    return errorResponse(502, "AI_UNAVAILABLE", "वेबसाइट नहीं बन पाई, थोड़ी देर बाद दोबारा कोशिश करें");
  }
}