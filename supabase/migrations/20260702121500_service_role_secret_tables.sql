create table if not exists public.ai_model_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic')),
  api_key text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_instance_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  api_key text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);

insert into public.ai_model_keys (org_id, provider, api_key, updated_at)
select org_id, provider, api_key, updated_at
from private.ai_model_keys
on conflict (org_id) do update set
  provider = excluded.provider,
  api_key = excluded.api_key,
  updated_at = excluded.updated_at;

insert into public.whatsapp_instance_keys (org_id, api_key, webhook_secret, updated_at)
select org_id, api_key, webhook_secret, updated_at
from private.whatsapp_instance_keys
on conflict (org_id) do update set
  api_key = excluded.api_key,
  webhook_secret = excluded.webhook_secret,
  updated_at = excluded.updated_at;

alter table public.ai_model_keys enable row level security;
alter table public.whatsapp_instance_keys enable row level security;

revoke all on public.ai_model_keys from anon, authenticated;
revoke all on public.whatsapp_instance_keys from anon, authenticated;

grant select, insert, update, delete on public.ai_model_keys to service_role;
grant select, insert, update, delete on public.whatsapp_instance_keys to service_role;
