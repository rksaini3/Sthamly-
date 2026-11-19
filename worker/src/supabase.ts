// Sthamly AI Worker — Supabase REST helper (Blueprint 3.0, section 8)
// Worker service role se likhta/padhta hai. Client ko ye key kabhi nahi milti.
// Har query sthamly_v3 schema par jaati hai (Accept-Profile / Content-Profile headers).
// Errors ka raw text kabhi client tak nahi jaata, aur log mein row data nahi jaata.

import type { Env } from "./env";
import { ApiError } from "./errors";

const SCHEMA = "sthamly_v3";
const TIMEOUT_MS = 8_000;

export interface InsertOptions {
  // Conflict par kya ho: 'merge' existing row ko badalta hai, 'ignore' use chhod deta hai.
  onConflict?: string;
  conflict?: "merge" | "ignore";
}

export interface SupabaseClient {
  select<T>(table: string, query: string): Promise<T[]>;
  insert<T>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: InsertOptions,
  ): Promise<T[]>;
  update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]>;
  delete<T>(table: string, query: string): Promise<T[]>;
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export function createSupabase(env: Env): SupabaseClient {
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  // Ek request bhejta hai. Non-2xx par ApiError. Raw body kahin log nahi hoti.
  async function call<T>(
    path: string,
    init: { method: string; body?: unknown; prefer?: string },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      // Har query sthamly_v3 par. Purane public tables is path se nahi chhoote jaate.
      "Accept-Profile": SCHEMA,
      "Content-Profile": SCHEMA,
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.prefer) headers.Prefer = init.prefer;

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
      // Status code bhi sirf server logs mein jayega (observability file mein). Body nahi.
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
      opts?: InsertOptions,
    ): Promise<T[]> {
      const params = opts?.onConflict
        ? `?on_conflict=${encodeURIComponent(opts.onConflict)}`
        : "";

      // conflict "ignore": existing row kabhi nahi badalti (profile ke liye).
      // conflict "merge": existing row ko naye values se badalta hai.
      // Koi conflict option na ho to plain insert: duplicate par error.
      let resolution = "";
      if (opts?.conflict === "ignore") resolution = "resolution=ignore-duplicates,";
      if (opts?.conflict === "merge") resolution = "resolution=merge-duplicates,";

      return call<T[]>(`/rest/v1/${table}${params}`, {
        method: "POST",
        body: rows,
        prefer: `${resolution}return=representation`,
      });
    },

    update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        body: patch,
        prefer: "return=representation",
      });
    },

    delete<T>(table: string, query: string): Promise<T[]> {
      // Query mein hamesha id aur user_id dono hone chahiye (caller ki zimmedari).
      return call<T[]>(`/rest/v1/${table}?${query}`, {
        method: "DELETE",
        prefer: "return=representation",
      });
    },

    rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      return call<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: args });
    },
  };
}