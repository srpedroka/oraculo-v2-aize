create table if not exists public.whatsapp_processed_events (
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, event_key)
);

create index if not exists whatsapp_processed_events_created_idx
on public.whatsapp_processed_events (created_at desc);

alter table public.whatsapp_processed_events enable row level security;

revoke all on public.whatsapp_processed_events from anon, authenticated;
grant select, insert, delete on public.whatsapp_processed_events to service_role;
