import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

// यह test असली Postgres (PGlite) में migrations चलाकर credit के नियम जांचता है।
// usage_ledger की बेस migration (0001/0002) अभी repo में नहीं है, इसलिए test उसका न्यूनतम ढांचा खुद बनाता है।

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const migration = (name: string) => readFileSync(path.join(MIGRATIONS, name), "utf8");

const BASE_LEDGER = `
  create table public.usage_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    delta int not null,
    reason text not null,
    job_id uuid,
    created_at timestamptz not null default now()
  );
`;

const ROLES = `
  do $$ begin
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
  exception when duplicate_object then null; end $$;
`;

const USER = "11111111-1111-1111-1111-111111111111";
const JOB_A = "22222222-2222-2222-2222-222222222222";
const JOB_B = "33333333-3333-3333-3333-333333333333";
const JOB_C = "44444444-4444-4444-4444-444444444444";

const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const EARLIER = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(ROLES);
  await db.exec(BASE_LEDGER);
  await db.exec(migration("0004_credits.sql"));
  await db.exec(migration("0009_reserve_credits_v2.sql"));
});

async function reserve(opts: {
  job: string;
  poster?: number;
  reel?: number;
  posterLimit: number;
  reelLimit?: number;
  posterSince?: string;
  reelSince?: string;
}) {
  const { rows } = await db.query<{ result: { allowed: boolean; remaining: { poster: number; reel: number } } }>(
    `select public.reserve_credits_v2($1, $2, $3, $4, $5, $6, $7, $8) as result`,
    [
      USER,
      opts.job,
      opts.poster ?? 1,
      opts.reel ?? 0,
      opts.posterLimit,
      opts.reelLimit ?? 0,
      opts.posterSince ?? EARLIER,
      opts.reelSince ?? EARLIER,
    ],
  );
  return rows[0]!.result;
}

describe.skip("reserve_credits_v2", () => {
  it("पहला poster तब मिलता है जब कोटा बचा हो, और remaining सही लौटता है", async () => {
    const r = await reserve({ job: JOB_A, posterLimit: 3 });
    expect(r.allowed).toBe(true);
    expect(r.remaining.poster).toBe(2);
  });

  it("कोटा खत्म होने पर अनुमति नहीं, और कोई ledger row नहीं लिखी जाती", async () => {
    await reserve({ job: JOB_A, posterLimit: 1 });
    const second = await reserve({ job: JOB_B, posterLimit: 1 });
    expect(second.allowed).toBe(false);
    expect(second.remaining.poster).toBe(0);

    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.usage_ledger where job_id = $1`, [JOB_B]);
    expect(rows[0]!.n).toBe(0);
  });

  it("विंडो से पुराना खर्च नहीं गिना जाता (poster और reel अलग-अलग)", async () => {
    // पुराना खर्च (48 घंटे पहले): आज की विंडो में नहीं गिना जाना चाहिए
    await db.query(
      `insert into public.usage_ledger (user_id, delta, reason, job_id, kind, created_at)
       values ($1, -3, 'reserve', $2, 'poster', $3)`,
      [USER, JOB_C, EARLIER],
    );
    const r = await reserve({ job: JOB_A, posterLimit: 3, posterSince: DAY_AGO });
    expect(r.allowed).toBe(true);
    expect(r.remaining.poster).toBe(2);
  });

  it("refund के बाद कोटा वापस मिलता है, और refund दो बार नहीं होता", async () => {
    await reserve({ job: JOB_A, posterLimit: 1 });
    const first = await db.query<{ n: number }>(`select public.refund_job_credits($1)::int as n`, [JOB_A]);
    expect(first.rows[0]!.n).toBe(1);
    const again = await db.query<{ n: number }>(`select public.refund_job_credits($1)::int as n`, [JOB_A]);
    expect(again.rows[0]!.n).toBe(0);

    const r = await reserve({ job: JOB_B, posterLimit: 1 });
    expect(r.allowed).toBe(true);
  });

  it("reel की सीमा 0 हो और reel न मांगा जाए, तो reserve चलता है", async () => {
    const r = await reserve({ job: JOB_A, poster: 1, reel: 0, posterLimit: 3, reelLimit: 0 });
    expect(r.allowed).toBe(true);
    expect(r.remaining.reel).toBe(0);
  });

  it("anon और authenticated role को function चलाने की अनुमति नहीं", async () => {
    await expect(
      db.exec(`set role authenticated; select public.reserve_credits_v2('${USER}', '${JOB_A}', 1, 0, 3, 0, now(), now());`),
    ).rejects.toThrow();
    await db.exec("reset role");
  });
});