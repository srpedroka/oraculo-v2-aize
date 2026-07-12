-- Keep event backups for normal row changes, but do not enqueue a request while
-- the organization itself is already being removed by an ON DELETE CASCADE.
create or replace function public.queue_organization_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  if tg_op = 'DELETE' then
    target_org_id := old.org_id;
  else
    target_org_id := new.org_id;
  end if;

  if target_org_id is null then
    return null;
  end if;

  insert into public.organization_backup_requests (org_id, reason, requested_at)
  select target_org_id, tg_table_name, now()
  where exists (
    select 1
    from public.organizations organization
    where organization.id = target_org_id
  )
  on conflict (org_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at;

  return null;
end
$$;

