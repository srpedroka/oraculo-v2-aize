-- Etapa 6 / Fatia 6E: trilha administrativa owner-only, sanitizada e imutavel.

create table if not exists public.administrative_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('people', 'ai', 'whatsapp', 'security', 'backup', 'data')),
  action text not null check (char_length(action) between 1 and 80),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default 'Sistema' check (char_length(actor_name) between 1 and 120),
  target_type text not null check (char_length(target_type) between 1 and 60),
  target_id text check (target_id is null or char_length(target_id) <= 160),
  target_user_id uuid references auth.users(id) on delete set null,
  target_label text check (target_label is null or char_length(target_label) <= 160),
  before_data jsonb not null default '{}'::jsonb check (jsonb_typeof(before_data) = 'object'),
  after_data jsonb not null default '{}'::jsonb check (jsonb_typeof(after_data) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text not null check (char_length(request_id) between 1 and 160),
  source text not null default 'edge_function' check (source in ('edge_function', 'migration', 'system')),
  created_at timestamptz not null default now(),
  unique (org_id, request_id, action)
);

create index if not exists administrative_audit_org_cursor_idx
on public.administrative_audit_events (org_id, created_at desc, id desc);

create index if not exists administrative_audit_org_category_idx
on public.administrative_audit_events (org_id, category, created_at desc, id desc);

alter table public.administrative_audit_events enable row level security;

revoke all on public.administrative_audit_events from anon;
revoke insert, update, delete on public.administrative_audit_events from authenticated;
grant select on public.administrative_audit_events to authenticated;
grant select, insert on public.administrative_audit_events to service_role;

drop policy if exists administrative_audit_read_owner on public.administrative_audit_events;
create policy administrative_audit_read_owner
on public.administrative_audit_events for select
to authenticated
using (public.is_owner(org_id));

comment on table public.administrative_audit_events is
  'Trilha administrativa imutavel, legivel somente por owner e sem segredos ou conteudo de negocio.';

-- A politica de retencao atual e global e versionada em migration. Registra o
-- baseline por empresa; futuras mudancas devem inserir uma nova versao aqui.
insert into public.administrative_audit_events (
  org_id, category, action, actor_name, target_type, target_id, target_label,
  before_data, after_data, metadata, request_id, source
)
select
  organization.id,
  'data',
  'retention_policy_baseline',
  'Sistema',
  'retention_policy',
  '2026-07-15-r2',
  'Politica de retencao tecnica',
  '{}'::jsonb,
  jsonb_build_object('version', '2026-07-15-r2', 'automaticCleanup', true),
  jsonb_build_object('migration', '20260715193000_administrative_audit.sql'),
  'migration:20260715193000',
  'migration'
from public.organizations organization
on conflict (org_id, request_id, action) do nothing;

create or replace function public.seed_administrative_retention_baseline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.administrative_audit_events (
    org_id, category, action, actor_name, target_type, target_id, target_label,
    before_data, after_data, metadata, request_id, source
  ) values (
    new.id,
    'data',
    'retention_policy_baseline',
    'Sistema',
    'retention_policy',
    '2026-07-15-r2',
    'Política de retenção técnica',
    '{}'::jsonb,
    jsonb_build_object('version', '2026-07-15-r2', 'automaticCleanup', true),
    jsonb_build_object('migration', '20260715193000_administrative_audit.sql'),
    'system:retention-policy-baseline',
    'system'
  )
  on conflict (org_id, request_id, action) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_administrative_retention_baseline() from public;
grant execute on function public.seed_administrative_retention_baseline() to service_role;

drop trigger if exists organizations_seed_administrative_retention_baseline on public.organizations;
create trigger organizations_seed_administrative_retention_baseline
after insert on public.organizations
for each row execute function public.seed_administrative_retention_baseline();

-- Amplia a anonimização da Fatia 6D para a nova auditoria.
create or replace function public.guard_and_anonymize_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blocking_org_name text;
begin
  perform 1
  from public.memberships membership
  where membership.org_id in (
    select owned.org_id
    from public.memberships owned
    where owned.user_id = old.id
      and owned.role = 'owner'
  )
  order by membership.org_id, membership.id
  for update;

  select organization.name
  into blocking_org_name
  from public.memberships owned
  join public.organizations organization on organization.id = owned.org_id
  where owned.user_id = old.id
    and owned.role = 'owner'
    and (
      select count(*)
      from public.memberships other_owner
      where other_owner.org_id = owned.org_id
        and other_owner.role = 'owner'
    ) <= 1
  order by organization.name
  limit 1;

  if blocking_org_name is not null then
    raise exception 'Você é o único dono de %. Promova outro owner ou encerre a empresa antes de excluir a conta.', blocking_org_name;
  end if;

  update public.organization_lifecycle_audit
  set actor_user_id = null,
      actor_email = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('actorAnonymized', true)
  where actor_user_id = old.id;

  update public.administrative_audit_events
  set actor_user_id = null,
      actor_name = 'Usuário removido',
      metadata = metadata || jsonb_build_object('actorAnonymized', true)
  where actor_user_id = old.id;

  update public.administrative_audit_events
  set target_user_id = null,
      target_label = 'Usuário removido',
      metadata = metadata || jsonb_build_object('targetAnonymized', true)
  where target_user_id = old.id;

  return old;
end;
$$;
