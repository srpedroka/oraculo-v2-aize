-- Dono como membro real + lembrete diário de prazos por WhatsApp.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Vínculo opcional a um membro (o texto livre `owner` continua para donos externos).
alter table public.objectives add column if not exists owner_membership_id uuid references public.memberships(id) on delete set null;
alter table public.key_actions add column if not exists owner_membership_id uuid references public.memberships(id) on delete set null;
alter table public.strategic_projects add column if not exists owner_membership_id uuid references public.memberships(id) on delete set null;

create index if not exists objectives_owner_membership_idx on public.objectives (org_id, owner_membership_id);
create index if not exists key_actions_owner_membership_idx on public.key_actions (org_id, owner_membership_id);
create index if not exists strategic_projects_owner_membership_idx on public.strategic_projects (org_id, owner_membership_id);

-- Idempotência: no máximo um lembrete por pessoa por dia.
create table if not exists public.deadline_nudge_log (
  org_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  sent_on date not null,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  primary key (org_id, membership_id, sent_on)
);
alter table public.deadline_nudge_log enable row level security;
revoke all on public.deadline_nudge_log from anon, authenticated;
grant select, insert, delete on public.deadline_nudge_log to service_role;

-- Segredo do cron: mora no banco (mesmo padrão do backup), sem env var.
create table if not exists public.deadline_nudge_secrets (
  id text primary key default 'cron',
  cron_secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.deadline_nudge_secrets enable row level security;
revoke all on public.deadline_nudge_secrets from anon, authenticated;
grant select on public.deadline_nudge_secrets to service_role;
insert into public.deadline_nudge_secrets (id) values ('cron') on conflict (id) do nothing;

create or replace function public.invoke_deadline_nudges_cron()
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
  from public.deadline_nudge_secrets
  where id = 'cron';

  select net.http_post(
    url := 'https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/deadline-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-cron-secret', secret_value
    ),
    body := jsonb_build_object('action', 'cron')
  ) into request_id;

  return request_id;
end
$$;

revoke all on function public.invoke_deadline_nudges_cron() from public, anon, authenticated;
grant execute on function public.invoke_deadline_nudges_cron() to postgres, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'oraculo-deadline-nudges'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

-- 11:00 UTC ~= 08:00 America/Sao_Paulo.
select cron.schedule(
  'oraculo-deadline-nudges',
  '0 11 * * *',
  'select public.invoke_deadline_nudges_cron();'
);
