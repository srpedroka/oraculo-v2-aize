create or replace function public.critical_action_aal_ok(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or not coalesce((
      select settings.require_mfa_for_critical_actions
      from public.organization_security_settings settings
      where settings.org_id = p_org_id
    ), false)
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.critical_action_aal_ok(uuid) from public, anon;
grant execute on function public.critical_action_aal_ok(uuid) to authenticated, service_role;

drop policy if exists memberships_insert_initial_owner on public.memberships;
create policy memberships_insert_initial_owner
on public.memberships for insert
to authenticated
with check (
  role = 'owner'
  and user_id = auth.uid()
  and public.critical_action_aal_ok(org_id)
  and exists (
    select 1 from public.organizations
    where organizations.id = memberships.org_id
      and organizations.created_by = auth.uid()
  )
);

drop policy if exists memberships_insert_owner on public.memberships;
create policy memberships_insert_owner
on public.memberships for insert
to authenticated
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

drop policy if exists memberships_update_owner on public.memberships;
create policy memberships_update_owner
on public.memberships for update
to authenticated
using (public.is_owner(org_id) and public.critical_action_aal_ok(org_id))
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

drop policy if exists ai_settings_write_owner on public.ai_settings;
create policy ai_settings_write_owner
on public.ai_settings for all
to authenticated
using (public.is_owner(org_id) and public.critical_action_aal_ok(org_id))
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

drop policy if exists ai_function_settings_write_owner on public.ai_function_settings;
create policy ai_function_settings_write_owner
on public.ai_function_settings for all
to authenticated
using (public.is_owner(org_id) and public.critical_action_aal_ok(org_id))
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

drop policy if exists ai_provider_key_status_write_owner on public.ai_provider_key_status;
create policy ai_provider_key_status_write_owner
on public.ai_provider_key_status for all
to authenticated
using (public.is_owner(org_id) and public.critical_action_aal_ok(org_id))
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

drop policy if exists whatsapp_settings_write_owner on public.whatsapp_settings;
create policy whatsapp_settings_write_owner
on public.whatsapp_settings for all
to authenticated
using (public.is_owner(org_id) and public.critical_action_aal_ok(org_id))
with check (public.is_owner(org_id) and public.critical_action_aal_ok(org_id));

