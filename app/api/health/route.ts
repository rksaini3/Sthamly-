import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// यह सिर्फ़ बताता है कि variable सेट है या नहीं। Value कभी नहीं दिखाई जाती।
const CHECKED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "AI_PROVIDER",
  "FAL_KEY",
  "TEXT_PROVIDER",
  "OPENROUTER_API_KEY",
] as const;

export async function GET() {
  const env: Record<string, boolean> = {};
  for (const name of CHECKED_ENV) {
    env[name] = Boolean(process.env[name]);
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    env,
  });
}