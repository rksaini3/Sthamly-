// Sthamly AI Worker: RLS isolation test (Blueprint 3.0, section 8)
// Ye test SIRF dev Supabase project par chalana hai. Production par kabhi nahi.
// Teen env vars chahiye: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY.
// Nahi hain to poora suite skip hota hai, taaki CI bina secrets ke fail na ho.
// Test do temporary users banata hai, data seed karta hai, aur afterAll mein dono users hata deta hai
// (conversations, messages, profile, subscription, usage cascade se saath jaate hain).

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_BASE = (process.env.TEST_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ANON = process.env.TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = URL_BASE !== "" && ANON !== "" && SERVICE !== "";
const SCHEMA = "sthamly_v3";
const TEST_PASSWORD = "Rls-test-pass-12345!";

interface Res {
  ok: boolean;
  status: number;
  json: unknown;
}

// Ek HTTP call. apikey aur Authorization caller decide karta hai.
// profile=true ho to sthamly_v3 schema par jaata hai (PostgREST headers).
async function call(
  method: string,
  path: string,
  opts: {
    apikey: string;
    token: string;
    body?: unknown;
    prefer?: string;
    profile?: boolean;
  },
): Promise<Res> {
  const headers: Record<string, string> = {
    apikey: opts.apikey,
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/json",
  };
  if (opts.profile !== false) {
    headers["Accept-Profile"] = SCHEMA;
    headers["Content-Profile"] = SCHEMA;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.prefer) headers.Prefer = opts.prefer;

  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

// User ke token se call (RLS ke andar).
const asUser = (token: string, method: string, path: string, body?: unknown, prefer?: string) =>
  call(method, path, { apikey: ANON, token, body, prefer });

// Service role se call (RLS bypass, sirf seed aur cleanup ke liye).
const asService = (method: string, path: string, body?: unknown, prefer?: string) =>
  call(method, path, { apikey: SERVICE, token: SERVICE, body, prefer });

// "Koi row nahi" ka matlab: request theek gayi, aur data khaali aaya.
function expectNoRows(res: Res): void {
  expect(res.ok).toBe(true);
  expect(res.json).toEqual([]);
}

// Request ka denied hona: 401, 403 ya error. Data kuch bhi nahi.
function expectDenied(res: Res): void {
  expect(res.ok).toBe(false);
}

async function createUser(email: string): Promise<string> {
  const res = await call("POST", "/auth/v1/admin/users", {
    apikey: SERVICE,
    token: SERVICE,
    body: { email, password: TEST_PASSWORD, email_confirm: true },
    profile: false,
  });
  if (!res.ok) throw new Error(`createUser failed: ${res.status}`);
  return (res.json as { id: string }).id;
}

async function signIn(email: string): Promise<string> {
  const res = await call("POST", "/auth/v1/token?grant_type=password", {
    apikey: ANON,
    token: ANON,
    body: { email, password: TEST_PASSWORD },
    profile: false,
  });
  if (!res.ok) throw new Error(`signIn failed: ${res.status}`);
  return (res.json as { access_token: string }).access_token;
}

async function deleteUser(id: string): Promise<void> {
  await call("DELETE", `/auth/v1/admin/users/${id}`, {
    apikey: SERVICE,
    token: SERVICE,
    profile: false,
  });
}

describe.skipIf(!ENABLED)("RLS: user isolation (sthamly_v3)", () => {
  const stamp = Date.now();
  const emailA = `rls-a-${stamp}@example.com`;
  const emailB = `rls-b-${stamp}@example.com`;

  let idA = "";
  let idB = "";
  let tokenA = "";
  let tokenB = "";
  let convA = "";

  beforeAll(async () => {
    idA = await createUser(emailA);
    idB = await createUser(emailB);
    tokenA = await signIn(emailA);
    tokenB = await signIn(emailB);

    // Seed: service role se, RLS ke bahar.
    await asService("POST", "/rest/v1/profiles", [{ user_id: idA }, { user_id: idB }]);
    await asService("POST", "/rest/v1/subscriptions", [
      { user_id: idA, plan: "free", status: "active" },
    ]);

    const conv = await asService("POST", "/rest/v1/conversations", [
      { user_id: idA, title: "A ki private baat" },
    ], "return=representation");
    convA = (conv.json as Array<{ id: string }>)[0]!.id;

    await asService("POST", "/rest/v1/messages", [
      { conversation_id: convA, role: "user", content: "A ka private message" },
    ]);

    await asService("POST", "/rest/v1/usage_logs", [
      {
        user_id: idA,
        request_id: `rls-test-${stamp}`,
        feature: "chat",
        provider: "groq",
        model: "test-model",
        input_tokens: 1,
        output_tokens: 1,
        estimated_cost_inr: 0,
      },
    ]);
  });

  afterAll(async () => {
    if (idA) await deleteUser(idA);
    if (idB) await deleteUser(idB);
  });

  // ---- Positive control: test galat tarike se pass na ho (sab kuch band hone par bhi pass na ho) ----

  it("owner A apni conversation padh sakta hai", async () => {
    const res = await asUser(tokenA, "GET", `/rest/v1/conversations?id=eq.${convA}&select=id,title`);
    expect(res.ok).toBe(true);
    expect((res.json as unknown[]).length).toBe(1);
  });

  it("owner A apne messages padh sakta hai", async () => {
    const res = await asUser(tokenA, "GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=content`);
    expect(res.ok).toBe(true);
    expect((res.json as unknown[]).length).toBe(1);
  });

  // ---- B, A ka data padhne ki koshish karta hai ----

  it("B, A ki conversation nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", `/rest/v1/conversations?id=eq.${convA}&select=id,title`);
    expectNoRows(res);
  });

  it("B, A ke messages nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=content`);
    expectNoRows(res);
  });

  it("B, A ki subscription nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", `/rest/v1/subscriptions?user_id=eq.${idA}&select=plan`);
    expectNoRows(res);
  });

  it("B, A ka usage nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", `/rest/v1/usage_logs?user_id=eq.${idA}&select=request_id`);
    expectNoRows(res);
  });

  it("B, A ka profile nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", `/rest/v1/profiles?user_id=eq.${idA}&select=display_name`);
    expectNoRows(res);
  });

  // ---- B, A ka data badalne ya hatane ki koshish karta hai ----

  it("B, A ki conversation ka title nahi badal sakta, aur title waisa hi rehta hai", async () => {
    const res = await asUser(tokenB, "PATCH", `/rest/v1/conversations?id=eq.${convA}`, {
      title: "hacked",
    }, "return=representation");
    expectNoRows(res);

    const check = await asService("GET", `/rest/v1/conversations?id=eq.${convA}&select=title`);
    expect((check.json as Array<{ title: string }>)[0]?.title).toBe("A ki private baat");
  });

  it("B, A ki conversation delete nahi kar sakta, aur woh zinda rehti hai", async () => {
    const res = await asUser(tokenB, "DELETE", `/rest/v1/conversations?id=eq.${convA}`, undefined, "return=representation");
    expectNoRows(res);

    const check = await asService("GET", `/rest/v1/conversations?id=eq.${convA}&select=id`);
    expect((check.json as unknown[]).length).toBe(1);
  });

  it("B, A ke messages delete nahi kar sakta", async () => {
    const res = await asUser(tokenB, "DELETE", `/rest/v1/messages?conversation_id=eq.${convA}`, undefined, "return=representation");
    expectNoRows(res);
  });

  it("B, A ke profile ko badal nahi sakta", async () => {
    const res = await asUser(tokenB, "PATCH", `/rest/v1/profiles?user_id=eq.${idA}`, {
      display_name: "hacked",
    }, "return=representation");
    expectNoRows(res);
  });

  it("B, A ki subscription (plan) nahi badal sakta", async () => {
    const res = await asUser(tokenB, "PATCH", `/rest/v1/subscriptions?user_id=eq.${idB}`, {
      plan: "pro",
    }, "return=representation");
    expectDenied(res);
  });

  // ---- B, A ke naam se ya apne liye galat data likhne ki koshish karta hai ----

  it("B, A ke user_id se conversation nahi bana sakta", async () => {
    const res = await asUser(tokenB, "POST", "/rest/v1/conversations", [
      { user_id: idA, title: "fake" },
    ], "return=representation");
    expectDenied(res);
  });

  it("B, A ke naam se message nahi likh sakta", async () => {
    const res = await asUser(tokenB, "POST", "/rest/v1/messages", [
      { conversation_id: convA, role: "user", content: "fake" },
    ]);
    expectDenied(res);
  });

  it("client usage_logs mein row nahi likh sakta (paisa sirf Worker likhta hai)", async () => {
    const res = await asUser(tokenB, "POST", "/rest/v1/usage_logs", [
      {
        user_id: idB,
        request_id: `fake-${stamp}`,
        feature: "chat",
        provider: "groq",
        model: "x",
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_inr: 0,
      },
    ]);
    expectDenied(res);
  });

  it("client model_registry nahi padh sakta", async () => {
    const res = await asUser(tokenB, "GET", "/rest/v1/model_registry?select=id");
    expectDenied(res);
  });

  it("client user_tokens_today RPC nahi chala sakta", async () => {
    const res = await asUser(tokenB, "POST", "/rest/v1/rpc/user_tokens_today", { p_user: idA });
    expectDenied(res);
  });

  // ---- Bina login (anon key) ----

  it("bina login (anon) profiles nahi padh sakta", async () => {
    const res = await call("GET", "/rest/v1/profiles?select=user_id", {
      apikey: ANON,
      token: ANON,
    });
    expectDenied(res);
  });
});