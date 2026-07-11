# Plano: Fatia 3 — Governança e exclusão definitiva de empresa

> **STATUS: ✅ Executada e publicada em produção por Claude Code em 2026-07-10** (Codex sem créditos). Migration `20260710210000_organization_governance.sql` aplicada + registrada; Edge Functions `organization-lifecycle` (nova) e `month-turn` (arquivadas) deployadas; frontend publicado. Trava confirmada (`authenticated` não deleta mais `organizations`) e teste isolado de exclusão passou (auditoria sobrevive). As 3 sub-fatias foram entregues juntas. Fica de fora, como escolha consciente: carência/grace period automático antes do delete.

Terceira e última fatia do plano de coerência **adicionar/retirar**. As Fatias 1 e 2 tornaram áreas, membros e itens operacionais **reversíveis** (arquivar/restaurar, sem hard-delete). Esta fecha a governança: separar *sair* de *encerrar*, tornar o encerramento reversível antes de definitivo, e blindar a exclusão permanente atrás de Edge Function + backup + confirmação + auditoria.

## Decisões do dono (2026-07-10)

1. **Separar "Sair da empresa" de "Encerrar empresa".**
2. **Encerrar = arquivar primeiro** (recuperável). **Exclusão definitiva exige backup recente + confirmação digitando o nome da empresa.**
3. **Exclusão definitiva revoga as chaves de IA.**
4. **Exclusão definitiva desconecta o WhatsApp apagando as credenciais.**
5. **Registro de auditoria:** quem retirou/encerrou/excluiu, quando e por quê.
6. **Bloquear hard delete pelo navegador; toda operação definitiva passa por Edge Function.**

## Diagnóstico do estado atual (verificado no banco, 2026-07-10)

- **BURACO CRÍTICO:** `authenticated` **ainda pode DELETE em `public.organizations`** (policy `organizations_delete_owner` + grant). É o que esta fatia precisa remover — hoje um owner apaga a empresa inteira direto do cliente.
- `authenticated` já **não** pode DELETE em `memberships` (fechado na Fatia 1).
- `organizations` **não tem** `archived_at` ainda.
- Segredos a limpar na exclusão: `ai_model_keys` + `ai_provider_key_status` (IA); `whatsapp_instance_keys` + `whatsapp_settings` (WhatsApp).
- Já existe: `operational_revisions` (auditoria por item, Fatia 2), `organization_backups` (Fatia de backup), RPC `remove_organization_member` (Fatia 1), Edge Functions `remove-member` e `operational-lifecycle`.

## Modelo de dados

### Colunas de ciclo de vida em `organizations`
```sql
alter table public.organizations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text,
  add column if not exists deletion_confirmed_at timestamptz;
```

### Tabela de auditoria que SOBREVIVE à exclusão
**Ponto crítico:** a auditoria não pode ter FK com `on delete cascade` para `organizations`, senão o registro de "quem apagou" some junto com a empresa. Guardar `org_id` como coluna solta + snapshot do nome.
```sql
create table public.organization_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,              -- SEM FK cascade: precisa sobreviver ao delete
  org_name text not null,            -- snapshot do nome no momento
  action text not null check (action in ('leave','archive','restore','permanent_delete')),
  actor_user_id uuid,                -- SEM FK cascade
  actor_email text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.organization_lifecycle_audit enable row level security;
-- leitura: owner da org (enquanto existir); escrita: só service role (Edge Function)
grant select on public.organization_lifecycle_audit to authenticated;
grant select, insert on public.organization_lifecycle_audit to service_role;
```

## Segurança de banco (o coração da fatia)

```sql
-- Fecha o hard delete direto pelo navegador:
drop policy if exists organizations_delete_owner on public.organizations;
revoke delete on public.organizations from authenticated;
-- (service_role mantém delete; a exclusão passa só pela Edge Function)
```
Arquivar/restaurar a empresa também **não** deve ser um `update` livre do cliente na coluna `archived_at` — rotear pela Edge Function para garantir auditoria. Manter `organizations_update_owner` para os campos normais (nome/subtítulo), mas a Edge Function é a dona do ciclo de vida.

## Edge Function nova: `organization-lifecycle`

JWT normal + `getUser`. Ações (todas gravam auditoria):

