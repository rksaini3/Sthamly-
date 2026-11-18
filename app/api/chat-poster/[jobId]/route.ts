import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed URL 1 घंटे चलेगा, जैसा library में है
const SIGNED_URL_SECONDS = 60 * 60;
const idSchema = z.uuid();

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!idSchema.safeParse(jobId).success) return errorResponse(400, "BAD_REQUEST", "गलत काम");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // RLS के हिसाब से सिर्फ़ अपना काम दिखेगा
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, status, error, outputs(type, storage_path)")
    .eq("id", jobId)
    .maybeSingle();

  if (error) return errorResponse(500, "INTERNAL", "स्थिति नहीं मिली");
  if (!job) return errorResponse(404, "NOT_FOUND", "काम नहीं मिला");

  const outputs = (job.outputs ?? []) as { type: string; storage_path: string | null }[];
  const poster = outputs.find((o) => o.type === "poster" && o.storage_path);

  let posterUrl: string | null = null;
  if (poster?.storage_path) {
    const { data: signed, error: signError } = await supabase.storage
      .from("outputs")
      .createSignedUrl(poster.storage_path, SIGNED_URL_SECONDS);
    if (signError) console.error("chat-poster: signed url failed", signError);
    posterUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    status: job.status,
    error: job.status === "failed" ? "पोस्टर नहीं बन पाया" : null,
    posterUrl,
  });
}