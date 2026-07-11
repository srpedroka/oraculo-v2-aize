-- Reversible lifecycle for operational records and immutable revision history.

alter table public.objectives
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.key_actions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.strategic_projects
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.evidences
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.check_ins
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.plan_documents
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archive_batch_id uuid;

alter table public.strategic_plans
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.area_plans
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists objectives_org_active_idx
on public.objectives (org_id, archived_at, area_id, level, period);

create index if not exists key_actions_org_active_idx
on public.key_actions (org_id, archived_at, objective_id);

create index if not exists strategic_projects_org_active_idx
on public.strategic_projects (org_id, archived_at, plan_id);

create index if not exists evidences_org_active_idx
on public.evidences (org_id, archived_at, objective_id, created_at desc);

create index if not exists check_ins_org_active_idx
on public.check_ins (org_id, archived_at, area_id, period, created_at desc);

create index if not exists plan_documents_org_active_idx
on public.plan_documents (org_id, archived_at, type, period, created_at desc);

create table if not exists public.operational_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'strategic_plan',
      'area_plan',
      'objective',
      'key_action',
      'strategic_project',
      'evidence',
      'check_in',
      'plan_document',
      'executive_kpi',
      'kpi_monthly_value'
    )
  ),
  entity_id uuid not null,
  action text not null check (action in ('update', 'archive', 'restore')),
  before_data jsonb not null,
  after_data jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operational_revisions_org_created_idx
on public.operational_revisions (org_id, created_at desc);

create index if not exists operational_revisions_entity_idx
on public.operational_revisions (org_id, entity_type, entity_id, created_at desc);

alter table public.operational_revisions enable row level security;

grant select on public.operational_revisions to authenticated;
grant select, insert, update, delete on public.operational_revisions to service_role;

drop policy if exists operational_revisions_read_member on public.operational_revisions;
create policy operational_revisions_read_member
on public.operational_revisions for select
to authenticated
using (public.is_org_member(org_id));

create or replace function public.capture_operational_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
  actor_text text;
  revision_action text := 'update';
  revision_entity_type text;
begin
  if old_data = new_data then
    return new;
  end if;

  if old_data ? 'archived_at' then
    if nullif(old_data ->> 'archived_at', '') is null and nullif(new_data ->> 'archived_at', '') is not null then
      revision_action := 'archive';
    elsif nullif(old_data ->> 'archived_at', '') is not null and nullif(new_data ->> 'archived_at', '') is null then
      revision_action := 'restore';
    end if;
  end if;

  revision_entity_type := case tg_table_name
    when 'strategic_plans' then 'strategic_plan'
    when 'area_plans' then 'area_plan'
    when 'objectives' then 'objective'
    when 'key_actions' then 'key_action'
    when 'strategic_projects' then 'strategic_project'
    when 'evidences' then 'evidence'
    when 'check_ins' then 'check_in'
    when 'plan_documents' then 'plan_document'
    when 'executive_kpis' then 'executive_kpi'
    when 'kpi_monthly_values' then 'kpi_monthly_value'
    else tg_table_name
  end;

  actor_text := coalesce(
    nullif(current_setting('app.lifecycle_actor', true), ''),
    nullif(new_data ->> 'updated_by', ''),
    nullif(new_data ->> 'archived_by', ''),
    auth.uid()::text
  );

  insert into public.operational_revisions (
    org_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    changed_by
  )
  values (
    (new_data ->> 'org_id')::uuid,
    revision_entity_type,
    (new_data ->> 'id')::uuid,
    revision_action,
    old_data,
    new_data,
    nullif(actor_text, '')::uuid
  );

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'strategic_plans',
    'area_plans',
    'objectives',
    'key_actions',
    'strategic_projects',
    'evidences',
    'check_ins',
    'plan_documents',
    'executive_kpis',
    'kpi_monthly_values'
  ]
  loop
    execute format('drop trigger if exists capture_operational_revision on public.%I', table_name);
    execute format(
      'create trigger capture_operational_revision after update on public.%I for each row execute function public.capture_operational_revision()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.can_write_objective(target_org uuid, target_objective uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.objectives o
    where o.id = target_objective
      and o.org_id = target_org
      and o.archived_at is null
      and public.can_write_area(o.org_id, o.area_id)
  )
