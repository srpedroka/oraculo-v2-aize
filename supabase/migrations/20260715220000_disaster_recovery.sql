-- Etapa 6 / Fatia 6F: recuperacao comprovada, RPO mensuravel e incidentes sanitizados.

alter table public.organization_restore_runs
  add column if not exists source_kind text not null default 'unknown',
  add column if not exists source_checksum text,
  add column if not exists duration_ms bigint,
  add column if not exists verification jsonb not null default '{}'::jsonb,
  add column if not exists drill_cleaned_at timestamptz,
  add column if not exists drill_cleaned_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_restore_runs_source_kind_check'
  ) then
    alter table public.organization_restore_runs
      add constraint organization_restore_runs_source_kind_check
      check (source_kind in ('unknown', 'internal', 'external', 'portable'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organization_restore_runs_duration_check'
  ) then
    alter table public.organization_restore_runs
      add constraint organization_restore_runs_duration_check
      check (duration_ms is null or duration_ms >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'organization_restore_runs_verification_check'
  ) then
    alter table public.organization_restore_runs
      add constraint organization_restore_runs_verification_check
      check (jsonb_typeof(verification) = 'object');
  end if;
end
$$;

create table if not exists public.organization_recovery_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  incident_type text not null check (incident_type in ('data_loss', 'service_outage', 'security', 'recovery_failure')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  affected_services text[] not null check (
    cardinality(affected_services) between 1 and 6
    and affected_services <@ array['supabase', 'frontend', 'whatsapp', 'ai', 'backup', 'external_replica']::text[]
  ),
  status text not null default 'open' check (status in ('open', 'resolved')),
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  request_id text not null check (char_length(request_id) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (org_id, request_id)
);

create index if not exists organization_recovery_incidents_open_idx
on public.organization_recovery_incidents (org_id, severity, opened_at desc)
where status = 'open';

alter table public.organization_recovery_incidents enable row level security;

revoke all on public.organization_recovery_incidents from anon;
revoke insert, update, delete on public.organization_recovery_incidents from authenticated;
grant select on public.organization_recovery_incidents to authenticated;
grant select, insert, update, delete on public.organization_recovery_incidents to service_role;

drop policy if exists organization_recovery_incidents_owner_read on public.organization_recovery_incidents;
create policy organization_recovery_incidents_owner_read
on public.organization_recovery_incidents for select
to authenticated
using (public.is_owner(org_id));

comment on table public.organization_recovery_incidents is
  'Registro minimo de incidentes de recuperacao, sem texto livre, contato, segredo ou conteudo de negocio.';

-- Mantem o instante da primeira alteracao ainda nao protegida. Novas mudancas
-- atualizam o motivo, mas nao empurram o relogio do RPO para a frente.
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

  if target_org_id is null then
    return null;
  end if;

  insert into public.organization_backup_requests (org_id, reason, requested_at)
  select target_org_id, tg_table_name, now()
  where exists (
    select 1
    from public.organizations organization
    where organization.id = target_org_id
  )
  on conflict (org_id) do update set
    reason = excluded.reason,
    requested_at = least(organization_backup_requests.requested_at, excluded.requested_at);

  return null;
end
$$;

-- O cron roda a cada 15 minutos. Toda tabela duravel exportada pelo pacote,
-- exceto a propria politica de backup (atualizada pelo worker), entra na fila.
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
    'conversations',
    'chat_messages',
    'check_ins',
    'ai_settings',
    'ai_function_settings',
    'ai_usage_logs',
    'ai_control_policies',
    'ai_limit_events',
    'whatsapp_settings',
    'planning_sessions',
    'plan_documents',
    'executive_kpis',
    'kpi_monthly_values',
    'objective_kpi_links',
    'operational_revisions',
    'administrative_audit_events',
    'org_ai_tone',
    'organization_recovery_incidents'
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

select public.record_destructive_schema_change(
  array['20260715220000_disaster_recovery.sql']
);
