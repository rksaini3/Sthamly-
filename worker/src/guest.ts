// Sthamly AI Worker: guest mode (login se pehle kuch messages)
// Guest ko login ke bina chat karne diya jaata hai, lekin limit ke saath.
// Do counters: guestId (browser ka) aur hashed IP (network ka). Dono mein se koi bhi limit paar kare to rok.
// Counters KV mein hain, din ke hisaab se (UTC). Guest ki chat database mein save nahi hoti.
// IP kabhi plain text mein store nahi hota: sirf TOKEN_ENCRYPTION_KEY ke saath SHA-256 hash.

import type { Env } from "./env";
import { ApiError } from "./errors";

// Guest ke liye limits. Open decisions hain, yahin badalna.
export const GUEST_MESSAGES_PER_DAY = 3;
export const GUEST_IP_MESSAGES_PER_DAY = 15;

// Counter 2 din tak rahega, taaki din badalne par purana kachra apne-aap khatam ho.
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuestIdentity {
  guestId: string;
  ipHash: string;
}

// Aaj ka din UTC mein, jaise 2026-11-19.
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// SHA-256 hex. Salt ke taur par TOKEN_ENCRYPTION_KEY, taaki IP ka hash bahar se pehchana na jaaye.
async function hashWithSalt(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Request se guest ki pehchan. Guest ID header mein hona zaroori hai, warna guest nahi maana jaata.
export async function identifyGuest(request: Request, env: Env): Promise<GuestIdentity> {
  const guestId = request.headers.get("X-Guest-Id");
  if (guestId === null || !UUID_RE.test(guestId)) {
    throw new ApiError("unauthenticated", "आगे बात जारी रखने के लिए लॉग-इन करें।");
  }

  // Cloudflare har request mein asli client IP deta hai. Na mile to "unknown" (sab ek saath ginte hain).
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashWithSalt(ip.toLowerCase(), env.TOKEN_ENCRYPTION_KEY);

  return { guestId: guestId.toLowerCase(), ipHash };
}

// KV se ek counter padhta hai. Na ho ya galat ho to 0.
async function readCounter(env: Env, key: string): Promise<number> {
  const raw = await env.STATE.get(key);
  const n = Number(raw ?? "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Guest ka ek message reserve karta hai. Limit paar ho to 'unauthenticated' (login maango).
// Ye counter request accept hote hi badhta hai, provider fail ho to bhi. Ye jaan-boojh kar sahi hai:
// guest ko bar-bar retry karke limit bypass nahi karne dena.
export async function reserveGuestMessage(
  env: Env,
  identity: GuestIdentity,
  now: Date = new Date(),
): Promise<{ remaining: number }> {
  const day = utcDay(now);
  const guestKey = `guest:${day}:id:${identity.guestId}`;
  const ipKey = `guest:${day}:ip:${identity.ipHash}`;

  const [guestCount, ipCount] = await Promise.all([
    readCounter(env, guestKey),
    readCounter(env, ipKey),
  ]);

  if (guestCount >= GUEST_MESSAGES_PER_DAY || ipCount >= GUEST_IP_MESSAGES_PER_DAY) {
    throw new ApiError(
      "unauthenticated",
      "आज के मुफ़्त संदेश खत्म हो गए हैं। आगे बात जारी रखने के लिए लॉग-इन करें।",
    );
  }

  await Promise.all([
    env.STATE.put(guestKey, String(guestCount + 1), { expirationTtl: COUNTER_TTL_SECONDS }),
    env.STATE.put(ipKey, String(ipCount + 1), { expirationTtl: COUNTER_TTL_SECONDS }),
  ]);

  return { remaining: Math.max(0, GUEST_MESSAGES_PER_DAY - (guestCount + 1)) };
}