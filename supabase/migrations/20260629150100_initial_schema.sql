create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subtitle text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'coordinator')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  coordinator_id uuid references public.memberships(id),
  created_at timestamptz not null default now()
);

create table public.strategic_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  profile jsonb not null default '{}',
  drivers jsonb not null default '{}',
  swot jsonb not null default '{}',
  themes text[] not null default '{}',
  rituals text[] not null default '{}',
  executive_summary text,
  created_at timestamptz not null default now(),
  unique (org_id, year)
);

create table public.area_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  year int not null,
  role jsonb not null default '{}',
  linked_strategic_objective_ids uuid[] not null default '{}',
  diagnosis jsonb not null default '{}',
  main_annual_objective_id uuid,
  learning_focus jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (area_id, year)
);

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete cascade,
  level text not null check (level in ('strategic', 'area_annual', 'quarterly', 'monthly')),
  type text not null check (type in ('harvest', 'seed')),
  title text not null,
  result text not null default '',
  metric text,
  target text,
  current text,
  trend text check (trend in ('up', 'down', 'flat')),
  deadline date,
  owner text not null default '',
  evidence_plan text not null default '',
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'late', 'done')),
  progress int not null default 0 check (progress between 0 and 100),
  deliverables text[] not null default '{}',
  parent_id uuid references public.objectives(id) on delete set null,
  period text not null,
  created_at timestamptz not null default now()
);

create table public.key_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  description text not null,
  completion_criterion text not null default '',
  deadline date,
  owner text not null default '',
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'late', 'done')),
  created_at timestamptz not null default now()
);

create table public.strategic_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.strategic_plans(id) on delete cascade,
  name text not null,
  owner text,
  deadline date,
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'late', 'done')),
  linked_objective_id uuid references public.objectives(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  text text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete cascade,
  author text not null check (author in ('oracle', 'user')),
  text text not null,
  created_at timestamptz not null default now()
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete cascade,
  period text not null,
  summary text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.ai_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'openai' check (provider in ('openai', 'anthropic')),
  model text not null default 'gpt-5.4',
  has_key boolean not null default false,
  key_preview text,
  updated_at timestamptz not null default now()
);

alter table public.area_plans
  add constraint area_plans_main_annual_objective_fk
  foreign key (main_annual_objective_id)
  references public.objectives(id)
  on delete set null;

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_org_id_idx on public.memberships(org_id);
create index areas_org_id_idx on public.areas(org_id);
create index areas_coordinator_id_idx on public.areas(coordinator_id);
create index strategic_plans_org_id_idx on public.strategic_plans(org_id);
create index area_plans_org_id_idx on public.area_plans(org_id);
create index area_plans_area_id_idx on public.area_plans(area_id);
create index objectives_org_id_idx on public.objectives(org_id);
create index objectives_area_id_idx on public.objectives(area_id);
create index objectives_parent_id_idx on public.objectives(parent_id);
create index objectives_level_period_idx on public.objectives(level, period);
create index key_actions_org_id_idx on public.key_actions(org_id);
create index key_actions_objective_id_idx on public.key_actions(objective_id);
create index strategic_projects_org_id_idx on public.strategic_projects(org_id);
create index evidences_org_id_idx on public.evidences(org_id);
create index evidences_objective_id_idx on public.evidences(objective_id);
create index chat_messages_org_id_idx on public.chat_messages(org_id);
create index check_ins_org_id_idx on public.check_ins(org_id);
