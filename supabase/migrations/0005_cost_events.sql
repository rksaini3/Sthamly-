-- Sthamly: AI और सेवा की लागत का हर event (Phase 1)
-- हर AI call की लागत यहां अलग-अलग दर्ज होगी। इसी से margin और cost cap चलेंगे।
-- राशि paise में (1 रुपया = 100 paise), ताकि float की गलती न हो।

create table if not exists public.cost_events (
  id bigint generated always as identity primary key,
  job_id uuid references public.jobs (id) on delete cascade,
  step text not null
    check (step in ('caption', 'poster_base', 'reel', 'voice', 'whatsapp', 'other')),
  provider text not null,
  model text,
  cost_paise int not null check (cost_paise >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cost_events_job_idx on public.cost_events (job_id);
create index if not exists cost_events_created_idx on public.cost_events (created_at desc);

-- RLS चालू, कोई policy नहीं: यह table सिर्फ server (service role) लिखेगा और पढ़ेगा।
-- Dashboard या दुकानदार को लागत नहीं दिखती।
alter table public.cost_events enable row level security;

-- Dashboard के लिए: किस प्लान पर कितनी लागत आई (Phase 2 में view बनेगा)
-- create view public.job_costs as
--   select job_id, sum(cost_paise) as total_paise from public.cost_events group by job_id;