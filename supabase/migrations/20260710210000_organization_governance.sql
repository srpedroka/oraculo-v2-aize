-- Governance and permanent deletion for organizations (Fatia 3).
-- Separates leaving from closing, makes closing reversible (archive), and routes
-- permanent deletion through a privileged Edge Function with an audit trail that
-- survives the deletion itself.

alter table public.organizations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists deletion_confirmed_at timestamptz;

-- Close the hole: authenticated could hard-delete the whole company directly.
drop policy if exists organizations_delete_owner on public.organizations;
revoke delete on public.organizations from authenticated;

-- Audit that OUTLIVES the organization: no cascade FK, snapshot of name/email.
create table if not exists public.organization_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  org_name text not null,
  action text not null check (action in ('leave', 'archive', 'restore', 'permanent_delete')),
  actor_user_id uuid,
  actor_email text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_lifecycle_audit_org_idx
on public.organization_lifecycle_audit (org_id, created_at desc);

alter table public.organization_lifecycle_audit enable row level security;

grant select on public.organization_lifecycle_audit to authenticated;
grant select, insert on public.organization_lifecycle_audit to service_role;

drop policy if exists organization_lifecycle_audit_read_owner on public.organization_lifecycle_audit;
create policy organization_lifecycle_audit_read_owner
on public.organization_lifecycle_audit for select
to authenticated
using (public.is_owner(org_id));

-- Archive / restore the whole company (reversible). Writes audit atomically and
-- pauses WhatsApp on archive without deleting any secret.
create or replace function public.set_organization_archived(
  p_org_id uuid,
  p_archived boolean,
  p_actor_id uuid,
  p_actor_email text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_row public.organizations%rowtype;
begin
  select *
  into org_row
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'Empresa não encontrada';
  end if;

  if p_archived then
    if org_row.archived_at is not null then
      raise exception 'A empresa já está arquivada';
    end if;
    update public.organizations
    set archived_at = now(),
        archived_by = p_actor_id,
        archive_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_org_id;
    update public.whatsapp_settings set enabled = false where org_id = p_org_id;
    insert into public.organization_lifecycle_audit (org_id, org_name, action, actor_user_id, actor_email, reason)
    values (p_org_id, org_row.name, 'archive', p_actor_id, p_actor_email, nullif(btrim(coalesce(p_reason, '')), ''));
  else
    if org_row.archived_at is null then
      raise exception 'A empresa não está arquivada';
    end if;
    update public.organizations
    set archived_at = null,
        archived_by = null,
        archive_reason = null
    where id = p_org_id;
    insert into public.organization_lifecycle_audit (org_id, org_name, action, actor_user_id, actor_email, reason)
    values (p_org_id, org_row.name, 'restore', p_actor_id, p_actor_email, nullif(btrim(coalesce(p_reason, '')), ''));
  end if;

  return jsonb_build_object('orgId', p_org_id, 'archived', p_archived);
end;
$$;

revoke all on function public.set_organization_archived(uuid, boolean, uuid, text, text) from public;
revoke all on function public.set_organization_archived(uuid, boolean, uuid, text, text) from anon;
revoke all on function public.set_organization_archived(uuid, boolean, uuid, text, text) from authenticated;
grant execute on function public.set_organization_archived(uuid, boolean, uuid, text, text) to service_role;

-- Permanent deletion. Re-validates the guards inside the transaction (defense in
-- depth), writes the surviving audit row BEFORE removing anything, revokes AI and
-- WhatsApp secrets explicitly, then drops the org (cascade removes the rest).
create or replace function public.delete_organization_permanently(
  p_org_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_confirm_name text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_row public.organizations%rowtype;
begin
  select *
  into org_row
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'Empresa não encontrada';
  end if;

  if org_row.archived_at is null then
    raise exception 'Arquive a empresa antes de excluir definitivamente';
  end if;

  if btrim(coalesce(p_confirm_name, '')) <> org_row.name then
    raise exception 'O nome digitado não confere com o da empresa';
  end if;

  insert into public.organization_lifecycle_audit (org_id, org_name, action, actor_user_id, actor_email, reason)
  values (p_org_id, org_row.name, 'permanent_delete', p_actor_id, p_actor_email, nullif(btrim(coalesce(p_reason, '')), ''));

  -- Explicit secret revocation (belt-and-suspenders: these also cascade).
  delete from public.ai_model_keys where org_id = p_org_id;
  delete from public.ai_provider_key_status where org_id = p_org_id;
  delete from public.whatsapp_instance_keys where org_id = p_org_id;

  delete from public.organizations where id = p_org_id;

  return jsonb_build_object('deletedOrgId', p_org_id, 'orgName', org_row.name);
end;
$$;

revoke all on function public.delete_organization_permanently(uuid, uuid, text, text, text) from public;
revoke all on function public.delete_organization_permanently(uuid, uuid, text, text, text) from anon;
revoke all on function public.delete_organization_permanently(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.delete_organization_permanently(uuid, uuid, text, text, text) to service_role;