- **`leave`** — remove a **própria** membership do usuário (self, intencional; distinto do `remove-member` que bloqueia autoexclusão). Guarda: se for o **último owner**, bloqueia ("transfira a titularidade ou encerre a empresa antes de sair"). Reusa a lógica transacional de reatribuição de coordenações da RPC `remove_organization_member`.
- **`archive`** — `assertOwner`; seta `archived_at/by/reason`. Empresa arquivada sai da operação ativa (Dashboard, seletores, virada mensal, WhatsApp, contexto da IA) — mesmo padrão de área arquivada. **Não** apaga segredos (é reversível). Pausar `whatsapp_settings.enabled = false` (sem apagar credenciais).
- **`restore`** — `assertOwner`; limpa `archived_at/by/reason`; reativa.
- **`permanent_delete`** — `assertOwner` + **três travas**:
  1. empresa precisa estar **arquivada** (`archived_at` não nulo);
  2. precisa existir um **backup `completed` recente** em `organization_backups` (senão, recusa e orienta "crie e baixe um backup antes");
  3. `body.confirmName` deve **bater exatamente** com `organizations.name`.
  Ao passar: (a) escreve auditoria `permanent_delete` (com org_name/actor/reason) **antes** de apagar; (b) apaga `ai_model_keys` + `ai_provider_key_status` da org (revoga IA); (c) apaga `whatsapp_instance_keys` + `whatsapp_settings` da org (desconecta WhatsApp); (d) apaga os objetos do bucket `organization-backups` daquela org (o cascade só limpa as linhas do banco, não os arquivos); (e) `delete` da `organizations` (cascade leva o resto). Tudo via service role.

## Fatias (sub-etapas, pequenas e testáveis)

- **3.1 — Fechar o buraco + fundação.** Migration: colunas em `organizations`, tabela `organization_lifecycle_audit`, **drop da policy de delete + revoke DELETE de authenticated**. Edge Function `organization-lifecycle` com as ações `leave`/`archive`/`restore` (ainda sem `permanent_delete`). Store + UI: "Sair da empresa" e "Encerrar (arquivar) empresa" numa **Zona de perigo** em Configurações. Critério: authenticated não consegue mais deletar org direto; arquivar/restaurar/sair funcionam e geram auditoria.
- **3.2 — Exclusão definitiva.** Ação `permanent_delete` com as 3 travas + revogação de IA + desconexão de WhatsApp + limpeza do bucket + auditoria persistente. UI: só aparece com a empresa arquivada; exige selo de "backup recente" (ou botão "criar backup agora") e digitar o nome para confirmar. Critério: excluir uma empresa de teste apaga tudo, some das chaves/WhatsApp, e a auditoria **sobrevive** (linha em `organization_lifecycle_audit` com org_id/nome/quem).
- **3.3 — Acabamento.** Backups exportam os campos novos de `organizations` (`archived_at` etc.) e a auditoria de ciclo de vida; docs (ARCHITECTURE/SECURITY/RUNBOOK/DECISIONS/CHANGELOG). Teste operacional controlado numa empresa descartável.

## Riscos e decisões técnicas

- **Auditoria tem que sobreviver ao delete** — por isso `org_id`/`actor_user_id` sem FK cascade + snapshot de nome/email. Se puser FK cascade, o registro do "quem apagou" some junto (bug clássico).
- **Irreversível de verdade** — as travas (arquivada + backup recente + nome digitado) são a proteção. O arquivo portátil cifrado baixado é a única rede de segurança após o delete (o `organization_backups` no banco é apagado no cascade).
- **Webhook do Evo Go órfão** — apagar a empresa não limpa o webhook lá na Evo Go (ele passa a apontar pra uma org inexistente → 404). Documentar que o owner deve remover a instância/webhook no Evo Go também. (Fora do escopo de código do app.)
- **Último owner** — `leave` bloqueado pro último owner; `permanent_delete` é o caminho correto para "acabar com a empresa".
- **`admin`/`coordinator`** não encerram nem excluem — só owner. `leave` disponível para qualquer membro.

## Não entra (nesta fatia)

- Exclusão agendada com carência (grace period) automática — pode virar melhoria futura; por ora é arquivar → excluir explícito.
- Console cross-empresa de administração.
- Export GDPR além do backup portátil que já existe.
