-- Reversible area lifecycle and transactional member removal.

alter table public.areas
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists areas_org_active_idx
on public.areas (org_id, archived_at, created_at);

drop policy if exists memberships_delete_owner on public.memberships;
revoke delete on public.memberships from authenticated;

alter table public.areas
  drop constraint if exists areas_coordinator_id_fkey;

alter table public.areas
  add constraint areas_coordinator_id_fkey
  foreign key (coordinator_id)
  references public.memberships(id)
  on delete set null;

create or replace function public.user_area_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.areas a
  join public.memberships m on m.id = a.coordinator_id
  where m.user_id = auth.uid()
    and a.archived_at is null
$$;

create or replace function public.can_write_area(target_org uuid, target_area uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.areas a
    where a.id = target_area
      and a.org_id = target_org
      and a.archived_at is null
      and (
        public.is_owner(target_org)
        or exists (
          select 1
          from public.memberships m
          where m.id = a.coordinator_id
            and m.user_id = auth.uid()
            and m.org_id = target_org
            and m.role = 'coordinator'
        )
      )
  )
$$;

create or replace function public.remove_organization_member(
  p_org_id uuid,
  p_membership_id uuid,
  p_area_reassignments jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_membership public.memberships%rowtype;
  impacted_area record;
  replacement_text text;
  replacement_id uuid;
  owner_count integer;
  impacted_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_area_reassignments, '{}'::jsonb)) <> 'object' then
    raise exception 'Reatribuições de área inválidas';
  end if;

  perform 1
  from public.memberships
  where org_id = p_org_id
  for update;

  select *
  into target_membership
  from public.memberships
  where id = p_membership_id
    and org_id = p_org_id;

  if not found then
    raise exception 'Membro não encontrado';
  end if;

  if target_membership.role = 'owner' then
    select count(*)
    into owner_count
    from public.memberships
    where org_id = p_org_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Não é possível remover o último dono da empresa';
    end if;
  end if;

  for impacted_area in
    select id
    from public.areas
    where org_id = p_org_id
      and coordinator_id = p_membership_id
    order by id
    for update
  loop
    impacted_count := impacted_count + 1;
    replacement_text := nullif(
      coalesce(p_area_reassignments, '{}'::jsonb) ->> impacted_area.id::text,
      ''
    );
    replacement_id := null;

    if replacement_text is not null then
      begin
        replacement_id := replacement_text::uuid;
      exception when invalid_text_representation then
        raise exception 'Coordenador substituto inválido';
      end;

      if replacement_id = p_membership_id then
        raise exception 'A pessoa removida não pode continuar como coordenadora';
      end if;

      perform 1
      from public.memberships
      where id = replacement_id
        and org_id = p_org_id
        and role = 'coordinator';

      if not found then
        raise exception 'O coordenador substituto precisa estar ativo nesta empresa';
      end if;
    end if;

    update public.areas
    set coordinator_id = replacement_id
    where id = impacted_area.id
      and org_id = p_org_id;
  end loop;

  delete from public.memberships
  where id = p_membership_id
    and org_id = p_org_id;

  return jsonb_build_object(
    'removedMembershipId', p_membership_id,
    'reassignedAreaCount', impacted_count
  );
end;
$$;

revoke all on function public.remove_organization_member(uuid, uuid, jsonb) from public;
revoke all on function public.remove_organization_member(uuid, uuid, jsonb) from anon;
revoke all on function public.remove_organization_member(uuid, uuid, jsonb) from authenticated;
grant execute on function public.remove_organization_member(uuid, uuid, jsonb) to service_role;

alter table public.areas replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'areas'
  ) then
    alter publication supabase_realtime add table public.areas;
  end if;
end $$;
