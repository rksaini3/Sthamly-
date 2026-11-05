-- Sthamly: WhatsApp inbound messages की duplicate जांच (Phase 1)
-- Meta webhook retry कर सकता है। यह table पक्का करती है कि एक message दो बार प्रोसेस न हो।

create table if not exists public.processed_messages (
  wa_message_id text primary key,
  from_phone text not null,
  processed_at timestamptz not null default now()
);

create index if not exists processed_messages_phone_idx
  on public.processed_messages (from_phone, processed_at desc);

-- RLS चालू, कोई policy नहीं: यह table सिर्फ server (service role) इस्तेमाल करेगा।
alter table public.processed_messages enable row level security;

-- पुराने रिकॉर्ड साफ करने के लिए (हफ्ते भर से पुराने, Phase 1 में cron से):
-- delete from public.processed_messages where processed_at < now() - interval '7 days';