-- Recoverable, per-organization backups.
-- Packages live in a private Storage bucket and never include provider secrets.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table public.organization_backup_policies (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  automatic_enabled boolean not null default true,
  event_snapshots_enabled boolean not null default true,
  event_retention_days int not null default 7 check (event_retention_days between 1 and 30),
  daily_retention_days int not null default 30 check (daily_retention_days between 7 and 90),
  weekly_retention_days int not null default 84 check (weekly_retention_days between 28 and 366),
  monthly_retention_days int not null default 730 check (monthly_retention_days between 180 and 1095),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_backups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('manual', 'event', 'daily', 'weekly', 'monthly')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  object_path text unique,
  checksum text,
  size_bytes bigint,
  record_count int not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  external_status text not null default 'not_configured'
    check (external_status in ('not_configured', 'pending', 'completed', 'failed')),
  external_object_key text,
  external_error_message text,
  initiated_by uuid references public.profiles(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz
);

create unique index organization_backups_one_pending_idx
on public.organization_backups (org_id)
where status = 'pending';

create index organization_backups_org_created_idx
on public.organization_backups (org_id, created_at desc);

create index organization_backups_expiration_idx
on public.organization_backups (expires_at)
where expires_at is not null and status = 'completed';

create table public.organization_restore_runs (
  id uuid primary key default gen_random_uuid(),
  source_org_id uuid not null references public.organizations(id) on delete cascade,
  backup_id uuid references public.organization_backups(id) on delete set null,
  target_org_id uuid,
  target_org_name text,
  mode text not null default 'clone' check (mode = 'clone'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  record_counts jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  initiated_by uuid not null references public.profiles(id) on delete cascade,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index organization_restore_runs_source_created_idx
on public.organization_restore_runs (source_org_id, created_at desc);

create table public.organization_backup_requests (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  reason text not null,
  requested_at timestamptz not null default now()
);

create table public.organization_backup_secrets (
  id text primary key default 'cron' check (id = 'cron'),
  cron_secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

insert into public.organization_backup_secrets (id)
values ('cron')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-backups',
  'organization-backups',
  false,
  104857600,
  array['application/gzip']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.organization_backup_policies enable row level security;
alter table public.organization_backups enable row level security;
alter table public.organization_restore_runs enable row level security;
alter table public.organization_backup_requests enable row level security;
alter table public.organization_backup_secrets enable row level security;

grant select, update on public.organization_backup_policies to authenticated;
grant select on public.organization_backups to authenticated;
grant select on public.organization_restore_runs to authenticated;

grant select, insert, update, delete on public.organization_backup_policies to service_role;
grant select, insert, update, delete on public.organization_backups to service_role;
grant select, insert, update, delete on public.organization_restore_runs to service_role;
grant select, insert, update, delete on public.organization_backup_requests to service_role;
grant select, insert, update, delete on public.organization_backup_secrets to service_role;

revoke all on public.organization_backup_requests from anon, authenticated;
revoke all on public.organization_backup_secrets from anon, authenticated;

drop policy if exists organization_backup_policies_owner_read on public.organization_backup_policies;
create policy organization_backup_policies_owner_read
on public.organization_backup_policies for select
to authenticated
using (public.is_owner(org_id));

drop policy if exists organization_backup_policies_owner_update on public.organization_backup_policies;
create policy organization_backup_policies_owner_update
on public.organization_backup_policies for update
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

drop policy if exists organization_backups_owner_read on public.organization_backups;
create policy organization_backups_owner_read
on public.organization_backups for select
to authenticated
using (public.is_owner(org_id));

drop policy if exists organization_restore_runs_owner_read on public.organization_restore_runs;
create policy organization_restore_runs_owner_read
on public.organization_restore_runs for select
to authenticated
using (public.is_owner(source_org_id));

create or replace function public.touch_organization_backup_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists touch_organization_backup_policy on public.organization_backup_policies;
create trigger touch_organization_backup_policy
before update on public.organization_backup_policies
for each row execute function public.touch_organization_backup_policy();

create or replace function public.ensure_organization_backup_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_backup_policies (org_id)
  values (new.id)
  on conflict (org_id) do nothing;
  return new;
end
$$;

drop trigger if exists ensure_organization_backup_policy on public.organizations;
create trigger ensure_organization_backup_policy
after insert on public.organizations
for each row execute function public.ensure_organization_backup_policy();

insert into public.organization_backup_policies (org_id)
select id from public.organizations
on conflict (org_id) do nothing;

create or replace function public.queue_organization_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  if tg_op = 'DELETE' then
    target_org_id := old.org_id;
  else
    target_org_id := new.org_id;
  end if;

  insert into public.organization_backup_requests (org_id, reason, requested_at)
  values (target_org_id, tg_table_name, now())
  on conflict (org_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at;

  return null;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memberships',
    'areas',
    'strategic_plans',
    'area_plans',
    'objectives',
    'key_actions',
    'strategic_projects',
    'evidences',
    'check_ins',
    'ai_settings',
    'ai_function_settings',
    'whatsapp_settings',
    'plan_documents',
    'executive_kpis',
    'kpi_monthly_values',
    'org_ai_tone'
  ]
  loop
    execute format('drop trigger if exists queue_organization_backup on public.%I', table_name);
    execute format(
      'create trigger queue_organization_backup after insert or update or delete on public.%I for each row execute function public.queue_organization_backup()',
      table_name
    );
  end loop;
end
$$;

create or replace function public.invoke_organization_backup_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id bigint;
  secret_value text;
begin
  select cron_secret into strict secret_value
  from public.organization_backup_secrets
  where id = 'cron';

  select net.http_post(
    url := 'https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/organization-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-backup-cron-secret', secret_value
    ),
    body := jsonb_build_object('action', 'cron')
  ) into request_id;

  return request_id;
end
$$;

revoke all on function public.invoke_organization_backup_cron() from public, anon, authenticated;
grant execute on function public.invoke_organization_backup_cron() to postgres, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'oraculo-organization-backups'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'oraculo-organization-backups',
  '7,22,37,52 * * * *',
  'select public.invoke_organization_backup_cron();'
);
