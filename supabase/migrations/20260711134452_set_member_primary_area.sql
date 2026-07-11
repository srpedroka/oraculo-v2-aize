-- Troca atomica da area principal de um membro (coordinator).
-- service_role only; chamada via Edge Function set-member-area.

create or replace function public.set_member_primary_area(
  p_org_id uuid,
  p_membership_id uuid,
  p_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_membership public.memberships%rowtype;
  target_area public.areas%rowtype;
  cleared_ids uuid[] := array[]::uuid[];
  assigned_id uuid := null;
  cleared_row record;
begin
  if p_org_id is null or p_membership_id is null then
    raise exception 'Empresa e membro são obrigatórios';
  end if;

  -- Bloqueia memberships da empresa e areas ativas para serializar a troca.
  perform 1
  from public.memberships
  where org_id = p_org_id
  for update;

  perform 1
  from public.areas
  where org_id = p_org_id
    and archived_at is null
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
    raise exception 'O dono da empresa não precisa de área de coordenação';
  end if;

  if p_area_id is not null then
    select *
    into target_area
    from public.areas
    where id = p_area_id
      and org_id = p_org_id
      and archived_at is null;

    if not found then
      raise exception 'Área arquivada ou não encontrada';
    end if;
  end if;

  -- Limpa todos os vinculos ativos atuais desta membership.
  for cleared_row in
    update public.areas
    set coordinator_id = null
    where org_id = p_org_id
      and coordinator_id = p_membership_id
      and archived_at is null
      and (p_area_id is null or id is distinct from p_area_id)
    returning id
  loop
    cleared_ids := array_append(cleared_ids, cleared_row.id);
  end loop;

  if p_area_id is not null then
    update public.areas
    set coordinator_id = p_membership_id
    where id = p_area_id
      and org_id = p_org_id
      and archived_at is null
    returning id into assigned_id;

    if assigned_id is null then
      raise exception 'Não foi possível vincular a área';
    end if;
  end if;

  return jsonb_build_object(
    'membershipId', p_membership_id,
    'areaId', assigned_id,
    'clearedAreaIds', to_jsonb(cleared_ids),
    'changedAreaIds', to_jsonb(
      case
        when assigned_id is null then cleared_ids
        when assigned_id = any (cleared_ids) then cleared_ids
        else array_append(cleared_ids, assigned_id)
      end
    )
  );
end;
$$;

revoke all on function public.set_member_primary_area(uuid, uuid, uuid) from public;
revoke all on function public.set_member_primary_area(uuid, uuid, uuid) from anon;
revoke all on function public.set_member_primary_area(uuid, uuid, uuid) from authenticated;
grant execute on function public.set_member_primary_area(uuid, uuid, uuid) to service_role;
