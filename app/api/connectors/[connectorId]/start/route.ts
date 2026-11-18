import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { findConnector } from "@/lib/connectors/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback route yahi cookie padhega. Ek hi cookie mein sab state rakhte hain.
export const OAUTH_COOKIE = "connector_oauth";
const COOKIE_MAX_AGE_SECONDS = 600;

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redirectWithError(req: NextRequest, code: string) {
  const url = new URL("/voice", req.nextUrl.origin);
  url.searchParams.set("connect_error", code);
  return NextResponse.redirect(url);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> },
) {
  const { connectorId } = await params;
  const connector = findConnector(connectorId);
  if (!connector || connector.authType !== "oauth2" || !connector.oauth) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Connector nahi mila" } },
      { status: 404 },
    );
  }

  // Sirf login user hi connect kar sakta hai
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", "/voice");
    return NextResponse.redirect(url);
  }

  const oauth = connector.oauth;
  const clientId = process.env[oauth.clientIdEnv];
  if (!clientId) {
    console.error(`connector start: ${oauth.clientIdEnv} env missing`);
    return redirectWithError(req, "server");
  }

  // User ne jo scopes chune, unhe connector ki list se hi milaayenge (koi bahar ka scope nahi)
  const requestedIds = (req.nextUrl.searchParams.get("scopes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allIds = connector.scopes.map((s) => s.id);
  const chosen = requestedIds.filter((id) => allIds.includes(id));
  const scopeIds = chosen.length > 0 ? chosen : allIds;

  // State: CSRF se bachav. Verifier + challenge: PKCE, code chori hone par bhi kaam na aaye.
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());

  const redirectUri = new URL(
    `/api/connectors/${connector.id}/callback`,
    req.nextUrl.origin,
  ).toString();

  const authUrl = new URL(oauth.authorizeUrl);
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopeIds.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(oauth.extraAuthParams ?? {}),
  }).toString();

  const cookieStore = await cookies();
  cookieStore.set(
    OAUTH_COOKIE,
    JSON.stringify({ connectorId: connector.id, state, verifier, scopeIds }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/connectors",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  );

  return NextResponse.redirect(authUrl);
}