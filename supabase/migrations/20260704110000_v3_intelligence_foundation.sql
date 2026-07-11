-- V3 intelligence foundation.
-- This migration prepares conversation memory, planning sessions, per-function AI
-- routing, and canonical plan documents without changing runtime behavior.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  channel text not null check (channel in ('web', 'whatsapp')),
  status text not null default 'active' check (status in ('active', 'archived')),
  summary text,
  summary_upto timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_lookup
on public.conversations (org_id, user_id, channel, status);

alter table public.chat_messages
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_chat_messages_conversation
on public.chat_messages (conversation_id, created_at);

create table if not exists public.planning_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  type text not null check (type in ('strategic', 'quarterly', 'monthly', 'month_close', 'quarter_close')),
  period text not null,
  phase text not null,
  state jsonb not null default '{}',
  pending_proposal jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_planning_sessions_active
on public.planning_sessions (org_id, user_id, status);

create table if not exists public.ai_function_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  "function" text not null check ("function" in ('planning', 'daily', 'background')),
  provider text not null check (provider in ('openai', 'anthropic', 'moonshot', 'xai')),
  model text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, "function")
);

insert into public.ai_function_settings (org_id, "function", provider, model)
select ai.org_id, fn.function_name, ai.provider, ai.model
from public.ai_settings ai
cross join (values ('planning'), ('daily'), ('background')) as fn(function_name)
on conflict (org_id, "function") do nothing;

alter table public.ai_model_keys
  add column if not exists provider text not null default 'openai';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_model_keys'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.ai_model_keys drop constraint %I', constraint_name);
  end loop;

  alter table public.ai_model_keys
    add constraint ai_model_keys_provider_check
    check (provider in ('openai', 'anthropic', 'moonshot', 'xai'));
end $$;

alter table public.ai_model_keys drop constraint if exists ai_model_keys_pkey;
alter table public.ai_model_keys add primary key (org_id, provider);

do $$
declare
  constraint_name text;
begin
  if to_regclass('private.ai_model_keys') is not null then
    alter table private.ai_model_keys
      add column if not exists provider text not null default 'openai';

    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'private.ai_model_keys'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%provider%'
    loop
      execute format('alter table private.ai_model_keys drop constraint %I', constraint_name);
    end loop;

    alter table private.ai_model_keys
      add constraint ai_model_keys_provider_check
      check (provider in ('openai', 'anthropic', 'moonshot', 'xai'));

    alter table private.ai_model_keys drop constraint if exists ai_model_keys_pkey;
    alter table private.ai_model_keys add primary key (org_id, provider);
  end if;
end $$;

create table if not exists public.plan_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete cascade,
  session_id uuid references public.planning_sessions(id) on delete set null,
  type text not null check (type in ('strategic', 'quarterly', 'monthly', 'month_close', 'quarter_close')),
  period text not null,
  title text not null,
  content jsonb not null,
  version int not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_documents_lookup
on public.plan_documents (org_id, area_id, type, period);

alter table public.conversations enable row level security;
alter table public.planning_sessions enable row level security;
alter table public.ai_function_settings enable row level security;
alter table public.plan_documents enable row level security;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.planning_sessions to authenticated;
grant select, insert, update, delete on public.ai_function_settings to authenticated;
grant select, insert, update, delete on public.plan_documents to authenticated;

grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.planning_sessions to service_role;
grant select, insert, update, delete on public.ai_function_settings to service_role;
grant select, insert, update, delete on public.plan_documents to service_role;

drop policy if exists conversations_read_owner_or_self on public.conversations;
create policy conversations_read_owner_or_self
on public.conversations for select
to authenticated
using (
  public.is_owner(org_id)
  or (user_id = auth.uid() and public.is_org_member(org_id))
);

drop policy if exists conversations_insert_self on public.conversations;
create policy conversations_insert_self
on public.conversations for insert
to authenticated
with check (user_id = auth.uid() and public.is_org_member(org_id));

drop policy if exists conversations_update_self on public.conversations;
create policy conversations_update_self
on public.conversations for update
to authenticated
using (user_id = auth.uid() and public.is_org_member(org_id))
with check (user_id = auth.uid() and public.is_org_member(org_id));

drop policy if exists planning_sessions_read_owner_or_self on public.planning_sessions;
create policy planning_sessions_read_owner_or_self
on public.planning_sessions for select
to authenticated
using (
  public.is_owner(org_id)
  or (user_id = auth.uid() and public.is_org_member(org_id))
);

drop policy if exists planning_sessions_insert_self on public.planning_sessions;
create policy planning_sessions_insert_self
on public.planning_sessions for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_org_member(org_id)
  and (area_id is null or public.can_write_area(org_id, area_id))
);

drop policy if exists planning_sessions_update_self on public.planning_sessions;
create policy planning_sessions_update_self
on public.planning_sessions for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_org_member(org_id)
  and (area_id is null or public.can_write_area(org_id, area_id))
)
with check (
  user_id = auth.uid()
  and public.is_org_member(org_id)
  and (area_id is null or public.can_write_area(org_id, area_id))
);

drop policy if exists ai_function_settings_read_org_member on public.ai_function_settings;
create policy ai_function_settings_read_org_member
on public.ai_function_settings for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists ai_function_settings_write_owner on public.ai_function_settings;
create policy ai_function_settings_write_owner
on public.ai_function_settings for all
to authenticated
using (public.is_owner(org_id))
with check (public.is_owner(org_id));

drop policy if exists plan_documents_read_org_member on public.plan_documents;
create policy plan_documents_read_org_member
on public.plan_documents for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists plan_documents_insert_owner_or_coordinator on public.plan_documents;
create policy plan_documents_insert_owner_or_coordinator
on public.plan_documents for insert
to authenticated
with check (
  public.is_owner(org_id)
  or (area_id is not null and public.can_write_area(org_id, area_id))
);

drop policy if exists plan_documents_update_owner_or_coordinator on public.plan_documents;
create policy plan_documents_update_owner_or_coordinator
on public.plan_documents for update
to authenticated
using (
  public.is_owner(org_id)
  or (area_id is not null and public.can_write_area(org_id, area_id))
)
with check (
  public.is_owner(org_id)
  or (area_id is not null and public.can_write_area(org_id, area_id))
);

alter table public.planning_sessions replica identity full;
alter table public.plan_documents replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planning_sessions'
  ) then
    alter publication supabase_realtime add table public.planning_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plan_documents'
  ) then
    alter publication supabase_realtime add table public.plan_documents;
  end if;
end $$;
