import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Connector, ConnectorToolContext } from "@/lib/connectors/types";

// Token table ka naam (migration 0007 mein banega)
const TABLE = "connector_tokens";
// Expiry se 60 second pehle hi refresh karenge, taaki call beech mein expire na ho
const REFRESH_MARGIN_MS = 60_000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  // ISO time string, kab access token expire hoga
  expiresAt: string;
}

// ---- Encryption ----
// Key server ke env mein hogi: CONNECTOR_TOKEN_KEY (32 bytes ka base64 string).
// Key database mein kabhi nahi jaayegi, isliye DB leak hone par bhi token nahi khulenge.

function encryptionKey(): Buffer {
  const raw = process.env.CONNECTOR_TOKEN_KEY;
  if (!raw) throw new Error("CONNECTOR_TOKEN_KEY env variable set nahi hai");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CONNECTOR_TOKEN_KEY 32 bytes ka hona chahiye");
  return key;
}

interface Encrypted {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encrypt(plain: string): Encrypted {
  const iv = randomBytes(12); // GCM ke liye 12 bytes ka IV, har baar naya
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(enc: Encrypted): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(enc.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

// ---- Save and load ----

/** Token ko encrypt karke save (ya update) karta hai. Pehle se hai to overwrite. */
export async function saveTokens(
  userId: string,
  connectorId: string,
  tokens: StoredTokens,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const encAccess = encrypt(tokens.accessToken);
  const encRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      access_ciphertext: encAccess.ciphertext,
      access_iv: encAccess.iv,
      access_tag: encAccess.tag,
      refresh_ciphertext: encRefresh?.ciphertext ?? null,
      refresh_iv: encRefresh?.iv ?? null,
      refresh_tag: encRefresh?.tag ?? null,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw new Error("Token save nahi ho paya");
}

/** Database se token padhkar decrypt karta hai. Nahi mila to null. */
async function loadTokens(
  userId: string,
  connectorId: string,
): Promise<StoredTokens | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select(
      "access_ciphertext, access_iv, access_tag, refresh_ciphertext, refresh_iv, refresh_tag, expires_at",
    )
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();

  if (error) throw new Error("Token load nahi ho paya");
  if (!data) return null;

  return {
    accessToken: decrypt({
      ciphertext: data.access_ciphertext,
      iv: data.access_iv,
      tag: data.access_tag,
    }),
    refreshToken:
      data.refresh_ciphertext && data.refresh_iv && data.refresh_tag
        ? decrypt({
            ciphertext: data.refresh_ciphertext,
            iv: data.refresh_iv,
            tag: data.refresh_tag,
          })
        : null,
    expiresAt: data.expires_at,
  };
}

/** Connection hatane par token bhi hata dete hain. */
export async function deleteTokens(userId: string, connectorId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw new Error("Token hata nahi paya");
}

// ---- Refresh ----

async function refreshAccessToken(
  connector: Connector,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const oauth = connector.oauth;
  if (!oauth) throw new Error("Connector mein OAuth config nahi hai");

  const clientId = process.env[oauth.clientIdEnv];
  const clientSecret = process.env[oauth.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error("OAuth client env variables set nahi hain");

  const res = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("Token refresh nahi ho paya");

  const body = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

// ---- Public: tool ke liye valid access token ----

/**
 * Tool ko hamesha ek valid access token mile.
 * Token expire hone wala ho to refresh token se naya le kar save karta hai.
 * Token kabhi model ya user ko nahi dikhta, sirf tool ke andar use hota hai.
 */
export async function getValidAccessToken(
  connector: Connector,
  userId: string,
): Promise<string> {
  const stored = await loadTokens(userId, connector.id);
  if (!stored) throw new Error("Connector connected nahi hai");

  const expiresAt = new Date(stored.expiresAt).getTime();
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return stored.accessToken;
  }

  if (!stored.refreshToken) throw new Error("Refresh token nahi hai, dobara connect karein");

  const fresh = await refreshAccessToken(connector, stored.refreshToken);
  await saveTokens(userId, connector.id, {
    accessToken: fresh.accessToken,
    // Google refresh token dobara nahi deta, isliye purana hi rakhte hain
    refreshToken: stored.refreshToken,
    expiresAt: fresh.expiresAt,
  });
  return fresh.accessToken;
}

/** Tool context banata hai jisme getAccessToken already is user aur connector se bandha ho. */
export function buildToolContext(
  connector: Connector,
  userId: string,
  lang: ConnectorToolContext["lang"],
): ConnectorToolContext {
  return {
    userId,
    lang,
    getAccessToken: () => getValidAccessToken(connector, userId),
  };
}