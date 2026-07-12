create table public.organization_security_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  require_mfa_for_critical_actions boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint organization_security_settings_enabled_metadata check (
    require_mfa_for_critical_actions
    or (enabled_at is null and enabled_by is null)
  )
);

alter table public.organization_security_settings enable row level security;

revoke all on table public.organization_security_settings from anon, authenticated;
grant select on table public.organization_security_settings to authenticated;

create policy organization_security_settings_select_member
on public.organization_security_settings
for select
to authenticated
using (public.is_org_member(org_id));

comment on table public.organization_security_settings is
  'Optional organization security policy. Writes are restricted to service_role via save-security-settings.';

