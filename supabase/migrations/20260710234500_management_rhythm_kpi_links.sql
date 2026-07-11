-- Monthly management pulse, lightweight weekly WhatsApp invitation and objective/KPI links.

alter table public.check_ins
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.conversations
  add column if not exists pending_context jsonb not null default '{}'::jsonb;

alter table public.whatsapp_settings
  add column if not exists weekly_pulse_enabled boolean not null default false,
  add column if not exists weekly_pulse_weekday smallint not null default 5
    check (weekly_pulse_weekday between 1 and 7),
  add column if not exists weekly_pulse_hour smallint not null default 16
    check (weekly_pulse_hour between 0 and 23);

create table if not exists public.objective_kpi_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  kpi_id uuid not null references public.executive_kpis(id) on delete cascade,
  rationale text not null default '',
  confidence numeric not null default 0 check (confidence between 0 and 1),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (objective_id, kpi_id)
);

create index if not exists objective_kpi_links_org_kpi_idx
on public.objective_kpi_links (org_id, kpi_id);

alter table public.objective_kpi_links enable row level security;
grant select, insert, update, delete on public.objective_kpi_links to authenticated;
grant select, insert, update, delete on public.objective_kpi_links to service_role;

drop policy if exists objective_kpi_links_read_member on public.objective_kpi_links;
create policy objective_kpi_links_read_member
on public.objective_kpi_links for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists objective_kpi_links_write_objective_editor on public.objective_kpi_links;
create policy objective_kpi_links_write_objective_editor
on public.objective_kpi_links for all
to authenticated
using (public.can_write_objective(org_id, objective_id))
with check (
  public.can_write_objective(org_id, objective_id)
  and exists (
    select 1 from public.executive_kpis k
    where k.id = kpi_id and k.org_id = objective_kpi_links.org_id
  )
);

create table if not exists public.weekly_pulse_log (
  org_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  week_start date not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (org_id, membership_id, week_start)
);

alter table public.weekly_pulse_log enable row level security;
revoke all on public.weekly_pulse_log from anon, authenticated;
grant select, insert, update, delete on public.weekly_pulse_log to service_role;

alter table public.objective_kpi_links replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'objective_kpi_links'
  ) then
    alter publication supabase_realtime add table public.objective_kpi_links;
  end if;
end $$;

create or replace function public.invoke_weekly_pulse()
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
    url := 'https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/weekly-pulse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-cron-secret', secret_value
    ),
    body := '{}'::jsonb
  ) into request_id;

  return request_id;
end
$$;

revoke all on function public.invoke_weekly_pulse() from public, anon, authenticated;
grant execute on function public.invoke_weekly_pulse() to postgres, service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'oraculo-weekly-pulse';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'oraculo-weekly-pulse',
  '5 * * * *',
  $$select public.invoke_weekly_pulse();$$
);
