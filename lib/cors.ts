import { NextResponse } from "next/server";

// सिर्फ़ ये origins API को छू सकते हैं। Wildcard (*) कभी नहीं।
// Capacitor Android का origin https://localhost है; web app का अपना origin same-origin है।
const ALLOWED_ORIGINS = new Set<string>([
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Preflight (OPTIONS) का जवाब। किसी भी route से पहले इसे बुलाएं। */
export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** Normal जवाब पर CORS header जोड़ें। */
export function withCors(res: NextResponse, origin: string | null): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    res.headers.set(key, value);
  }
  return res;
}