$$;

create or replace function public.set_operational_item_archived(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_archived boolean,
  p_actor_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_id uuid;
  changed_at timestamptz := now();
  cleaned_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  affected_primary integer := 0;
  affected_actions integer := 0;
  affected_evidences integer := 0;
begin
  if not exists (
    select 1
    from public.memberships
    where org_id = p_org_id
      and user_id = p_actor_id
  ) then
    raise exception 'Responsável inválido para esta empresa';
  end if;

  perform set_config('app.lifecycle_actor', p_actor_id::text, true);

  if p_entity_type not in ('objective', 'key_action', 'strategic_project', 'evidence', 'check_in', 'plan_document') then
    raise exception 'Tipo operacional inválido';
  end if;

  if p_archived then
    batch_id := gen_random_uuid();

    if p_entity_type = 'objective' then
      if not exists (
        select 1 from public.objectives
        where id = p_entity_id and org_id = p_org_id and archived_at is null
      ) then
        raise exception 'Objetivo não encontrado ou já arquivado';
      end if;

      with recursive objective_tree as (
        select id
        from public.objectives
        where id = p_entity_id and org_id = p_org_id
        union all
        select child.id
        from public.objectives child
        join objective_tree parent on parent.id = child.parent_id
        where child.org_id = p_org_id
      )
      update public.objectives
      set archived_at = changed_at,
          archived_by = p_actor_id,
          archive_reason = cleaned_reason,
          archive_batch_id = batch_id
      where id in (select id from objective_tree)
        and archived_at is null;
      get diagnostics affected_primary = row_count;

      with recursive objective_tree as (
        select id
        from public.objectives
        where id = p_entity_id and org_id = p_org_id
        union all
        select child.id
        from public.objectives child
        join objective_tree parent on parent.id = child.parent_id
        where child.org_id = p_org_id
      )
      update public.key_actions
      set archived_at = changed_at,
          archived_by = p_actor_id,
          archive_reason = cleaned_reason,
          archive_batch_id = batch_id
      where org_id = p_org_id
        and objective_id in (select id from objective_tree)
        and archived_at is null;
      get diagnostics affected_actions = row_count;

      with recursive objective_tree as (
        select id
        from public.objectives
        where id = p_entity_id and org_id = p_org_id
        union all
        select child.id
        from public.objectives child
        join objective_tree parent on parent.id = child.parent_id
        where child.org_id = p_org_id
      )
      update public.evidences
      set archived_at = changed_at,
          archived_by = p_actor_id,
          archive_reason = cleaned_reason,
          archive_batch_id = batch_id
      where org_id = p_org_id
        and objective_id in (select id from objective_tree)
        and archived_at is null;
      get diagnostics affected_evidences = row_count;
    elsif p_entity_type = 'key_action' then
      update public.key_actions
      set archived_at = changed_at, archived_by = p_actor_id, archive_reason = cleaned_reason, archive_batch_id = batch_id
      where id = p_entity_id and org_id = p_org_id and archived_at is null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'strategic_project' then
      update public.strategic_projects
      set archived_at = changed_at, archived_by = p_actor_id, archive_reason = cleaned_reason, archive_batch_id = batch_id
      where id = p_entity_id and org_id = p_org_id and archived_at is null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'evidence' then
      update public.evidences
      set archived_at = changed_at, archived_by = p_actor_id, archive_reason = cleaned_reason, archive_batch_id = batch_id
      where id = p_entity_id and org_id = p_org_id and archived_at is null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'check_in' then
      update public.check_ins
      set archived_at = changed_at, archived_by = p_actor_id, archive_reason = cleaned_reason, archive_batch_id = batch_id
      where id = p_entity_id and org_id = p_org_id and archived_at is null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'plan_document' then
      update public.plan_documents
      set archived_at = changed_at, archived_by = p_actor_id, archive_reason = cleaned_reason, archive_batch_id = batch_id
      where id = p_entity_id and org_id = p_org_id and archived_at is null;
      get diagnostics affected_primary = row_count;
    end if;

    if affected_primary = 0 then
      raise exception 'Registro não encontrado ou já arquivado';
    end if;
  else
    if p_entity_type = 'objective' then
      select archive_batch_id
      into batch_id
      from public.objectives
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;

      if batch_id is null then
        raise exception 'Objetivo arquivado não encontrado';
      end if;

      if exists (
        select 1
        from public.objectives child
        join public.objectives parent on parent.id = child.parent_id
        where child.id = p_entity_id
          and child.org_id = p_org_id
          and child.archive_batch_id = batch_id
          and parent.archive_batch_id = batch_id
      ) then
        raise exception 'Restaure pelo objetivo principal deste grupo';
      end if;

      update public.objectives
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where org_id = p_org_id and archive_batch_id = batch_id;
      get diagnostics affected_primary = row_count;

      update public.key_actions
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where org_id = p_org_id and archive_batch_id = batch_id;
      get diagnostics affected_actions = row_count;

      update public.evidences
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where org_id = p_org_id and archive_batch_id = batch_id;
      get diagnostics affected_evidences = row_count;
    elsif p_entity_type = 'key_action' then
      select archive_batch_id into batch_id
      from public.key_actions
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;
      if batch_id is null then raise exception 'Ação arquivada não encontrada'; end if;
      if exists (select 1 from public.objectives where org_id = p_org_id and archive_batch_id = batch_id) then
        raise exception 'Restaure esta ação pelo objetivo arquivado';
      end if;
      update public.key_actions
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where id = p_entity_id and org_id = p_org_id and archive_batch_id = batch_id;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'evidence' then
      select archive_batch_id into batch_id
      from public.evidences
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;
      if batch_id is null then raise exception 'Evidência arquivada não encontrada'; end if;
      if exists (select 1 from public.objectives where org_id = p_org_id and archive_batch_id = batch_id) then
        raise exception 'Restaure esta evidência pelo objetivo arquivado';
      end if;
      update public.evidences
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where id = p_entity_id and org_id = p_org_id and archive_batch_id = batch_id;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'strategic_project' then
      update public.strategic_projects
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'check_in' then
      update public.check_ins
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;
      get diagnostics affected_primary = row_count;
    elsif p_entity_type = 'plan_document' then
      update public.plan_documents
      set archived_at = null, archived_by = null, archive_reason = null, archive_batch_id = null
      where id = p_entity_id and org_id = p_org_id and archived_at is not null;
      get diagnostics affected_primary = row_count;
    end if;

    if affected_primary = 0 then
      raise exception 'Registro arquivado não encontrado';
    end if;
  end if;

  return jsonb_build_object(
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'archived', p_archived,
    'affected', affected_primary + affected_actions + affected_evidences,
    'objectives', affected_primary,
    'keyActions', affected_actions,
    'evidences', affected_evidences
  );
end;
$$;

revoke all on function public.set_operational_item_archived(uuid, text, uuid, boolean, uuid, text) from public;
revoke all on function public.set_operational_item_archived(uuid, text, uuid, boolean, uuid, text) from anon;
revoke all on function public.set_operational_item_archived(uuid, text, uuid, boolean, uuid, text) from authenticated;
grant execute on function public.set_operational_item_archived(uuid, text, uuid, boolean, uuid, text) to service_role;

revoke delete on public.strategic_plans from authenticated;
revoke delete on public.area_plans from authenticated;
revoke delete on public.objectives from authenticated;
revoke delete on public.key_actions from authenticated;
revoke delete on public.strategic_projects from authenticated;
revoke delete on public.evidences from authenticated;
revoke delete on public.check_ins from authenticated;
revoke delete on public.plan_documents from authenticated;
revoke delete on public.executive_kpis from authenticated;
revoke delete on public.kpi_monthly_values from authenticated;

alter table public.operational_revisions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_revisions'
  ) then
    alter publication supabase_realtime add table public.operational_revisions;
  end if;
end
$$;
