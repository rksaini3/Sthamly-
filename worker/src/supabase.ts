// Sthamly AI Worker — Supabase REST helper (Blueprint 3.0, section 8)
// Worker service role se likhta/padhta hai. Client ko ye key kabhi nahi milti.
// Har query sthamly_v3 schema par jaati hai (Accept-Profile / Content-Profile headers).
// Errors ka raw text kabhi client tak nahi jaata: yahan se ApiError banta hai.

import type { Env } from "./env";
import { ApiError } from "./errors";

const SCHEMA = "sthamly_v3";
const TIMEOUT_MS = 8_000;

export interface SupabaseClient {
  select<T>(table: string, query: string): Promise<T[]>;
  insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[], opts?: { upsert?: boolean; onConflict?: string }): Promise<T[]>;
  update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]>;
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export function createSupabase(env: Env): SupabaseClient {
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  // Ek request bhejta hai. Non-2xx par ApiError, aur raw body log ke liye sirf server par.
  async function call<T>(
    path: string,
    init: { method: string; body?: unknown; prefer?: string; schemaHeader?: boolean },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.prefer) headers.Prefer = init.prefer;
    if (init.schemaHeader !== false) {
      // Read aur write dono ke liye schema header (PostgREST ke liye)
      headers["Accept-Profile"] = SCHEMA;
      headers["Content-Profile"] = SCHEMA;
    }

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("internal");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Raw response text log ke liye nahi, kyunki usme row data ho sakta hai (blueprint 11).
      throw new ApiError("internal");
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    select<T>(table: string, query: string): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}?${query}`, { method: "GET" });
    },

    insert<T>(
      table: string,
      rows: Record<string, unknown> | Record<string, unknown>[],
      opts?: { upsert?: boolean; onConflict?: string },
    ): Promise<T[]> {
      const params = opts?.onConflict ? `?on_conflict=${encodeURIComponent(opts.onConflict)}` : "";
      const prefer = opts?.upsert
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation";
      return call<T[]>(`/rest/v1/${table}${params}`, { method: "POST", body: rows, prefer });
    },

    update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        body: patch,
        prefer: "return=representation",
      });
    },

    rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      // Function bhi sthamly_v3 mein hai, isliye schema header zaroori hai.
      return call<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: args });
    },
  };
}