alter table public.whatsapp_settings
  add column if not exists inbound_queue_enabled boolean not null default false;

create or replace function public.protect_whatsapp_inbound_queue_flag()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' then
    if (tg_op = 'INSERT' and new.inbound_queue_enabled = true)
      or (tg_op = 'UPDATE' and new.inbound_queue_enabled is distinct from old.inbound_queue_enabled) then
      raise exception 'A fila de entrada do WhatsApp só pode ser alterada pelo serviço';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_whatsapp_inbound_queue_flag() from public, anon, authenticated;

drop trigger if exists protect_whatsapp_inbound_queue_flag on public.whatsapp_settings;
create trigger protect_whatsapp_inbound_queue_flag
before insert or update of inbound_queue_enabled on public.whatsapp_settings
for each row execute function public.protect_whatsapp_inbound_queue_flag();

create table if not exists public.whatsapp_inbound_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  correlation_id uuid not null default gen_random_uuid(),
  user_id uuid,
  phone text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint whatsapp_inbound_jobs_org_event_unique unique (org_id, event_key),
  constraint whatsapp_inbound_jobs_correlation_unique unique (correlation_id),
  constraint whatsapp_inbound_jobs_kind_check check (kind in ('text', 'audio', 'document')),
  constraint whatsapp_inbound_jobs_status_check check (status in ('queued', 'processing', 'completed', 'retry', 'dead')),
  constraint whatsapp_inbound_jobs_attempt_check check (attempt_count >= 0),
  constraint whatsapp_inbound_jobs_phone_check check (phone ~ '^\+[0-9]{8,15}$'),
  constraint whatsapp_inbound_jobs_event_key_check check (char_length(event_key) between 1 and 500),
  constraint whatsapp_inbound_jobs_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint whatsapp_inbound_jobs_payload_size_check check (octet_length(payload::text) <= 16384),
  constraint whatsapp_inbound_jobs_error_code_check check (last_error_code is null or char_length(last_error_code) <= 80),
  constraint whatsapp_inbound_jobs_error_message_check check (last_error_message is null or char_length(last_error_message) <= 1000)
);

create index if not exists whatsapp_inbound_jobs_ready_idx
on public.whatsapp_inbound_jobs (status, next_retry_at, created_at)
where status in ('queued', 'retry');

create index if not exists whatsapp_inbound_jobs_conversation_idx
on public.whatsapp_inbound_jobs (org_id, user_id, phone, created_at);

create index if not exists whatsapp_inbound_jobs_expiry_idx
on public.whatsapp_inbound_jobs (expires_at);

alter table public.whatsapp_inbound_jobs enable row level security;

revoke all on public.whatsapp_inbound_jobs from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_inbound_jobs to service_role;

create or replace function public.enqueue_whatsapp_inbound_job(
  p_org_id uuid,
  p_event_key text,
  p_phone text,
  p_user_id uuid,
  p_kind text,
  p_payload jsonb
)
returns table(job_id uuid, correlation_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_correlation_id uuid;
  v_inserted boolean := false;
  v_allowed_keys text[];
begin
  if not exists (
    select 1
    from public.whatsapp_settings settings
    where settings.org_id = p_org_id
      and settings.enabled = true
      and settings.inbound_queue_enabled = true
  ) then
    raise exception 'Fila de entrada do WhatsApp não está habilitada para esta empresa';
  end if;

  if p_kind not in ('text', 'audio', 'document') then
    raise exception 'Tipo de job do WhatsApp inválido';
  end if;
  if p_event_key is null or char_length(p_event_key) not between 1 and 500 then
    raise exception 'Chave do evento do WhatsApp inválida';
  end if;
  if p_phone is null or p_phone !~ '^\+[0-9]{8,15}$' then
    raise exception 'Telefone do job do WhatsApp inválido';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 16384 then
    raise exception 'Payload do job do WhatsApp inválido';
  end if;

  v_allowed_keys := case
    when p_kind = 'text' then array['messageId', 'text']
    else array['messageId', 'remoteJid', 'mimeType', 'fileName', 'caption']
  end;
  if p_payload - v_allowed_keys <> '{}'::jsonb then
    raise exception 'Payload do job do WhatsApp contém campos não permitidos';
  end if;
  if exists (
    select 1
    from jsonb_each(p_payload) item
    where jsonb_typeof(item.value) not in ('string', 'null')
  ) then
    raise exception 'Payload do job do WhatsApp deve conter apenas valores textuais';
  end if;

  if p_user_id is not null and not exists (
    select 1
    from public.memberships membership
    where membership.org_id = p_org_id
      and membership.user_id = p_user_id
  ) then
    raise exception 'Usuário do job não pertence à empresa';
  end if;

  insert into public.whatsapp_inbound_jobs (
    org_id,
    event_key,
    user_id,
    phone,
    kind,
    payload,
    expires_at
  )
  values (
    p_org_id,
    p_event_key,
    p_user_id,
    p_phone,
    p_kind,
    p_payload,
    now() + case when p_kind = 'text' then interval '7 days' else interval '24 hours' end
  )
  on conflict (org_id, event_key) do nothing
  returning id, whatsapp_inbound_jobs.correlation_id into v_id, v_correlation_id;

  if v_id is not null then
    v_inserted := true;
  else
    select job.id, job.correlation_id
      into v_id, v_correlation_id
    from public.whatsapp_inbound_jobs job
    where job.org_id = p_org_id
      and job.event_key = p_event_key;
  end if;

  job_id := v_id;
  correlation_id := v_correlation_id;
  inserted := v_inserted;
  return next;
end;
$$;

revoke all on function public.enqueue_whatsapp_inbound_job(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_whatsapp_inbound_job(uuid, text, text, uuid, text, jsonb) to service_role;

comment on table public.whatsapp_inbound_jobs is
  'Fila durável de entrada do WhatsApp. Não armazena mídia, base64, URL temporária, mediaKey ou segredo.';
comment on column public.whatsapp_settings.inbound_queue_enabled is
  'Feature flag da fila de entrada. Nasce false; só ativar quando houver worker validado para a empresa.';
