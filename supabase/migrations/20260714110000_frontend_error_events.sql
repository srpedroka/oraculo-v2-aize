create table public.frontend_error_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  occurrence_id text not null,
  error_code text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (org_id, occurrence_id),
  constraint frontend_error_occurrence_check check (occurrence_id ~ '^ORC-[A-F0-9]{10}$'),
  constraint frontend_error_code_check check (char_length(error_code) between 1 and 80),
  constraint frontend_error_path_check check (char_length(path) between 1 and 160)
);

create index frontend_error_events_org_created_idx on public.frontend_error_events (org_id, created_at desc);

alter table public.frontend_error_events enable row level security;
revoke all on public.frontend_error_events from anon, authenticated;
grant select, insert, delete on public.frontend_error_events to service_role;

comment on table public.frontend_error_events is 'Ocorrências sanitizadas do Error Boundary; sem mensagem, stack, query string ou conteúdo de usuário.';

