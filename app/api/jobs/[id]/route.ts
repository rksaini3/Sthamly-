import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

// जो बदलना हो वही भेजें। कम से कम एक चीज़ ज़रूरी है।
const patchSchema = z
  .object({
    offerText: z.string().trim().min(3).max(300).optional(),
    occasion: z.string().trim().max(60).nullable().optional(),
    caption: z.string().trim().max(2000).optional(),
    hiddenFromNotebook: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.offerText !== undefined ||
      v.occasion !== undefined ||
      v.caption !== undefined ||
      v.hiddenFromNotebook !== undefined,
    { message: "कुछ बदलने को दें" },
  );

// जो काम अभी बन रहा है उसका ऑफ़र नहीं बदलते (worker उसी को पढ़ रहा है)
const OFFER_LOCKED_STATUSES = ["queued", "running"] as const;

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * user पहचानें: Android (Bearer) या web (cookie)।
 * सिर्फ़ user id लौटाते हैं, क्योंकि लिखने का काम admin client से होगा
 * और मालिकाना हक़ हम खुद जांचेंगे।
 */
async function currentUserId(req: NextRequest): Promise<string | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("job edit: bearer check failed", error);
    return null;
  });
  if (bearer) return bearer.id;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const origin = req.headers.get("origin");
  let res: NextResponse;
  try {
    res = await handleEdit(req, ctx);
  } catch (error) {
    console.error("job edit: unexpected error", error);
    res = errorResponse(500, "INTERNAL", "बदलाव सेव नहीं हो पाया, दोबारा कोशिश करें");
  }
  return withCors(res, origin);
}

async function handleEdit(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "काम नहीं मिला");

  // 1. Login जांच
  const userId = await currentUserId(req);
  if (!userId) return errorResponse(401, "UNAUTHORIZED", "पहले लॉग-इन करें");

  // 2. Body जांच
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
  const body = parsed.data;

  // 3. मालिकाना हक़: काम उसी दुकान का हो जिसका मालिक यह user है।
  // Admin client पर RLS नहीं लगता, इसलिए user_id का फ़िल्टर खुद लगाते हैं।
  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id, status, input, shops!inner(user_id)")
    .eq("id", id)
    .eq("shops.user_id", userId)
    .maybeSingle();

  if (jobError) {
    console.error("job edit: job lookup failed", jobError);
    return errorResponse(500, "READ_FAILED", "काम नहीं खुल पाया");
  }
  if (!job) return errorResponse(404, "NOT_FOUND", "काम नहीं मिला");

  // 4. ऑफ़र और occasion: जो काम बन रहा है उसमें नहीं बदलते
  const wantsOfferChange = body.offerText !== undefined || body.occasion !== undefined;
  if (wantsOfferChange && OFFER_LOCKED_STATUSES.includes(job.status as (typeof OFFER_LOCKED_STATUSES)[number])) {
    return errorResponse(409, "LOCKED", "यह पोस्टर अभी बन रहा है, पूरा होने पर ऑफ़र बदल सकते हैं");
  }

  // 5. ऑफ़र और occasion: मौजूदा input में merge करके सेव
  if (wantsOfferChange) {
    const current = (job.input ?? {}) as Record<string, unknown>;
    const nextInput = {
      ...current,
      ...(body.offerText !== undefined ? { offerText: body.offerText } : {}),
      ...(body.occasion !== undefined ? { occasion: body.occasion ?? null } : {}),
    };
    const { error: inputError } = await admin.from("jobs").update({ input: nextInput }).eq("id", id);
    if (inputError) {
      console.error("job edit: input save failed", inputError);
      return errorResponse(500, "UPDATE_FAILED", "बदलाव सेव नहीं हो पाया");
    }
  }

  // 6. कैप्शन: मौजूदा caption output बदलें, या न हो तो नया बनाएं
  if (body.caption !== undefined) {
    const { data: existing, error: findError } = await admin
      .from("outputs")
      .select("id")
      .eq("job_id", id)
      .eq("type", "caption")
      .maybeSingle();
    if (findError) {
      console.error("job edit: caption lookup failed", findError);
      return errorResponse(500, "UPDATE_FAILED", "कैप्शन सेव नहीं हो पाया");
    }

    const captionWrite = existing
      ? admin.from("outputs").update({ content: body.caption }).eq("id", existing.id)
      : admin.from("outputs").insert({ job_id: id, type: "caption", content: body.caption, meta: {} });

    const { error: captionError } = await captionWrite;
    if (captionError) {
      console.error("job edit: caption save failed", captionError);
      return errorResponse(500, "UPDATE_FAILED", "कैप्शन सेव नहीं हो पाया");
    }
  }

  // 7. नोटबुक से हटाना या वापस लाना (काम और पोस्टर सुरक्षित रहते हैं)
  if (body.hiddenFromNotebook !== undefined) {
    const { error: hideError } = await admin
      .from("jobs")
      .update({ hidden_from_notebook: body.hiddenFromNotebook })
      .eq("id", id);
    if (hideError) {
      console.error("job edit: hide save failed", hideError);
      return errorResponse(500, "UPDATE_FAILED", "बदलाव सेव नहीं हो पाया");
    }
  }

  return NextResponse.json({ ok: true, jobId: id });
}