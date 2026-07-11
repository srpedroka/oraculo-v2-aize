create table if not exists public.whatsapp_instance_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  api_key text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_instance_keys (org_id, api_key, webhook_secret, updated_at)
select org_id, api_key, webhook_secret, updated_at
from private.whatsapp_instance_keys
on conflict (org_id) do update
set
  api_key = excluded.api_key,
  webhook_secret = excluded.webhook_secret,
  updated_at = excluded.updated_at;

alter table public.whatsapp_instance_keys enable row level security;

revoke all on public.whatsapp_instance_keys from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_instance_keys to service_role;
