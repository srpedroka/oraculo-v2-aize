-- Per-organization tone preferences for the Oracle.
-- This is public configuration: members can read it and only owners can write it.

create table if not exists public.org_ai_tone (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  preset text not null default 'equilibrado'
    check (preset in ('equilibrado', 'acido', 'gentil', 'direto', 'motivador', 'custom')),
  axis_acidity smallint not null default 0
    check (axis_acidity between -2 and 2),
  axis_drive smallint not null default 0
    check (axis_drive between -2 and 2),
  custom_note text
    check (custom_note is null or char_length(custom_note) <= 280),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.org_ai_tone enable row level security;

grant select, insert, update, delete on public.org_ai_tone to authenticated;
grant select, insert, update, delete on public.org_ai_tone to service_role;

drop policy if exists org_ai_tone_read_org_member on public.org_ai_tone;
create policy org_ai_tone_read_org_member
on public.org_ai_tone for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists org_ai_tone_write_owner on public.org_ai_tone;
create policy org_ai_tone_write_owner
on public.org_ai_tone for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

alter table public.org_ai_tone replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'org_ai_tone'
  ) then
    alter publication supabase_realtime add table public.org_ai_tone;
  end if;
end $$;
