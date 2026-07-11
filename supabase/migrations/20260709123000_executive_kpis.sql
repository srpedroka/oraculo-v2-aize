-- Executive dashboard KPIs.
-- Adds monthly numeric KPI tracking for Resultado without changing planning objectives.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'coordinator'));

create or replace function public.is_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and org_id = target_org
      and role in ('owner', 'admin')
  )
$$;

create table if not exists public.executive_kpis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kpi_key text not null check (kpi_key in ('revenue', 'operating_margin', 'production', 'cash')),
  label text not null,
  unit text not null default 'currency'
    check (unit in ('currency', 'percent', 'count', 'number')),
  secondary_unit text
    check (secondary_unit is null or secondary_unit in ('count', 'number')),
  direction text not null default 'higher_better'
    check (direction in ('higher_better', 'lower_better')),
  flow_type text not null default 'flow'
    check (flow_type in ('flow', 'stock')),
  is_ladder boolean not null default false,
  ladder jsonb not null default '[]'::jsonb,
  opening_balance numeric,
  annual_target numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, kpi_key)
);

create table if not exists public.kpi_monthly_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kpi_id uuid not null references public.executive_kpis(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  target_value numeric,
  target_stage text,
  actual_value numeric,
  secondary_actual numeric,
  note text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (kpi_id, year, month)
);

create index if not exists kpi_monthly_values_lookup_idx
on public.kpi_monthly_values (org_id, kpi_id, year, month);

alter table public.executive_kpis enable row level security;
alter table public.kpi_monthly_values enable row level security;

grant select, insert, update, delete on public.executive_kpis to authenticated;
grant select, insert, update, delete on public.kpi_monthly_values to authenticated;
grant select, insert, update, delete on public.executive_kpis to service_role;
grant select, insert, update, delete on public.kpi_monthly_values to service_role;
grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists executive_kpis_read_member on public.executive_kpis;
create policy executive_kpis_read_member
on public.executive_kpis for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists executive_kpis_write_admin on public.executive_kpis;
create policy executive_kpis_write_admin
on public.executive_kpis for all
to authenticated
using (public.is_admin(org_id))
with check (public.is_admin(org_id));

drop policy if exists kpi_values_read_member on public.kpi_monthly_values;
create policy kpi_values_read_member
on public.kpi_monthly_values for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists kpi_values_write_admin on public.kpi_monthly_values;
create policy kpi_values_write_admin
on public.kpi_monthly_values for all
to authenticated
using (public.is_admin(org_id))
with check (public.is_admin(org_id));

insert into public.executive_kpis (
  org_id,
  kpi_key,
  label,
  unit,
  secondary_unit,
  direction,
  flow_type,
  is_ladder,
  ladder,
  sort_order
)
select
  org.id,
  seed.kpi_key,
  seed.label,
  seed.unit,
  seed.secondary_unit,
  seed.direction,
  seed.flow_type,
  seed.is_ladder,
  seed.ladder,
  seed.sort_order
from public.organizations org
cross join (
  values
    ('revenue', 'Faturamento', 'currency', null::text, 'higher_better', 'flow', false, '[]'::jsonb, 10),
    ('operating_margin', 'Margem operacional', 'percent', null::text, 'higher_better', 'flow', false, '[]'::jsonb, 20),
    ('production', 'Produção', 'currency', 'count', 'higher_better', 'flow', false, '[]'::jsonb, 30),
    (
      'cash',
      'Caixa',
      'currency',
      null::text,
      'higher_better',
      'stock',
      true,
      '[
        {"key":"stop_bleed","label":"Estancar sangria","order":1},
        {"key":"operational_zero","label":"Operacional >= 0","order":2},
        {"key":"service_debt","label":"Aguentar a divida","order":3},
        {"key":"surplus","label":"Sobrar","order":4}
      ]'::jsonb,
      40
    )
) as seed(kpi_key, label, unit, secondary_unit, direction, flow_type, is_ladder, ladder, sort_order)
on conflict (org_id, kpi_key) do nothing;

alter table public.executive_kpis replica identity full;
alter table public.kpi_monthly_values replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'executive_kpis'
  ) then
    alter publication supabase_realtime add table public.executive_kpis;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kpi_monthly_values'
  ) then
    alter publication supabase_realtime add table public.kpi_monthly_values;
  end if;
end $$;
