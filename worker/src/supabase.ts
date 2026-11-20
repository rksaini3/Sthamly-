// Sthamly AI Worker — Supabase REST helper (Blueprint 3.0, section 8)
// Worker service role se likhta/padhta hai. Client ko ye key kabhi nahi milti.
// Har query sthamly_v3 schema par jaati hai (Accept-Profile / Content-Profile headers).
// Errors ka raw text kabhi client tak nahi jaata, aur log mein row data nahi jaata.
// Log mein sirf: method, path (query ke bina), status, Postgres/PostgREST code, error ka type aur time.

import type { Env } from "./env";
import { ApiError } from "./errors";

const SCHEMA = "sthamly_v3";
const TIMEOUT_MS = 8_000;

// Postgres / PostgREST codes ko type ke naam se badalte hain, taaki log padhna aasan ho.
// Yeh sirf type batata hai, koi data nahi.
const PG_ERROR_KIND: Record<string, string> = {
  PGRST202: "function_missing",
  "42883": "function_missing",
  PGRST205: "table_missing",
  "42P01": "table_missing",
  PGRST204: "column_missing",
  "42703": "column_missing",
  "42501": "permission_denied",
  "23505": "unique_violation",
  "23503": "fk_violation",
  "22P02": "bad_input",
};

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

// HTTP status aur Postgres code se error ka type tay karta hai. Koi data nahi.
function classifyError(status: number, pgCode: string | null): string {
  if (pgCode !== null && PG_ERROR_KIND[pgCode] !== undefined) return PG_ERROR_KIND[pgCode];
  if (status === 401 || status === 403) return "auth_or_permission";
  if (status === 404) return "not_found";
  if (status >= 500) return "upstream_5xx";
  return "other";
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
    const startedAt = Date.now();
    const shortPath = path.split("?")[0];

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
    } catch (err) {
      // Timeout (AbortController) ya network ki gadbad: dono ka type alag log hota hai.
      const name = err instanceof Error ? err.name : "unknown";
      console.error(
        JSON.stringify({
          event: "supabase_network_error",
          method: init.method,
          path: shortPath,
          error_kind: name === "AbortError" ? "timeout" : "network",
          elapsed_ms: Date.now() - startedAt,
        }),
      );
      throw new ApiError("internal");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Server logs mein sirf status, table path, Postgres code aur error ka type jaata hai.
      // Row data, column values ya poori body kabhi nahi.
      let pgCode: string | null = null;
      try {
        const errBody = (await res.json()) as { code?: unknown };
        pgCode = typeof errBody.code === "string" ? errBody.code : null;
      } catch {
        pgCode = null;
      }
      console.error(
        JSON.stringify({
          event: "supabase_error",
          method: init.method,
          status: res.status,
          pg_code: pgCode,
          error_kind: classifyError(res.status, pgCode),
          path: shortPath,
          elapsed_ms: Date.now() - startedAt,
        }),
      );
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