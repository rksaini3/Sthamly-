import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

const patchSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => v.pinned !== undefined || v.title !== undefined, { message: "कुछ बदलने को दें" });

type Ctx = { params: Promise<{ id: string }> };

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// पिन करना या नाम बदलना
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return error(400, "BAD_ID", "बातचीत नहीं मिली");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error(400, "VALIDATION_FAILED", "सही जानकारी भेजें");

  // RLS से सिर्फ़ अपनी बातचीत बदलती है; दूसरे की id पर कोई row नहीं मिलेगी
  const { data, error: dbError } = await supabase
    .from("chat_threads")
    .update(body.data)
    .eq("id", id)
    .select("id, title, pinned, updated_at")
    .maybeSingle();

  if (dbError) {
    console.error("chat update failed", dbError);
    return error(500, "UPDATE_FAILED", "बदलाव सेव नहीं हो पाया");
  }
  if (!data) return error(404, "NOT_FOUND", "बातचीत नहीं मिली");
  return NextResponse.json({ chat: data });
}

// बातचीत हटाना (संदेश पहले हटते हैं, फिर बातचीत)।
// पहले जांचते हैं कि बातचीत इसी user की है, फिर admin client से हटाते हैं।
// Admin client पर RLS लागू नहीं होता, इसलिए हर delete में user_id का फ़िल्टर ज़रूरी है।
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return error(400, "BAD_ID", "बातचीत नहीं मिली");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 1. मालिकाना हक़ की जांच
  const { data: owned, error: ownError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownError) {
    console.error("chat delete: ownership check failed", ownError);
    return error(500, "DELETE_FAILED", "हटाया नहीं जा सका");
  }
  if (!owned) return error(404, "NOT_FOUND", "बातचीत नहीं मिली");

  // 2. संदेश हटाएं (thread_id की जांच ऊपर हो चुकी है)
  const admin = createSupabaseAdminClient();
  const { error: msgError } = await admin.from("chat_messages").delete().eq("thread_id", id);
  if (msgError) {
    console.error("chat delete: messages delete failed", msgError);
    return error(500, "DELETE_FAILED", "हटाया नहीं जा सका");
  }

  // 3. बातचीत हटाएं, और जांचें कि सच में कोई row हटी
  const { data: removed, error: threadError } = await admin
    .from("chat_threads")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (threadError) {
    console.error("chat delete: thread delete failed", threadError);
    return error(500, "DELETE_FAILED", "हटाया नहीं जा सका");
  }
  if (!removed || removed.length === 0) {
    // कुछ नहीं हटा: यह "हटा दिया" नहीं है, इसलिए गड़बड़ बताएं
    return error(500, "DELETE_FAILED", "हटाया नहीं जा सका");
  }

  return NextResponse.json({ ok: true });
}