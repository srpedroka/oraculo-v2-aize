alter table public.organization_restore_runs
  add column if not exists exercise_type text not null default 'restore'
  check (exercise_type in ('restore', 'monthly_drill', 'disaster_drill'));

create index if not exists organization_restore_runs_exercise_idx
on public.organization_restore_runs (source_org_id, exercise_type, completed_at desc)
where status = 'completed';

create table public.operational_safety_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  event_type text not null check (event_type in ('destructive_schema_change')),
  event_key text not null,
  detail text not null,
  occurred_at timestamptz not null default now(),
  unique (org_id, event_type, event_key)
);

create index operational_safety_events_org_occurred_idx
on public.operational_safety_events (org_id, occurred_at desc);

alter table public.operational_safety_events enable row level security;
revoke all on public.operational_safety_events from public, anon, authenticated;
grant select, insert, update, delete on public.operational_safety_events to service_role;

create or replace function public.record_destructive_schema_change(p_migration_names text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_names text[];
  event_key_value text;
  inserted_count integer;
begin
  select coalesce(array_agg(left(regexp_replace(name, '[^0-9a-zA-Z_.-]', '', 'g'), 160)), array[]::text[])
  into safe_names
  from unnest(coalesce(p_migration_names, array[]::text[])) as migration_name(name)
  where length(trim(name)) > 0;

  if cardinality(safe_names) = 0 then
    raise exception 'Informe a migration destrutiva aprovada';
  end if;

  event_key_value := encode(extensions.digest(array_to_string(safe_names, ','), 'sha256'), 'hex');

  insert into public.operational_safety_events (org_id, event_type, event_key, detail)
  select id, 'destructive_schema_change', event_key_value,
    'Uma alteração destrutiva de estrutura foi aplicada: ' || array_to_string(safe_names, ', ')
  from public.organizations
  where archived_at is null
  on conflict (org_id, event_type, event_key) do update
  set occurred_at = now(), detail = excluded.detail;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.record_destructive_schema_change(text[]) from public, anon, authenticated;
grant execute on function public.record_destructive_schema_change(text[]) to postgres, service_role;

comment on table public.operational_safety_events is
  'Eventos técnicos sanitizados que precisam permanecer visíveis no monitor operacional.';
comment on column public.organization_restore_runs.exercise_type is
  'Distingue restauração comum, teste mensal assistido e exercício trimestral de desastre.';
