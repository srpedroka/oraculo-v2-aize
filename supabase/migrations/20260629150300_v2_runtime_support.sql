create schema if not exists private;

create table if not exists private.ai_model_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic')),
  api_key text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

create policy organizations_read_creator_pending
on public.organizations for select
to authenticated
using (created_by = auth.uid());

alter table public.objectives replica identity full;
alter table public.key_actions replica identity full;
alter table public.evidences replica identity full;
alter table public.check_ins replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'objectives'
  ) then
    alter publication supabase_realtime add table public.objectives;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'key_actions'
  ) then
    alter publication supabase_realtime add table public.key_actions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'evidences'
  ) then
    alter publication supabase_realtime add table public.evidences;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'check_ins'
  ) then
    alter publication supabase_realtime add table public.check_ins;
  end if;
end $$;
