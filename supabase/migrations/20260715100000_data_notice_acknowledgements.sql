create table public.data_notice_versions (
  version text primary key,
  published_at timestamptz not null,
  material_change boolean not null default true,
  summary text not null,
  created_at timestamptz not null default now(),
  constraint data_notice_versions_version_length check (char_length(version) between 1 and 40),
  constraint data_notice_versions_summary_length check (char_length(summary) between 1 and 500)
);

insert into public.data_notice_versions (version, published_at, material_change, summary)
values (
  '2026-07-15',
  '2026-07-15T00:00:00-03:00',
  true,
  'Primeiro aviso operacional sobre dados, IA, WhatsApp, arquivos, retenção, backups e direitos.'
);

create table public.organization_data_notice_acknowledgements (
  org_id uuid not null references public.organizations(id) on delete cascade,
  notice_version text not null references public.data_notice_versions(version) on delete restrict,
  accepted_by uuid default auth.uid() references auth.users(id) on delete set null,
  accepted_at timestamptz not null default now(),
  primary key (org_id, notice_version)
);

create index organization_data_notice_ack_actor_idx
  on public.organization_data_notice_acknowledgements (accepted_by, accepted_at desc);

alter table public.data_notice_versions enable row level security;
alter table public.organization_data_notice_acknowledgements enable row level security;

revoke all on table public.data_notice_versions from anon, authenticated;
revoke all on table public.organization_data_notice_acknowledgements from anon, authenticated;

grant select on table public.data_notice_versions to anon, authenticated;
grant select on table public.organization_data_notice_acknowledgements to authenticated;
grant insert (org_id, notice_version) on table public.organization_data_notice_acknowledgements to authenticated;

create policy data_notice_versions_select_public
on public.data_notice_versions
for select
to anon, authenticated
using (true);

create policy organization_data_notice_ack_select_member
on public.organization_data_notice_acknowledgements
for select
to authenticated
using (public.is_org_member(org_id));

create policy organization_data_notice_ack_insert_owner
on public.organization_data_notice_acknowledgements
for insert
to authenticated
with check (
  public.is_owner(org_id)
  and accepted_by = auth.uid()
);

comment on table public.data_notice_versions is
  'Published operational data notices. Content lives in the versioned frontend; this registry anchors acknowledgements to a known version.';

comment on table public.organization_data_notice_acknowledgements is
  'Immutable organization-level acknowledgement of a specific data notice version by an owner. This is operational acknowledgement, not blanket legal consent.';
