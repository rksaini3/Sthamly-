import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callProjectApi, getUserAccessToken, unauthorized } from "@/lib/project/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Plan बनाने में text model लगता है, इसलिए थोड़ा समय।
export const maxDuration = 120;

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
});

// POST /api/orchestrate: काम का plan बनवाओ (कोई file अभी नहीं बनती)।
export async function POST(req: NextRequest) {
  const token = await getUserAccessToken();
  if (!token) return unauthorized();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही जानकारी भेजें" } }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "काम का विवरण कम से कम 3 अक्षर का लिखें" } },
      { status: 400 },
    );
  }

  return callProjectApi({
    token,
    method: "POST",
    path: "",
    body: { prompt: parsed.data.prompt },
  });
}