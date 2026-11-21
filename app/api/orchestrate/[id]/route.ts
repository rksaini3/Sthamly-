import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { callProjectApi, getUserAccessToken, unauthorized } from "@/lib/project/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// GET /api/orchestrate/:id: project और उसके कामों की स्थिति।
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = await getUserAccessToken();
  if (!token) return unauthorized();

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "सही प्रोजेक्ट चुनें" } }, { status: 400 });
  }
  return callProjectApi({ token, method: "GET", path: `/${id}` });
}