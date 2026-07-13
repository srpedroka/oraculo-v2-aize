create table if not exists public.whatsapp_health_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  source text not null,
  item_id uuid,
  correlation_id uuid,
  error_code text,
  http_status integer,
  created_at timestamptz not null default now(),
  constraint whatsapp_health_events_type_check check (event_type in (
    'webhook_received',
    'inbound_failed',
    'outbound_sent',
    'outbound_retry',
    'outbound_failed',
    'test_sent',
    'test_failed',
    'item_requeued'
  )),
  constraint whatsapp_health_events_source_check check (source in (
    'webhook',
    'worker',
    'direct',
    'outbox',
    'health_test',
    'health_action'
  )),
  constraint whatsapp_health_events_error_code_check check (error_code is null or char_length(error_code) <= 80),
  constraint whatsapp_health_events_http_status_check check (http_status is null or http_status between 100 and 599)
);

create index if not exists whatsapp_health_events_org_created_idx
on public.whatsapp_health_events (org_id, created_at desc);

create index if not exists whatsapp_health_events_org_type_created_idx
on public.whatsapp_health_events (org_id, event_type, created_at desc);

alter table public.whatsapp_health_events enable row level security;
revoke all on public.whatsapp_health_events from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_health_events to service_role;

create or replace function public.record_whatsapp_outbox_health_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_event_type := case new.status
    when 'sent' then 'outbound_sent'
    when 'retry' then case when old.status = 'sending' then 'outbound_retry' else null end
    when 'dead' then 'outbound_failed'
    else null
  end;

  if v_event_type is not null then
    insert into public.whatsapp_health_events (
      org_id,
      event_type,
      source,
      item_id,
      correlation_id,
      error_code,
      http_status
    ) values (
      new.org_id,
      v_event_type,
      'outbox',
      new.id,
      new.correlation_id,
      new.last_error_code,
      new.provider_http_status
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_whatsapp_outbox_health_event() from public, anon, authenticated;

drop trigger if exists record_whatsapp_outbox_health_event on public.whatsapp_outbox;
create trigger record_whatsapp_outbox_health_event
after update of status on public.whatsapp_outbox
for each row execute function public.record_whatsapp_outbox_health_event();

create or replace function public.record_whatsapp_inbound_health_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'dead' and new.status is distinct from old.status then
    insert into public.whatsapp_health_events (
      org_id,
      event_type,
      source,
      item_id,
      correlation_id,
      error_code
    ) values (
      new.org_id,
      'inbound_failed',
      'worker',
      new.id,
      new.correlation_id,
      new.last_error_code
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_whatsapp_inbound_health_event() from public, anon, authenticated;

drop trigger if exists record_whatsapp_inbound_health_event on public.whatsapp_inbound_jobs;
create trigger record_whatsapp_inbound_health_event
after update of status on public.whatsapp_inbound_jobs
for each row execute function public.record_whatsapp_inbound_health_event();

create or replace function public.requeue_whatsapp_dead_item(
  p_org_id uuid,
  p_item_type text,
  p_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if p_item_type = 'inbound' then
    update public.whatsapp_inbound_jobs
    set status = 'retry',
        attempt_count = 0,
        next_retry_at = now(),
        locked_at = null,
        locked_by = null,
        last_error_code = null,
        last_error_message = null,
        expires_at = now() + case when kind = 'text' then interval '7 days' else interval '24 hours' end,
        completed_at = null,
        updated_at = now()
    where id = p_item_id
      and org_id = p_org_id
      and status = 'dead';
    get diagnostics v_updated = row_count;
  elsif p_item_type = 'outbound' then
    update public.whatsapp_outbox
    set status = 'retry',
        attempt_count = 0,
        next_retry_at = now(),
        locked_at = null,
        locked_by = null,
        provider_http_status = null,
        last_error_code = null,
        last_error_message = null,
        updated_at = now()
    where id = p_item_id
      and org_id = p_org_id
      and status = 'dead';
    get diagnostics v_updated = row_count;
  else
    raise exception 'Tipo de item do WhatsApp inválido';
  end if;

  if v_updated = 1 then
    insert into public.whatsapp_health_events (org_id, event_type, source, item_id)
    values (p_org_id, 'item_requeued', 'health_action', p_item_id);
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.requeue_whatsapp_dead_item(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.requeue_whatsapp_dead_item(uuid, text, uuid) to service_role;

create or replace function public.cleanup_whatsapp_health_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.whatsapp_health_events where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_whatsapp_health_events() from public, anon, authenticated;
grant execute on function public.cleanup_whatsapp_health_events() to service_role;

comment on table public.whatsapp_health_events is
  'Telemetria técnica service-only do WhatsApp. Não armazena conteúdo, telefone, URL, header ou segredo.';
comment on function public.requeue_whatsapp_dead_item(uuid, text, uuid) is
  'Reabre um item morto da empresa sem ativar fila, sender ou endpoint automaticamente.';
