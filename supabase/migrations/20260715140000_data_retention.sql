-- Etapa 6 / Fatia 6C: retenção automática somente para dados técnicos.
-- Memória estratégica, conversas, documentos e auditorias críticas não entram nesta rotina.

create extension if not exists pg_cron with schema pg_catalog;

create table public.data_retention_runs (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null,
  deleted_counts jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now(),
  constraint data_retention_runs_policy_length check (char_length(policy_version) between 1 and 40),
  constraint data_retention_runs_counts_object check (jsonb_typeof(deleted_counts) = 'object')
);

create index data_retention_runs_executed_idx
on public.data_retention_runs (executed_at desc);

create index whatsapp_processed_events_retention_idx
on public.whatsapp_processed_events (created_at);

create index deadline_nudge_log_retention_idx
on public.deadline_nudge_log (sent_on);

create index weekly_pulse_log_retention_idx
on public.weekly_pulse_log (sent_at);

create index operational_health_snapshots_retention_idx
on public.operational_health_snapshots (checked_at);

create index frontend_error_events_retention_idx
on public.frontend_error_events (created_at);

create index ai_function_errors_retention_idx
on public.ai_function_errors (created_at);

create index operational_alerts_retention_idx
on public.operational_alerts (resolved_at)
where resolved_at is not null;

create index ai_usage_logs_retention_idx
on public.ai_usage_logs (created_at);

create index ai_limit_events_retention_idx
on public.ai_limit_events (created_at);

create index operation_commands_retention_idx
on public.operation_commands (created_at)
where status in ('completed', 'failed');

alter table public.data_retention_runs enable row level security;
revoke all on public.data_retention_runs from public, anon, authenticated;
grant select, insert, delete on public.data_retention_runs to service_role;

create or replace function public.preview_expired_technical_data()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'whatsapp_inbound_jobs', (
      select count(*) from public.whatsapp_inbound_jobs
      where (status = 'completed' and completed_at < now() - interval '24 hours')
         or (status = 'dead' and updated_at < now() - interval '7 days')
    ),
    'whatsapp_outbox', (
      select count(*) from public.whatsapp_outbox
      where (status = 'sent' and sent_at < now() - interval '24 hours')
         or (status = 'dead' and updated_at < now() - interval '7 days')
    ),
    'whatsapp_processed_events', (
      select count(*) from public.whatsapp_processed_events
      where created_at < now() - interval '30 days'
    ),
    'whatsapp_health_events', (
      select count(*) from public.whatsapp_health_events
      where created_at < now() - interval '30 days'
    ),
    'deadline_nudge_log', (
      select count(*) from public.deadline_nudge_log
      where sent_on < current_date - 180
    ),
    'weekly_pulse_log', (
      select count(*) from public.weekly_pulse_log
      where sent_at < now() - interval '180 days'
    ),
    'operational_health_snapshots', (
      select count(*) from public.operational_health_snapshots
      where checked_at < now() - interval '30 days'
    ),
    'frontend_error_events', (
      select count(*) from public.frontend_error_events
      where created_at < now() - interval '90 days'
    ),
    'ai_function_errors', (
      select count(*) from public.ai_function_errors
      where created_at < now() - interval '90 days'
    ),
    'operational_alerts', (
      select count(*) from public.operational_alerts
      where resolved_at < now() - interval '90 days'
    ),
    'operation_commands', (
      select count(*) from public.operation_commands
      where status in ('completed', 'failed')
        and created_at < now() - interval '365 days'
    ),
    'ai_usage_logs', (
      select count(*) from public.ai_usage_logs
      where created_at < now() - interval '730 days'
    ),
    'ai_limit_events', (
      select count(*) from public.ai_limit_events
      where created_at < now() - interval '730 days'
    ),
    'data_retention_runs', (
      select count(*) from public.data_retention_runs
      where executed_at < now() - interval '730 days'
    )
  );
$$;

create or replace function public.cleanup_expired_technical_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_counts jsonb := '{}'::jsonb;
  deleted_rows integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('oraculo-data-retention', 0)) then
    return jsonb_build_object('status', 'already_running');
  end if;

  select public.cleanup_whatsapp_inbound_jobs() into deleted_rows;
  deleted_counts := deleted_counts || jsonb_build_object('whatsapp_inbound_jobs', deleted_rows);

  select public.cleanup_whatsapp_outbox() into deleted_rows;
  deleted_counts := deleted_counts || jsonb_build_object('whatsapp_outbox', deleted_rows);

  delete from public.whatsapp_processed_events
  where created_at < now() - interval '30 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('whatsapp_processed_events', deleted_rows);

  select public.cleanup_whatsapp_health_events() into deleted_rows;
  deleted_counts := deleted_counts || jsonb_build_object('whatsapp_health_events', deleted_rows);

  delete from public.deadline_nudge_log
  where sent_on < current_date - 180;
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('deadline_nudge_log', deleted_rows);

  delete from public.weekly_pulse_log
  where sent_at < now() - interval '180 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('weekly_pulse_log', deleted_rows);

  delete from public.operational_health_snapshots
  where checked_at < now() - interval '30 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('operational_health_snapshots', deleted_rows);

  delete from public.frontend_error_events
  where created_at < now() - interval '90 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('frontend_error_events', deleted_rows);

  delete from public.ai_function_errors
  where created_at < now() - interval '90 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('ai_function_errors', deleted_rows);

  delete from public.operational_alerts
  where resolved_at < now() - interval '90 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('operational_alerts', deleted_rows);

  delete from public.operation_commands
  where status in ('completed', 'failed')
    and created_at < now() - interval '365 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('operation_commands', deleted_rows);

  delete from public.ai_usage_logs
  where created_at < now() - interval '730 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('ai_usage_logs', deleted_rows);

  delete from public.ai_limit_events
  where created_at < now() - interval '730 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('ai_limit_events', deleted_rows);

  delete from public.data_retention_runs
  where executed_at < now() - interval '730 days';
  get diagnostics deleted_rows = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('data_retention_runs', deleted_rows);

  insert into public.data_retention_runs (policy_version, deleted_counts)
  values ('2026-07-15-r2', deleted_counts);

  return jsonb_build_object('status', 'completed', 'deleted', deleted_counts);
end;
$$;

revoke all on function public.preview_expired_technical_data() from public, anon, authenticated;
revoke all on function public.cleanup_expired_technical_data() from public, anon, authenticated;
grant execute on function public.preview_expired_technical_data() to service_role;
grant execute on function public.cleanup_expired_technical_data() to service_role, postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'oraculo-data-retention'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'oraculo-data-retention',
  '20 4 * * *',
  'select public.cleanup_expired_technical_data();'
);

insert into public.data_notice_versions (version, published_at, material_change, summary)
values (
  '2026-07-15-r2',
  '2026-07-15T14:00:00-03:00',
  true,
  'Prazos objetivos e limpeza automática para dados técnicos, sem apagar memória estratégica.'
);

comment on table public.data_retention_runs is
  'Resumo service-only de limpeza técnica. Guarda apenas contagens por tabela, sem conteúdo empresarial.';
comment on function public.preview_expired_technical_data() is
  'Prévia somente-leitura das linhas técnicas vencidas pela política 2026-07-15-r2.';
comment on function public.cleanup_expired_technical_data() is
  'Limpeza diária conservadora de dados técnicos; não toca em memória estratégica nem auditoria crítica.';
