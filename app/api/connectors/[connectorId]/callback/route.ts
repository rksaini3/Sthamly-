import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findConnector } from "@/lib/connectors/registry";
import { saveTokens } from "@/lib/connectors/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start route wali cookie se bilkul same naam aur path
const OAUTH_COOKIE = "connector_oauth";
const OAUTH_COOKIE_PATH = "/api/connectors";
const TABLE_CONNECTIONS = "connector_connections";

// Cookie ke andar start route ne jo rakha tha, uska shape
const oauthCookieSchema = z.object({
  connectorId: z.string(),
  state: z.string().min(10),
  verifier: z.string().min(40),
  scopeIds: z.array(z.string()).min(1),
});

function redirectTo(req: NextRequest, path: string, query?: Record<string, string>) {
  const url = new URL(path, req.nextUrl.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
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

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(OAUTH_COOKIE)?.value;
  // Cookie ek hi baar use hogi, chahe aage kuch bhi ho (replay se bachav)
  cookieStore.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });

  const params_ = req.nextUrl.searchParams;
  const code = params_.get("code");
  const state = params_.get("state");

  // User ne provider par "cancel" dabaya
  if (params_.get("error")) {
    return redirectTo(req, "/voice", { connect_error: "cancelled" });
  }

  // Cookie hi nahi hai ya kharab hai
  if (!rawCookie) {
    return redirectTo(req, "/voice", { connect_error: "invalid_state" });
  }
  let saved: z.infer<typeof oauthCookieSchema>;
  try {
    const parsed = oauthCookieSchema.safeParse(JSON.parse(rawCookie));
    if (!parsed.success) throw new Error("cookie shape galat hai");
    saved = parsed.data;
  } catch {
    return redirectTo(req, "/voice", { connect_error: "invalid_state" });
  }

  // State aur connector dono match hone chahiye (CSRF aur galat connector se bachav)
  if (!code || !state || saved.connectorId !== connector.id || state !== saved.state) {
    return redirectTo(req, "/voice", { connect_error: "invalid_state" });
  }

  // Login user hi connect kar sakta hai
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return redirectTo(req, "/login", { next: "/voice" });
  }

  const oauth = connector.oauth;
  const clientId = process.env[oauth.clientIdEnv];
  const clientSecret = process.env[oauth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    console.error(`connector callback: ${oauth.clientIdEnv} ya secret env missing`);
    return redirectTo(req, "/voice", { connect_error: "server" });
  }

  // Redirect URI bilkul wahi hona chahiye jo start route ne bheja tha
  const redirectUri = new URL(
    `/api/connectors/${connector.id}/callback`,
    req.nextUrl.origin,
  ).toString();

  // Code ko token se badlo, PKCE verifier ke saath
  let tokenBody: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  try {
    const res = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token exchange status ${res.status}`);
    tokenBody = await res.json();
  } catch (error) {
    console.error("connector callback: token exchange failed", error);
    return redirectTo(req, "/voice", { connect_error: "exchange" });
  }

  // Provider jo scopes sach mein de, wahi save karte hain (user ne jo chuna, usse alag ho sakta hai)
  const grantedScopes = tokenBody.scope
    ? tokenBody.scope.split(" ").filter(Boolean)
    : saved.scopeIds;
  const expiresAt = new Date(Date.now() + tokenBody.expires_in * 1000).toISOString();

  try {
    await saveTokens(userId, connector.id, {
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token ?? null,
      expiresAt,
    });
  } catch (error) {
    console.error("connector callback: token save failed", error);
    return redirectTo(req, "/voice", { connect_error: "save" });
  }

  // Connection ka status (bina token ke) save karte hain, taaki UI aur tool filter use kar sakein
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error: connError } = await admin.from(TABLE_CONNECTIONS).upsert(
    {
      user_id: userId,
      connector_id: connector.id,
      status: "active",
      granted_scopes: grantedScopes,
      updated_at: now,
    },
    { onConflict: "user_id,connector_id" },
  );
  if (connError) {
    console.error("connector callback: connection save failed", connError);
    return redirectTo(req, "/voice", { connect_error: "save" });
  }

  return redirectTo(req, "/voice", { connected: connector.id });
}