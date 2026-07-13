alter table public.whatsapp_settings
  add column if not exists outbound_outbox_enabled boolean not null default false;

create or replace function public.protect_whatsapp_outbound_outbox_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' then
    if (tg_op = 'INSERT' and new.outbound_outbox_enabled = true)
      or (tg_op = 'UPDATE' and new.outbound_outbox_enabled is distinct from old.outbound_outbox_enabled) then
      raise exception 'A outbox do WhatsApp só pode ser alterada pelo serviço';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_whatsapp_outbound_outbox_flag() from public, anon, authenticated;

drop trigger if exists protect_whatsapp_outbound_outbox_flag on public.whatsapp_settings;
create trigger protect_whatsapp_outbound_outbox_flag
before insert or update of outbound_outbox_enabled on public.whatsapp_settings
for each row execute function public.protect_whatsapp_outbound_outbox_flag();

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  correlation_id uuid not null,
  destination text not null,
  content text not null,
  part_index smallint not null default 0,
  part_count smallint not null default 1,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  provider_http_status integer,
  provider_message_id text,
  provider_status text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint whatsapp_outbox_message_part_unique unique (chat_message_id, part_index),
  constraint whatsapp_outbox_destination_check check (destination ~ '^\+[0-9]{8,15}$'),
  constraint whatsapp_outbox_content_check check (char_length(content) between 1 and 12000),
  constraint whatsapp_outbox_part_check check (part_count between 1 and 3 and part_index >= 0 and part_index < part_count),
  constraint whatsapp_outbox_status_check check (status in ('queued', 'sending', 'retry', 'sent', 'dead')),
  constraint whatsapp_outbox_attempt_check check (attempt_count >= 0),
  constraint whatsapp_outbox_http_status_check check (provider_http_status is null or provider_http_status between 100 and 599),
  constraint whatsapp_outbox_provider_id_check check (provider_message_id is null or char_length(provider_message_id) <= 200),
  constraint whatsapp_outbox_provider_status_check check (provider_status is null or char_length(provider_status) <= 80),
  constraint whatsapp_outbox_error_code_check check (last_error_code is null or char_length(last_error_code) <= 80),
  constraint whatsapp_outbox_error_message_check check (last_error_message is null or char_length(last_error_message) <= 1000)
);

create index if not exists whatsapp_outbox_ready_idx
on public.whatsapp_outbox (status, next_retry_at, created_at)
where status in ('queued', 'retry');

create index if not exists whatsapp_outbox_destination_order_idx
on public.whatsapp_outbox (org_id, destination, created_at, part_index);

create index if not exists whatsapp_outbox_correlation_idx
on public.whatsapp_outbox (correlation_id);

alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_outbox from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_outbox to service_role;

create table if not exists public.whatsapp_sender_secrets (
  id text primary key default 'sender',
  sender_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  endpoint_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_sender_secrets_endpoint_check check (endpoint_url is null or endpoint_url ~ '^https://[^[:space:]]+$')
);

alter table public.whatsapp_sender_secrets enable row level security;
revoke all on public.whatsapp_sender_secrets from anon, authenticated;
grant select, insert, update on public.whatsapp_sender_secrets to service_role;
insert into public.whatsapp_sender_secrets (id) values ('sender') on conflict (id) do nothing;

