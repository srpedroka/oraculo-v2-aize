create table public.operational_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('healthy', 'warning', 'critical')),
  metrics jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create index operational_health_snapshots_org_checked_idx
on public.operational_health_snapshots (org_id, checked_at desc);

create table public.operational_alerts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  tone text not null check (tone in ('warning', 'critical')),
  title text not null,
  detail text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (org_id, code)
);

create table public.operational_monitor_secrets (
  id text primary key default 'cron' check (id = 'cron'),
  cron_secret text not null default encode(gen_random_bytes(32), 'hex'),
  endpoint_url text,
  created_at timestamptz not null default now()
);

create table public.ai_function_errors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  function text not null,
  provider text not null,
  model text not null,
  error_code text not null,
  created_at timestamptz not null default now()
);

create index ai_function_errors_org_created_idx on public.ai_function_errors (org_id, created_at desc);

insert into public.operational_monitor_secrets (id) values ('cron') on conflict (id) do nothing;

alter table public.operational_health_snapshots enable row level security;
alter table public.operational_alerts enable row level security;
alter table public.operational_monitor_secrets enable row level security;
alter table public.ai_function_errors enable row level security;

revoke all on public.operational_health_snapshots, public.operational_alerts, public.operational_monitor_secrets from anon, authenticated;
grant select, insert, update, delete on public.operational_health_snapshots, public.operational_alerts, public.operational_monitor_secrets to service_role;
revoke all on public.ai_function_errors from anon, authenticated;
grant select, insert, delete on public.ai_function_errors to service_role;

create or replace function public.operational_migration_count()
returns integer
language sql
security definer
set search_path = public, supabase_migrations, pg_temp
as $$
  select count(*)::integer from supabase_migrations.schema_migrations;
$$;

revoke all on function public.operational_migration_count() from public, anon, authenticated;
grant execute on function public.operational_migration_count() to service_role;

create or replace function public.invoke_operational_health_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id bigint;
  secret_value text;
  endpoint_value text;
begin
  select cron_secret, endpoint_url into strict secret_value, endpoint_value
  from public.operational_monitor_secrets where id = 'cron';
  if endpoint_value is null or endpoint_value = '' then return null; end if;
  select net.http_post(
    url := endpoint_value,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-oraculo-monitor-secret', secret_value),
    body := jsonb_build_object('action', 'cron')
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.invoke_operational_health_cron() from public, anon, authenticated;
grant execute on function public.invoke_operational_health_cron() to postgres, service_role;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'oraculo-operational-health' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end
$$;

select cron.schedule('oraculo-operational-health', '*/5 * * * *', 'select public.invoke_operational_health_cron();');

comment on table public.operational_health_snapshots is 'Métricas técnicas sanitizadas por empresa, service-only, sem conteúdo de negócio.';
comment on table public.operational_alerts is 'Alertas técnicos deduplicados e resolvidos automaticamente pelo monitor operacional.';
comment on table public.ai_function_errors is 'Falhas sanitizadas de IA por função/provedor, sem prompt, resposta ou mensagem de erro.';
