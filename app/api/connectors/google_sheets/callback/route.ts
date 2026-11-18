import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { findConnector } from "@/lib/connectors/registry";
import { saveTokens } from "@/lib/connectors/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_ID = "google_sheets";
// Start route ye cookie set karega (state ka random value)
const STATE_COOKIE = "connector_oauth_state";
const TABLE_CONNECTIONS = "connector_connections";

function redirectWith(req: NextRequest, path: string, query?: Record<string, string>) {
  const url = new URL(path, req.nextUrl.origin);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const connector = findConnector(CONNECTOR_ID);
  if (!connector || !connector.oauth) {
    return redirectWith(req, "/voice", { connect_error: "not_found" });
  }

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const providerError = params.get("error");

  // Cookie ko ek hi baar use karte hain, chahe aage kuch bhi ho
  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  // User ne Google par "cancel" dabaya ho
  if (providerError) {
    return redirectWith(req, "/voice", { connect_error: "cancelled" });
  }

  // State match nahi hua to request kisi aur site se aayi ho sakti hai (CSRF)
  if (!code || !state || !savedState || state !== savedState) {
    return redirectWith(req, "/voice", { connect_error: "invalid_state" });
  }

  // Login user hi connect kar sakta hai
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return redirectWith(req, "/login", { next: "/voice" });
  }

  const oauth = connector.oauth;
  const clientId = process.env[oauth.clientIdEnv];
  const clientSecret = process.env[oauth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    console.error("connector callback: OAuth env variables missing");
    return redirectWith(req, "/voice", { connect_error: "server" });
  }

  // Redirect URI bilkul wahi hona chahiye jo start route ne bheja tha
  const redirectUri = new URL(oauth.redirectPath, req.nextUrl.origin).toString();

  // Authorization code ko access token se badlo
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
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token exchange status ${res.status}`);
    tokenBody = await res.json();
  } catch (error) {
    console.error("connector callback: token exchange failed", error);
    return redirectWith(req, "/voice", { connect_error: "exchange" });
  }

  // Google ka diya hua scope list ("a b c" format mein) hum store karte hain,
  // taaki baad mein tools sirf wahi chalayein jinki permission user ne di hai
  const grantedScopes = (tokenBody.scope ?? "").split(" ").filter(Boolean);
  const expiresAt = new Date(Date.now() + tokenBody.expires_in * 1000).toISOString();

  try {
    await saveTokens(userId, CONNECTOR_ID, {
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token ?? null,
      expiresAt,
    });
  } catch (error) {
    console.error("connector callback: token save failed", error);
    return redirectWith(req, "/voice", { connect_error: "save" });
  }

  // Connection ka status (token ke bina) save karte hain, taaki UI dikha sake
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error: connError } = await admin.from(TABLE_CONNECTIONS).upsert(
    {
      user_id: userId,
      connector_id: CONNECTOR_ID,
      status: "active",
      granted_scopes: grantedScopes,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,connector_id" },
  );
  if (connError) {
    console.error("connector callback: connection save failed", connError);
    return redirectWith(req, "/voice", { connect_error: "save" });
  }

  return redirectWith(req, "/voice", { connected: CONNECTOR_ID });
}