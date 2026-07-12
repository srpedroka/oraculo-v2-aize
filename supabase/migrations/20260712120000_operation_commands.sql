-- Etapa 1 / Fatia 1A — Integridade transacional e idempotencia.
-- Tabela de comandos idempotentes: registra cada operacao critica (por org + tipo +
-- chave de idempotencia) para que repetir a mesma confirmacao nao duplique dados.
-- Acesso apenas via service_role / conexao direta (postgres). anon/authenticated sem acesso.
-- Migration ADITIVA: nao altera nem remove nada existente.

create table if not exists public.operation_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor_user_id uuid,
  status text not null check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id, operation, idempotency_key)
);

comment on table public.operation_commands is
  'Etapa 1: registro de operacoes criticas para atomicidade + idempotencia. Uma linha por (org, operacao, chave). Escrita apenas dentro da transacao de dominio (conexao service_role).';

alter table public.operation_commands enable row level security;

-- Sem policies para anon/authenticated: nenhum acesso pelo PostgREST.
-- A conexao direta (SUPABASE_DB_URL, role postgres) e service_role ignoram RLS por design.
revoke all on public.operation_commands from anon, authenticated;

create index if not exists operation_commands_org_created_idx
  on public.operation_commands (org_id, created_at desc);
