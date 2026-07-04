-- V3 AI function router support.
-- Adds xAI as provider in legacy tables and stores non-secret key status per provider.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.ai_settings drop constraint %I', constraint_name);
  end loop;

  alter table public.ai_settings
    add constraint ai_settings_provider_check
    check (provider in ('openai', 'anthropic', 'moonshot', 'xai'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_usage_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.ai_usage_logs drop constraint %I', constraint_name);
  end loop;

  alter table public.ai_usage_logs
    add constraint ai_usage_logs_provider_check
    check (provider in ('openai', 'anthropic', 'moonshot', 'xai'));
end $$;

create table if not exists public.ai_provider_key_status (
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'moonshot', 'xai')),
  has_key boolean not null default false,
  key_preview text,
  updated_at timestamptz not null default now(),
  primary key (org_id, provider)
);

insert into public.ai_provider_key_status (org_id, provider, has_key, key_preview, updated_at)
select org_id, provider, has_key, key_preview, updated_at
from public.ai_settings
where has_key = true
on conflict (org_id, provider) do update set
  has_key = excluded.has_key,
  key_preview = excluded.key_preview,
  updated_at = excluded.updated_at;

alter table public.ai_provider_key_status enable row level security;

grant select, insert, update, delete on public.ai_provider_key_status to authenticated;
grant select, insert, update, delete on public.ai_provider_key_status to service_role;

drop policy if exists ai_provider_key_status_read_org_member on public.ai_provider_key_status;
create policy ai_provider_key_status_read_org_member
on public.ai_provider_key_status for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists ai_provider_key_status_write_owner on public.ai_provider_key_status;
create policy ai_provider_key_status_write_owner
on public.ai_provider_key_status for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));
