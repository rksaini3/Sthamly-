// Sthamly AI Worker — login token verification (Blueprint 3.0, section 6, step 2)
// Token ko Supabase Auth se server-side verify kiya jaata hai.
// Client ka bheja user id kabhi trust nahi hota; user id yahin se aata hai.
// Token kabhi log nahi hota.

import type { Env } from "./env";
import { ApiError } from "./errors";

export interface AuthUser {
  id: string;
  email: string | null;
}

const VERIFY_TIMEOUT_MS = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Authorization: Bearer <token> se token nikalta hai. Shape galat ho to null.
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !match[1]) return null;

  const token = match[1];
  // JWT mein teen parts hote hain, jo dot se alag hote hain. Jo bhi iske bahar ho, use yahin rok do.
  if (token.length > 4096 || token.split(".").length !== 3) return null;
  return token;
}

// Supabase Auth se token verify karta hai.
// - Token galat, expire ya revoke ho to 'unauthenticated'.
// - Supabase tak pahunch na paaye (timeout, network) to 'internal', kyunki yeh user ki galti nahi hai.
// Har failure par server log mein sirf event aur HTTP status jaata hai. Token ya body nahi.
export async function verifySupabaseUser(env: Env, token: string): Promise<AuthUser> {
  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: controller.signal,
    });
  } catch {
    console.error(JSON.stringify({ event: "auth_network_error" }));
    throw new ApiError("internal");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    console.error(JSON.stringify({ event: "auth_rejected", status: res.status }));
    throw new ApiError("unauthenticated");
  }
  if (!res.ok) {
    console.error(JSON.stringify({ event: "auth_upstream_error", status: res.status }));
    throw new ApiError("internal");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.error(JSON.stringify({ event: "auth_body_not_json" }));
    throw new ApiError("internal");
  }

  const user = body as { id?: unknown; email?: unknown } | null;
  if (!user || typeof user.id !== "string" || !UUID_RE.test(user.id)) {
    console.error(JSON.stringify({ event: "auth_bad_user_body" }));
    throw new ApiError("unauthenticated");
  }

  return {
    id: user.id.toLowerCase(),
    email: typeof user.email === "string" ? user.email : null,
  };
}

// Route ke shuru mein call hota hai. Ek hi function se token nikalna aur verify karna.
export async function authenticate(request: Request, env: Env): Promise<AuthUser> {
  const token = getBearerToken(request);
  if (!token) {
    throw new ApiError("unauthenticated");
  }
  return verifySupabaseUser(env, token);
}