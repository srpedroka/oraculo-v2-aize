create table if not exists public.whatsapp_worker_secrets (
  id text primary key default 'worker',
  worker_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  endpoint_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_worker_secrets_endpoint_check check (endpoint_url is null or endpoint_url ~ '^https://[^[:space:]]+$')
);

alter table public.whatsapp_worker_secrets enable row level security;
revoke all on public.whatsapp_worker_secrets from anon, authenticated;
grant select, insert, update on public.whatsapp_worker_secrets to service_role;
insert into public.whatsapp_worker_secrets (id) values ('worker') on conflict (id) do nothing;

create or replace function public.claim_whatsapp_inbound_job(
  p_worker_id text,
  p_org_id uuid default null,
  p_lock_timeout_seconds integer default 120
)
returns setof public.whatsapp_inbound_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.whatsapp_inbound_jobs%rowtype;
begin
  if p_worker_id is null or char_length(p_worker_id) not between 8 and 120 then
    raise exception 'Identificador do worker inválido';
  end if;
  if p_lock_timeout_seconds not between 30 and 900 then
    raise exception 'Timeout de lock inválido';
  end if;

  update public.whatsapp_inbound_jobs job
  set status = 'dead',
      locked_at = null,
      locked_by = null,
      last_error_code = 'job_expired',
      last_error_message = 'Prazo de processamento do job expirou',
      expires_at = now() + interval '7 days',
      updated_at = now()
  where job.status in ('queued', 'retry')
    and job.expires_at <= now()
    and (p_org_id is null or job.org_id = p_org_id);

  update public.whatsapp_inbound_jobs job
  set status = case when job.attempt_count >= 5 then 'dead' else 'retry' end,
      next_retry_at = now(),
      locked_at = null,
      locked_by = null,
      last_error_code = 'lock_expired',
      last_error_message = 'Worker anterior perdeu o lock antes de concluir',
      expires_at = case when job.attempt_count >= 5 then now() + interval '7 days' else job.expires_at end,
      updated_at = now()
  where job.status = 'processing'
    and job.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
    and (p_org_id is null or job.org_id = p_org_id);

  update public.whatsapp_inbound_jobs job
  set status = 'dead',
      last_error_code = 'attempts_exhausted',
      last_error_message = 'Limite de tentativas esgotado',
      expires_at = now() + interval '7 days',
      updated_at = now()
  where job.status in ('queued', 'retry')
    and job.attempt_count >= 5
    and (p_org_id is null or job.org_id = p_org_id);

  select candidate.*
    into v_job
  from public.whatsapp_inbound_jobs candidate
  where candidate.status in ('queued', 'retry')
    and candidate.next_retry_at <= now()
    and candidate.attempt_count < 5
    and candidate.expires_at > now()
    and (p_org_id is null or candidate.org_id = p_org_id)
    and not exists (
      select 1
      from public.whatsapp_inbound_jobs earlier
      where earlier.org_id = candidate.org_id
        and coalesce(earlier.user_id::text, earlier.phone) = coalesce(candidate.user_id::text, candidate.phone)
        and earlier.status in ('queued', 'processing', 'retry')
        and (earlier.created_at, earlier.id::text) < (candidate.created_at, candidate.id::text)
    )
  order by candidate.next_retry_at, candidate.created_at, candidate.id
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.whatsapp_inbound_jobs job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where job.id = v_job.id
  returning job.* into v_job;

  return next v_job;
end;
$$;

create or replace function public.heartbeat_whatsapp_inbound_job(
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with refreshed as (
    update public.whatsapp_inbound_jobs
    set locked_at = now(), updated_at = now()
    where id = p_job_id
      and status = 'processing'
      and locked_by = p_worker_id
    returning id
  )
  select exists(select 1 from refreshed);
$$;

create or replace function public.complete_whatsapp_inbound_job(
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with completed as (
    update public.whatsapp_inbound_jobs
    set status = 'completed',
        locked_at = null,
        locked_by = null,
        last_error_code = null,
        last_error_message = null,
        completed_at = now(),
        expires_at = now() + interval '24 hours',
        updated_at = now()
    where id = p_job_id
      and status = 'processing'
      and locked_by = p_worker_id
    returning id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_whatsapp_inbound_job(
  p_job_id uuid,
  p_worker_id text,
  p_transient boolean,
  p_error_code text,
  p_error_message text,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.whatsapp_inbound_jobs%rowtype;
  v_retry boolean;
  v_delay integer;
begin
  select * into v_job
  from public.whatsapp_inbound_jobs
  where id = p_job_id
  for update;

  if not found or v_job.status <> 'processing' or v_job.locked_by <> p_worker_id then
    raise exception 'Worker não possui o lock deste job';
  end if;
  if p_retry_after_seconds is not null and p_retry_after_seconds not between 0 and 3600 then
    raise exception 'Atraso de retry inválido';
  end if;

  v_retry := coalesce(p_transient, false) and v_job.attempt_count < 5 and v_job.expires_at > now();
  v_delay := coalesce(
    p_retry_after_seconds,
    case v_job.attempt_count when 1 then 10 when 2 then 30 when 3 then 120 else 600 end
  );

  update public.whatsapp_inbound_jobs
  set status = case when v_retry then 'retry' else 'dead' end,
      next_retry_at = case when v_retry then now() + make_interval(secs => v_delay) else next_retry_at end,
      locked_at = null,
      locked_by = null,
      last_error_code = left(coalesce(nullif(p_error_code, ''), 'processing_error'), 80),
      last_error_message = left(coalesce(nullif(p_error_message, ''), 'Falha no processamento'), 1000),
      expires_at = case when v_retry then expires_at else now() + interval '7 days' end,
      updated_at = now()
  where id = p_job_id;

  return case when v_retry then 'retry' else 'dead' end;
end;
$$;

create or replace function public.cleanup_whatsapp_inbound_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.whatsapp_inbound_jobs
  where (status = 'completed' and completed_at < now() - interval '24 hours')
     or (status = 'dead' and updated_at < now() - interval '7 days');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_whatsapp_inbound_job(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_whatsapp_inbound_job(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_whatsapp_inbound_job(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_whatsapp_inbound_job(uuid, text, boolean, text, text, integer) from public, anon, authenticated;
revoke all on function public.cleanup_whatsapp_inbound_jobs() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_inbound_job(text, uuid, integer) to service_role;
grant execute on function public.heartbeat_whatsapp_inbound_job(uuid, text) to service_role;
grant execute on function public.complete_whatsapp_inbound_job(uuid, text) to service_role;
grant execute on function public.fail_whatsapp_inbound_job(uuid, text, boolean, text, text, integer) to service_role;
grant execute on function public.cleanup_whatsapp_inbound_jobs() to service_role;

create or replace function public.invoke_whatsapp_worker_cron()
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
  select worker_secret, endpoint_url into strict secret_value, endpoint_value
  from public.whatsapp_worker_secrets
  where id = 'worker';

  if endpoint_value is null or endpoint_value = '' then
    return null;
  end if;

  select net.http_post(
    url := endpoint_value,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-worker-secret', secret_value
    ),
    body := jsonb_build_object('source', 'cron', 'batchSize', 10)
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_whatsapp_worker_cron() from public, anon, authenticated;
grant execute on function public.invoke_whatsapp_worker_cron() to postgres, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'oraculo-whatsapp-worker' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'oraculo-whatsapp-worker',
  '* * * * *',
  'select public.invoke_whatsapp_worker_cron();'
);

comment on table public.whatsapp_worker_secrets is
  'Segredo e endpoint server-only do worker. Endpoint nulo mantém o acionamento automático inerte.';
