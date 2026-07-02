alter table public.ai_settings
  add column if not exists input_token_price_usd_per_million numeric(12, 6) not null default 0,
  add column if not exists output_token_price_usd_per_million numeric(12, 6) not null default 0,
  add column if not exists pricing_source text;

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
    check (provider in ('openai', 'anthropic', 'moonshot'));
end $$;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.ai_model_keys') is not null then
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'public.ai_model_keys'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%provider%'
    loop
      execute format('alter table public.ai_model_keys drop constraint %I', constraint_name);
    end loop;

    alter table public.ai_model_keys
      add constraint ai_model_keys_provider_check
      check (provider in ('openai', 'anthropic', 'moonshot'));
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  if to_regclass('private.ai_model_keys') is not null then
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'private.ai_model_keys'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%provider%'
    loop
      execute format('alter table private.ai_model_keys drop constraint %I', constraint_name);
    end loop;

    alter table private.ai_model_keys
      add constraint ai_model_keys_provider_check
      check (provider in ('openai', 'anthropic', 'moonshot'));
  end if;
end $$;

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'moonshot')),
  model text not null,
  channel text not null default 'web' check (channel in ('web', 'whatsapp', 'system')),
  prompt_tokens int not null default 0 check (prompt_tokens >= 0),
  completion_tokens int not null default 0 check (completion_tokens >= 0),
  total_tokens int not null default 0 check (total_tokens >= 0),
  input_token_price_usd_per_million numeric(12, 6) not null default 0,
  output_token_price_usd_per_million numeric(12, 6) not null default 0,
  input_cost_usd numeric(14, 8) not null default 0,
  output_cost_usd numeric(14, 8) not null default 0,
  total_cost_usd numeric(14, 8) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_org_created_idx
on public.ai_usage_logs (org_id, created_at desc);

alter table public.ai_usage_logs enable row level security;

grant select on public.ai_usage_logs to authenticated;
grant select, insert, update, delete on public.ai_usage_logs to service_role;

drop policy if exists ai_usage_logs_read_org_member on public.ai_usage_logs;
create policy ai_usage_logs_read_org_member
on public.ai_usage_logs for select
to authenticated
using (public.is_org_member(org_id));
