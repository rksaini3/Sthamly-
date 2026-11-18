import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  threadId: z.uuid(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// POST: chat को इस project में डालें
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return errorResponse(400, "BAD_REQUEST", "गलत प्रोजेक्ट");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "सही जानकारी भेजें");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "VALIDATION_FAILED", "सही chat चुनें");

  // Project इसी user का हो
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return errorResponse(404, "NOT_FOUND", "प्रोजेक्ट नहीं मिला");

  // Chat भी इसी user की हो
  const { data: updated, error } = await supabase
    .from("chat_threads")
    .update({ project_id: projectId })
    .eq("id", parsed.data.threadId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return errorResponse(500, "INTERNAL", "chat नहीं जुड़ पाई");
  if (!updated) return errorResponse(404, "NOT_FOUND", "chat नहीं मिली");

  return NextResponse.json({ ok: true });
}

// DELETE: chat को project से हटाएं (chat खुद नहीं मिटती)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) return errorResponse(400, "BAD_REQUEST", "गलत प्रोजेक्ट");

  const threadId = req.nextUrl.searchParams.get("threadId");
  if (!threadId || !z.uuid().safeParse(threadId).success) {
    return errorResponse(400, "BAD_REQUEST", "सही chat चुनें");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // सिर्फ़ उसी project से हटे जिसमें वह अभी है
  const { data: updated, error } = await supabase
    .from("chat_threads")
    .update({ project_id: null })
    .eq("id", threadId)
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error) return errorResponse(500, "INTERNAL", "chat नहीं हट पाई");
  if (!updated) return errorResponse(404, "NOT_FOUND", "chat इस प्रोजेक्ट में नहीं है");

  return NextResponse.json({ ok: true });
}