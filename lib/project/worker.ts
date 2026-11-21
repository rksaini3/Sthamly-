// Sthamly: Next app से Worker के /api/project को बुलाने का एक ही रास्ता।
// Worker का URL और user की login token सिर्फ़ server पर रहते हैं; browser सीधे Worker को नहीं बुलाता।
// Worker खुद token verify करता है और user id वहीं से लेता है, इसलिए यहाँ user id नहीं भेजते।

import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// एक step (खासकर slides) में समय लग सकता है, इसलिए timeout लंबा।
const WORKER_TIMEOUT_MS = 110_000;

// Login user का access token। User न हो तो null।
export async function getUserAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function unauthorized(): Response {
  return jsonResponse({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, 401);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Worker /api/project{path} को बुलाता है और उसका जवाब (status और body) वैसे ही लौटाता है।
export async function callProjectApi(opts: {
  token: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<Response> {
  const base = getServerEnv().WORKER_API_URL;
  if (!base) {
    return jsonResponse(
      { error: { code: "UNAVAILABLE", message: "यह सुविधा अभी उपलब्ध नहीं है" } },
      503,
    );
  }

  const url = `${base.replace(/\/+$/, "")}/api/project${opts.path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return jsonResponse(
      { error: { code: "UPSTREAM_FAILED", message: "सर्वर से संपर्क नहीं हो पाया। थोड़ी देर बाद दोबारा कोशिश करें।" } },
      502,
    );
  }

  // Worker का जवाब वैसे ही भेजो। Log या body में कुछ नहीं जोड़ते।
  const text = await res.text();
  return jsonResponse(safeJson(text), res.status);
}

// Worker का जवाब JSON न हो तो भी ऐप न टूटे।
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: "UPSTREAM_FAILED", message: "सर्वर का जवाब समझ नहीं आया" } };
  }
}