create or replace function public.insert_whatsapp_oracle_message(
  p_org_id uuid,
  p_area_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_text text,
  p_contents text[],
  p_queue_delivery boolean default true,
  p_correlation_id uuid default null
)
returns table(
  message_id uuid,
  message_author text,
  message_text text,
  message_created_at timestamptz,
  outbox_ids uuid[],
  correlation_id uuid,
  queued boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message_id uuid := gen_random_uuid();
  v_outbox_ids uuid[] := '{}'::uuid[];
  v_enabled boolean := false;
  v_phone text;
  v_destination text;
  v_correlation_id uuid := coalesce(p_correlation_id, gen_random_uuid());
  v_content text;
  v_part integer;
  v_outbox_id uuid;
  v_message_created_at timestamptz;
begin
  if p_text is null or char_length(p_text) < 1 then
    raise exception 'Resposta do Oráculo vazia';
  end if;
  if not exists (
    select 1 from public.conversations conversation
    where conversation.id = p_conversation_id
      and conversation.org_id = p_org_id
      and conversation.user_id = p_user_id
      and conversation.channel = 'whatsapp'
  ) then
    raise exception 'Conversa do WhatsApp inválida para a resposta';
  end if;
  if p_area_id is not null and not exists (
    select 1 from public.areas area where area.id = p_area_id and area.org_id = p_org_id
  ) then
    raise exception 'Área inválida para a resposta';
  end if;

  select coalesce(settings.outbound_outbox_enabled, false)
    into v_enabled
  from public.whatsapp_settings settings
  where settings.org_id = p_org_id;
  v_enabled := coalesce(v_enabled, false) and coalesce(p_queue_delivery, true);

  if v_enabled then
    if p_contents is null or coalesce(array_length(p_contents, 1), 0) not between 1 and 3 then
      raise exception 'Blocos da resposta do WhatsApp inválidos';
    end if;
    foreach v_content in array p_contents loop
      if v_content is null or char_length(v_content) not between 1 and 12000 then
        raise exception 'Conteúdo da resposta do WhatsApp inválido';
      end if;
    end loop;

    select profile.phone into v_phone from public.profiles profile where profile.id = p_user_id;
    v_destination := '+' || regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
    if v_destination !~ '^\+[0-9]{8,15}$' then
      raise exception 'Celular do destinatário inválido para a outbox';
    end if;
  end if;

  insert into public.chat_messages (
    id, org_id, area_id, user_id, conversation_id, author, text, channel
  ) values (
    v_message_id, p_org_id, p_area_id, p_user_id, p_conversation_id, 'oracle', p_text, 'whatsapp'
  ) returning created_at into v_message_created_at;

  update public.conversations
  set last_message_at = now()
  where id = p_conversation_id;

  if v_enabled then
    for v_part in 1..array_length(p_contents, 1) loop
      insert into public.whatsapp_outbox (
        org_id,
        chat_message_id,
        correlation_id,
        destination,
        content,
        part_index,
        part_count
      ) values (
        p_org_id,
        v_message_id,
        v_correlation_id,
        v_destination,
        p_contents[v_part],
        v_part - 1,
        array_length(p_contents, 1)
      )
      returning id into v_outbox_id;
      v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);
    end loop;
  end if;

  message_id := v_message_id;
  message_author := 'oracle';
  message_text := p_text;
  message_created_at := v_message_created_at;
  outbox_ids := v_outbox_ids;
  correlation_id := v_correlation_id;
  queued := v_enabled;
  return next;
end;
$$;

