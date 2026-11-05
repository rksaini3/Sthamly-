-- Sthamly: credit का हिसाब (Phase 1)
-- नियम:
--   reserve  → delta negative (जैसे -1)
--   refund   → delta positive (+1), सिर्फ विफल job के लिए
--   इस्तेमाल = उस period में -sum(delta)
-- Credit की सीमा (limit) कोड में है (lib/quota.ts), ताकि प्लान बदलना आसान रहे।

-- 1. usage_ledger में credit का प्रकार (पोस्टर या रील)
alter table public.usage_ledger
  add column if not exists kind text check (kind in ('poster', 'reel'));

create index if not exists usage_ledger_job_idx on public.usage_ledger (job_id);

-- 2. इस्तेमाल की गिनती (एक user, एक प्रकार, एक period के लिए)
create or replace function public.credit_used(
  p_user uuid,
  p_kind text,
  p_since timestamptz
) returns int
language sql
stable
set search_path = public
as $$
  select coalesce(-sum(delta), 0)::int
  from public.usage_ledger
  where user_id = p_user
    and kind = p_kind
    and created_at >= p_since;
$$;

-- 3. Atomic reserve: जांच और लिखना एक transaction में।
--    advisory lock से एक user के दो requests एक साथ credit नहीं खा सकते।
create or replace function public.reserve_credits(
  p_user uuid,
  p_job uuid,
  p_poster_need int,
  p_reel_need int,
  p_poster_limit int,
  p_reel_limit int,
  p_since timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster_used int;
  v_reel_used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  v_poster_used := public.credit_used(p_user, 'poster', p_since);
  v_reel_used := public.credit_used(p_user, 'reel', p_since);

  if v_poster_used + p_poster_need > p_poster_limit
     or v_reel_used + p_reel_need > p_reel_limit then
    return jsonb_build_object(
      'allowed', false,
      'remaining', jsonb_build_object(
        'poster', greatest(p_poster_limit - v_poster_used, 0),
        'reel', greatest(p_reel_limit - v_reel_used, 0)
      )
    );
  end if;

  if p_poster_need > 0 then
    insert into public.usage_ledger (user_id, delta, reason, job_id, kind)
    values (p_user, -p_poster_need, 'reserve', p_job, 'poster');
  end if;

  if p_reel_need > 0 then
    insert into public.usage_ledger (user_id, delta, reason, job_id, kind)
    values (p_user, -p_reel_need, 'reserve', p_job, 'reel');
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', jsonb_build_object(
      'poster', p_poster_limit - v_poster_used - p_poster_need,
      'reel', p_reel_limit - v_reel_used - p_reel_need
    )
  );
end;
$$;

-- 4. Refund: विफल job के reserve को वापस करें। एक job के लिए सिर्फ एक बार।
create or replace function public.refund_job_credits(p_job uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if exists (
    select 1 from public.usage_ledger where job_id = p_job and reason = 'refund'
  ) then
    return 0;
  end if;

  insert into public.usage_ledger (user_id, delta, reason, job_id, kind)
  select user_id, -delta, 'refund', job_id, kind
  from public.usage_ledger
  where job_id = p_job and reason = 'reserve';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5. इन functions को सिर्फ server (service role) चला सके
revoke execute on function public.credit_used(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, uuid, int, int, int, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.refund_job_credits(uuid) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, uuid, int, int, int, int, timestamptz) to service_role;
grant execute on function public.refund_job_credits(uuid) to service_role;
grant execute on function public.credit_used(uuid, text, timestamptz) to service_role;