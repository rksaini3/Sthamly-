import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callProjectApi, getUserAccessToken, unauthorized } from "@/lib/project/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// एक कदम (खासकर slides या website) में समय लगता है।
export const maxDuration = 120;

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// POST /api/orchestrate/:id/next: अगला कदम चलाओ (या विफल कदम दोबारा)।
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = await getUserAccessToken();
  if (!token) return unauthorized();

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही प्रोजेक्ट चुनें" } }, { status: 400 });
  }
  return callProjectApi({ token, method: "POST", path: `/${id}/next` });
}