revoke all on function public.insert_whatsapp_oracle_message(uuid, uuid, uuid, uuid, text, text[], boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.insert_whatsapp_oracle_message(uuid, uuid, uuid, uuid, text, text[], boolean, uuid)
  to service_role;

create or replace function public.claim_whatsapp_outbox_item(
  p_worker_id text,
  p_org_id uuid default null,
  p_lock_timeout_seconds integer default 120
)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.whatsapp_outbox%rowtype;
begin
  if p_worker_id is null or char_length(p_worker_id) not between 8 and 120 then
    raise exception 'Identificador do sender inválido';
  end if;
  if p_lock_timeout_seconds not between 30 and 900 then
    raise exception 'Timeout de lock inválido';
  end if;

  update public.whatsapp_outbox item
  set status = case when item.attempt_count >= 5 then 'dead' else 'retry' end,
      next_retry_at = now(),
      locked_at = null,
      locked_by = null,
      last_error_code = 'lock_expired',
      last_error_message = 'Sender anterior perdeu o lock antes de confirmar o envio',
      updated_at = now()
  where item.status = 'sending'
    and item.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
    and (p_org_id is null or item.org_id = p_org_id);

  update public.whatsapp_outbox item
  set status = 'dead',
      last_error_code = 'attempts_exhausted',
      last_error_message = 'Limite de tentativas de envio esgotado',
      updated_at = now()
  where item.status in ('queued', 'retry')
    and item.attempt_count >= 5
    and (p_org_id is null or item.org_id = p_org_id);

  select candidate.* into v_item
  from public.whatsapp_outbox candidate
  where candidate.status in ('queued', 'retry')
    and candidate.next_retry_at <= now()
    and candidate.attempt_count < 5
    and (p_org_id is null or candidate.org_id = p_org_id)
    and not exists (
      select 1
      from public.whatsapp_outbox earlier
      where earlier.org_id = candidate.org_id
        and earlier.destination = candidate.destination
        and earlier.status in ('queued', 'sending', 'retry')
        and (earlier.created_at, earlier.part_index, earlier.id::text)
          < (candidate.created_at, candidate.part_index, candidate.id::text)
    )
  order by candidate.next_retry_at, candidate.created_at, candidate.part_index, candidate.id
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.whatsapp_outbox item
  set status = 'sending',
      attempt_count = item.attempt_count + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  where item.id = v_item.id
  returning item.* into v_item;

  return next v_item;
end;
$$;

create or replace function public.heartbeat_whatsapp_outbox_item(p_item_id uuid, p_worker_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with refreshed as (
    update public.whatsapp_outbox
    set locked_at = now(), updated_at = now()
    where id = p_item_id and status = 'sending' and locked_by = p_worker_id
    returning id
  )
  select exists(select 1 from refreshed);
$$;

create or replace function public.complete_whatsapp_outbox_item(
  p_item_id uuid,
  p_worker_id text,
  p_http_status integer,
  p_provider_message_id text,
  p_provider_status text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with completed as (
    update public.whatsapp_outbox
    set status = 'sent',
        locked_at = null,
        locked_by = null,
        provider_http_status = p_http_status,
        provider_message_id = left(nullif(p_provider_message_id, ''), 200),
        provider_status = left(nullif(p_provider_status, ''), 80),
        last_error_code = null,
        last_error_message = null,
        sent_at = now(),
        updated_at = now()
    where id = p_item_id
      and status = 'sending'
      and locked_by = p_worker_id
      and p_http_status between 200 and 299
    returning id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_whatsapp_outbox_item(
  p_item_id uuid,
  p_worker_id text,
  p_transient boolean,
  p_error_code text,
  p_error_message text,
  p_http_status integer default null,
  p_retry_after_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.whatsapp_outbox%rowtype;
  v_retry boolean;
  v_delay integer;
begin
  select * into v_item from public.whatsapp_outbox where id = p_item_id for update;
  if not found or v_item.status <> 'sending' or v_item.locked_by <> p_worker_id then
    raise exception 'Sender não possui o lock deste item';
  end if;
  if p_http_status is not null and p_http_status not between 100 and 599 then
    raise exception 'Status HTTP inválido';
  end if;
  if p_retry_after_seconds is not null and p_retry_after_seconds not between 0 and 3600 then
    raise exception 'Atraso de retry inválido';
  end if;

  v_retry := coalesce(p_transient, false) and v_item.attempt_count < 5;
  v_delay := coalesce(
    p_retry_after_seconds,
    case v_item.attempt_count when 1 then 10 when 2 then 30 when 3 then 120 else 600 end
  );

  update public.whatsapp_outbox
  set status = case when v_retry then 'retry' else 'dead' end,
      next_retry_at = case when v_retry then now() + make_interval(secs => v_delay) else next_retry_at end,
      locked_at = null,
      locked_by = null,
      provider_http_status = p_http_status,
      last_error_code = left(coalesce(nullif(p_error_code, ''), 'send_error'), 80),
      last_error_message = left(coalesce(nullif(p_error_message, ''), 'Falha no envio'), 1000),
      updated_at = now()
  where id = p_item_id;

  return case when v_retry then 'retry' else 'dead' end;
end;
$$;

create or replace function public.cleanup_whatsapp_outbox()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.whatsapp_outbox
  where (status = 'sent' and sent_at < now() - interval '24 hours')
     or (status = 'dead' and updated_at < now() - interval '7 days');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_whatsapp_outbox_item(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_whatsapp_outbox_item(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_whatsapp_outbox_item(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.fail_whatsapp_outbox_item(uuid, text, boolean, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.cleanup_whatsapp_outbox() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox_item(text, uuid, integer) to service_role;
grant execute on function public.heartbeat_whatsapp_outbox_item(uuid, text) to service_role;
grant execute on function public.complete_whatsapp_outbox_item(uuid, text, integer, text, text) to service_role;
grant execute on function public.fail_whatsapp_outbox_item(uuid, text, boolean, text, text, integer, integer) to service_role;
grant execute on function public.cleanup_whatsapp_outbox() to service_role;

create or replace function public.invoke_whatsapp_sender_cron()
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
  select sender_secret, endpoint_url into strict secret_value, endpoint_value
  from public.whatsapp_sender_secrets
  where id = 'sender';

  if endpoint_value is null or endpoint_value = '' then
    return null;
  end if;

  select net.http_post(
    url := endpoint_value,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-sender-secret', secret_value
    ),
    body := jsonb_build_object('source', 'cron', 'batchSize', 10)
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_whatsapp_sender_cron() from public, anon, authenticated;
grant execute on function public.invoke_whatsapp_sender_cron() to postgres, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'oraculo-whatsapp-sender' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'oraculo-whatsapp-sender',
  '* * * * *',
  'select public.invoke_whatsapp_sender_cron();'
);

comment on table public.whatsapp_outbox is
  'Fila service-only de respostas formatadas do Oráculo. Cada item representa um único POST para evitar retry parcial de blocos.';
comment on table public.whatsapp_sender_secrets is
  'Segredo e endpoint service-only do sender. Endpoint nulo mantém o acionamento automático inerte.';
comment on column public.whatsapp_settings.outbound_outbox_enabled is
  'Feature flag da outbox. Nasce false e só pode ser alterada pelo serviço.';
