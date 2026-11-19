import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "कुछ बदलने को दें",
  });

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// PATCH: नाम या विवरण बदलना (सिर्फ़ अपना project, RLS से)
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return errorResponse(404, "NOT_FOUND", "प्रोजेक्ट नहीं मिला");

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
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "सही जानकारी भेजें");
  }

  const patch: { name?: string; description?: string | null } = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select("id, name, description, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("project patch failed", error.message);
    return errorResponse(500, "UPDATE_FAILED", "प्रोजेक्ट नहीं बदल पाया");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "प्रोजेक्ट नहीं मिला");
  return NextResponse.json({ project: data });
}

// DELETE: project हटाना। उसकी chats नहीं हटतीं, बस project से अलग हो जाती हैं।
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return errorResponse(404, "NOT_FOUND", "प्रोजेक्ट नहीं मिला");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // पहले chats को project से अलग करें, ताकि project हटने में रुकावट न आए
  const { error: detachError } = await supabase
    .from("chat_threads")
    .update({ project_id: null })
    .eq("project_id", id);
  if (detachError) {
    console.error("project delete: detach chats failed", detachError.message);
    return errorResponse(500, "DELETE_FAILED", "प्रोजेक्ट नहीं हट पाया");
  }

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("project delete failed", error.message);
    return errorResponse(500, "DELETE_FAILED", "प्रोजेक्ट नहीं हट पाया");
  }
  if (!data) return errorResponse(404, "NOT_FOUND", "प्रोजेक्ट नहीं मिला");
  return NextResponse.json({ ok: true, id: data.id });
}