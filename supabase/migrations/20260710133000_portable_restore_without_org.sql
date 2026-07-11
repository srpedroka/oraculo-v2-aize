-- Allow a user with no remaining organization to restore a portable package
-- directly from onboarding. The restore run remains auditable without requiring
-- the deleted source organization to exist.

alter table public.organization_restore_runs
  drop constraint if exists organization_restore_runs_source_org_id_fkey;

alter table public.organization_restore_runs
  alter column source_org_id drop not null;

alter table public.organization_restore_runs
  add constraint organization_restore_runs_source_org_id_fkey
  foreign key (source_org_id)
  references public.organizations(id)
  on delete set null;

drop policy if exists organization_restore_runs_owner_read on public.organization_restore_runs;
create policy organization_restore_runs_owner_read
on public.organization_restore_runs for select
to authenticated
using (source_org_id is not null and public.is_owner(source_org_id));
