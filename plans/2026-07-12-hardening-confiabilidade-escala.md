# Plano mestre: integridade, segurança, confiabilidade e escala do Oráculo

> **STATUS: ✅ ETAPAS 0, 1 e 2 concluídas e EM PRODUÇÃO em 2026-07-12. Etapa 3 completa e EM PRODUÇÃO em 2026-07-13: Fatias 3A–3E publicadas, piloto real aprovado para texto, áudio, documento, deduplicação, ordem e envio. Texto não possui mais fallback síncrono, o webhook ficou como entrada mínima e a outbox é obrigatória para respostas normais. Etapas 4–8 não iniciadas.**
> **STATUS original: pronto para execução, ainda não iniciado.**
> Este plano foi escrito para ser executado por Codex, Claude Code, Grok CLI ou outra ferramenta de vibe coding. As etapas são sequenciais. Não começar uma etapa sem concluir e validar a anterior.

## 1. Objetivo

Levar o Oráculo do estado atual de produto funcional para uma base confiável de operação com várias empresas, sem perder a simplicidade do app nem limitar o planejamento pelo WhatsApp.

O plano cobre:

1. fundação de testes e controle da execução;
2. integridade transacional e idempotência;
3. segurança técnica e controle de custo;
4. confiabilidade do WhatsApp com fila e outbox;
5. qualidade automatizada e observabilidade;
6. manutenção, desempenho e escala;
7. governança, LGPD e recuperação de desastre;
8. teste mestre ponta a ponta antes da aprovação final.

## 2. Regras obrigatórias para qualquer agente

### 2.1 Antes de executar qualquer etapa

O agente deve:

1. rodar `git status`;
2. se a árvore estiver limpa, rodar `git pull --rebase`;
3. ler `AGENTS.md`, os handoffs privados disponíveis e esta etapa inteira;
4. confirmar que a etapa anterior está marcada como concluída;
5. identificar migrations, Edge Functions, frontend e integrações afetadas;
6. apresentar ao dono o **Resumo pré-execução obrigatório** abaixo;
7. parar e aguardar autorização explícita do dono antes de editar.

Formato obrigatório do resumo:

```text
ETAPA X — <nome>

Problema que será resolvido:
<explicação sem jargão>

O que muda para quem usa o app:
- <mudanças visíveis>

O que muda no WhatsApp:
- <mudanças visíveis ou "nenhuma mudança funcional">

O que não muda:
- <comportamentos preservados>

Mudanças técnicas:
- Banco/migrations:
- Edge Functions:
- Frontend:
- Integrações:

Riscos e proteção:
- <riscos>
- <rollback>

Testes que serão executados:
- <lista>

Posso executar esta etapa?
```

Se houver alteração de comportamento, o agente precisa dar exemplos de **antes e depois**. Não usar frases vagas como “melhorar segurança” ou “refatorar backend”.

### 2.2 Durante cada etapa

- Executar uma fatia por vez.
- Não misturar refatoração estética com mudança crítica de dados.
- Não alterar uma função pública sem atualizar tipos, chamadas, testes e documentação.
- Toda gravação feita por IA continua exigindo proposta e confirmação humana.
- Toda operação privilegiada continua validando usuário, organização, papel e área no servidor.
- Nunca usar empresa real para teste destrutivo.
- Criar organização e usuários descartáveis com nomes claramente identificados como teste.
- Se uma fatia falhar, parar. Não publicar parcialmente e não reportar conclusão.

### 2.3 Ao final de cada etapa

Executar obrigatoriamente:

```bash
pnpm run lint
pnpm run test
pnpm run build
```

Enquanto `pnpm run test` ainda não existir, executar todos os scripts `test:*` individualmente. Depois da Etapa 0, `pnpm run test` passa a ser obrigatório.

Além disso:

1. aplicar migrations da etapa;
2. publicar somente as Edge Functions afetadas, preservando `verify_jwt` correto;
3. publicar o frontend quando houver alteração nele;
4. executar os testes operacionais descritos na etapa;
5. conferir logs e banco depois do teste;
6. atualizar `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md` e `docs/CHANGELOG.md` quando aplicável;
7. atualizar `.agents-private/handoff-para-claude.md` e o handoff do agente atual;
8. rodar `git diff --check`;
9. commitar e fazer push;
10. confirmar com `git log --oneline -3` e `git status` limpo;
11. entregar um relatório com mudanças, testes, deploys, commit, riscos residuais e link do app.

## 3. Princípios que não podem ser quebrados

- O app continua sendo o cockpit de configuração e visão executiva.
- O WhatsApp continua permitindo planejamento estratégico, trimestral, mensal, revisão, fechamento e atualização operacional.
- A IA sugere e organiza; não grava planos, KPIs ou alterações estruturais sem confirmação.
- Dados de uma organização nunca entram no contexto de outra.
- Owner mantém poder administrativo; admin permanece limitado ao escopo definido; coordenador escreve somente em sua área.
- Arquivos e mídias brutas não viram histórico permanente.
- Backups e registros arquivados continuam recuperáveis conforme a política atual.
- As mudanças devem ser discretas para o usuário. A maior parte desta execução é de confiabilidade interna.

---

# ETAPA 0 — Fundação de execução segura

## 0.1 Resumo funcional que deve ser apresentado antes

Esta etapa não muda a operação do Oráculo. Ela cria a rede mínima de testes, ambientes descartáveis e controles de deploy necessária para mexer em integridade e segurança sem testar diretamente nas empresas reais.

Mudança visível esperada: nenhuma.

## 0.2 Objetivos

- Criar comando único de testes.
- Criar estrutura de testes unitários, integração/RLS e E2E.
- Criar fábrica de organização descartável.
- Registrar baseline de produção.
- Impedir deploy acidental com migrations pendentes ou `verify_jwt` errado.

## 0.3 Fatia 0A — Runner e comandos

1. Adicionar Vitest para helpers e módulos puros.
2. Adicionar React Testing Library para componentes críticos.
3. Adicionar Playwright para fluxos E2E.
4. Preservar os fixtures existentes, migrando-os gradualmente para Vitest ou chamando-os no script agregado.
5. Criar scripts:

```json
{
  "test": "pnpm run test:unit && pnpm run test:integration",
  "test:unit": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e": "playwright test",
  "test:security": "vitest run --config vitest.security.config.ts",
  "check": "pnpm run lint && pnpm run test && pnpm run build"
}
```

6. Não exigir banco remoto nos testes unitários.
7. Testes de integração devem usar projeto Supabase local ou projeto de staging, nunca produção.

## 0.4 Fatia 0B — Organização descartável e dados de teste

Criar helper/script que:

- cria owner de teste;
- cria organização `E2E Oraculo <timestamp>`;
- cria áreas Produção e Comercial;
- cria coordenador e admin;
- gera dados mínimos de plano/KPI;
- devolve IDs em memória/arquivo temporário ignorado pelo Git;
- remove organização e usuários ao final;
- falha de forma visível se a limpeza não acontecer.

Segredos devem vir de variáveis locais/CI. Nunca gerar `.env` versionado.

## 0.5 Fatia 0C — Verificadores de deploy

Criar scripts somente de leitura para verificar:

- migrations locais versus remotas;
- lista de Edge Functions esperadas;
- `verify_jwt=true` para funções autenticadas;
- `verify_jwt=false` somente para webhook/crons explicitamente aprovados;
- frontend publicado e respondendo;
- ausência de segredo versionado;
- dependências com vulnerabilidade alta/crítica.

Manter uma lista declarativa, por exemplo:

```ts
const publicFunctions = [
  "whatsapp-webhook",
  "month-turn",
  "weekly-pulse",
  "deadline-nudges",
  "organization-backup"
];
```

`organization-backup` permanece sem JWT de gateway porque também recebe cron, mas deve continuar autenticando cron ou usuário dentro da função.

## 0.6 Testes obrigatórios da Etapa 0

- Um teste unitário passa e um teste propositalmente quebrado é detectado.
- E2E abre login em desktop e mobile.
- Factory cria e remove organização descartável.
- Teste RLS comprova que usuário da Organização A não lê objetivo da B.
- Verificador detecta uma função simulada com JWT incorreto.
- `pnpm run check` passa.
- `pnpm audit --prod` é registrado como baseline; vulnerabilidades conhecidas ficam abertas para a Etapa 2.

## 0.7 Critério de conclusão

Nenhuma funcionalidade mudou e existe uma forma repetível de testar alterações futuras sem usar dados reais.

---

# ETAPA 1 — Integridade transacional e idempotência

> **STATUS Fatia 1A: ✅ EM PRODUÇÃO (2026-07-12). Migration `operation_commands` aplicada na prod (`bkswkfazkjilwfzwzthz`, aditiva, RLS on) e `oracle-session` (v24) + `whatsapp-webhook` (v63, `--no-verify-jwt`) publicadas. Conexão transacional validada com sonda na prod antes do deploy; `verify_jwt` preservado. Validada no staging (unit + integração: caso feliz, idempotência, concorrência, rollback). Falta só a prova ao vivo na PRIMEIRA confirmação de plano real em produção — acompanhar.** Abordagem aprovada pelo dono: manter a lógica de gravação em TypeScript e envolvê-la numa transação real via conexão direta (`SUPABASE_DB_URL`), em vez de portar para PL/pgSQL — menor risco, uma fonte só da lógica. Adaptador `_shared/tx-client.ts` (subconjunto do supabase-js sobre uma transação, com `jsonb_populate_record` para tipos e fila de serialização) + `_shared/tx-runner.ts` (trava de idempotência). Chave derivada de `session_id + tipo + hash do conteúdo` (frontend não precisou mudar). Testes: `supabase/functions/_shared/tx-client.test.ts` (unit) e `tests/integration/proposal-atomicity.test.ts` (caso feliz, idempotência, concorrência, rollback). Fatias 1B–1D reutilizam esse mesmo envelope.

## 1.1 Resumo funcional que deve ser apresentado antes

Hoje uma confirmação pode começar a gravar um plano e falhar no meio. Depois desta etapa, cada ação importante será “tudo ou nada”. Repetir a mesma confirmação não criará objetivos, ações, KPIs ou documentos duplicados.

Mudanças visíveis:

- confirmações continuam iguais;
- em falha, nada parcial fica salvo;
- repetir um clique/mensagem retorna o mesmo resultado, sem duplicar;
- mensagens de erro passam a informar que nenhuma alteração foi aplicada.

## 1.2 Modelo de idempotência

Criar migration para tabela exclusiva de service role, por exemplo:

```sql
create table public.operation_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor_user_id uuid,
  status text not null check (status in ('processing','completed','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id, operation, idempotency_key)
);
```

Regras:

- RLS habilitada;
- `anon` e `authenticated` sem acesso;
- mesma chave + mesmo hash + concluída: devolver resultado anterior;
- mesma chave + hash diferente: rejeitar;
- exceção dentro da RPC deve reverter comando e dados do domínio;
- chaves derivadas de `session_id + proposal_version` para propostas;
- chaves UUID geradas no cliente para ações manuais.

## 1.3 Fatia 1A — Propostas de planejamento

Operações cobertas:

- `save_strategic_plan`;
- `save_quarterly_plan`;
- `save_monthly_plan`;
- `month_close`;
- `quarter_close`;
- `apply_strategic_review`;
- criação do `plan_document` correspondente;
- encerramento/limpeza da proposta pendente.

Implementação recomendada:

1. A Edge Function continua validando e normalizando a proposta.
2. O documento canônico é montado antes da gravação.
3. Uma RPC transacional recebe payload normalizado, documento e idempotency key.
4. A RPC revalida organização, membership, papel, área e IDs relacionados.
5. A RPC grava todos os registros ou nenhum.
6. `planning_sessions.pending_proposal` só é limpo dentro da mesma transação.
7. Não manter o caminho antigo em paralelo depois da validação.

Não usar compensação manual como substituto de transação.

## 1.4 Fatia 1B — KPI e documento histórico

> **STATUS Fatia 1B: ✅ EM PRODUÇÃO (2026-07-12). Deploy: `apply-kpi-import` (v3) + `oracle-session` (v25) + frontend (Netlify, asset `index-D-5l33DM.js`). SEM migration nova (reusa `operation_commands`). `verify_jwt=true` preservado. Revisada por 3 rodadas de verificação adversarial multiagente. Pendente: prova ao vivo na 1ª importação de KPI real em produção.** `apply-kpi-import` grava `kpi_monthly_values` + `plan_documents(kpi_history)` numa única transação via o envelope da 1A. **Idempotência por AÇÃO** (não por conteúdo): o frontend gera um token (`applyToken`, `crypto.randomUUID`) por importação; `kpiImportCommandKey` chaveia por `token|op` (conteúdo só em `request_hash`). Duplo clique/retry = mesmo token = dedup; reimportação deliberada = token novo = reaplica (corrige valores) — evita o furo de "no-op permanente com falso sucesso" que a versão content-based tinha (achado da verificação). Sem token = token aleatório por request = sempre aplica. Envelope generalizado (`CommandWork` retorna `{ result }`); 1A adaptada com paridade exata (recarrega a sessão sempre, checando erro de reload). Testes: `tests/integration/kpi-import-atomicity.test.ts` (feliz, idempotência, reimportação-reaplica, rollback, permissão) + regressão da 1A verde. Race de numeração de versão de `plan_documents` fica PRÉ-EXISTENTE/fora de escopo.

Transformar `apply-kpi-import` em operação atômica:

- upsert de `kpi_monthly_values`;
- criação de `plan_documents.type = kpi_history`;
- snapshot de auditoria;
- idempotência da importação.

Se o documento falhar, os números não podem mudar. Reenviar a mesma confirmação não cria nova versão.

## 1.5 Fatia 1C — Criação de empresa

> **STATUS Fatia 1C: ✅ EM PRODUÇÃO (2026-07-12). Deploy: nova função `create-organization` (v1) + frontend (Netlify, asset `index-DS_sZ5V3.js`). SEM migration nova. 2 rodadas de verificação adversarial (rodada 1 achou 2 problemas de UX no frontend — falha silenciosa + falso "Empresa criada" — corrigidos com onSuccess/onError; rodada 2 limpa). Pendente: prova ao vivo na 1ª criação de empresa real em produção.** Nova Edge Function `create-organization`: numa única transação (`runInTransaction`, novo helper sem `operation_commands` porque a org ainda não existe e `operation_commands.org_id` é NOT NULL FK) cria `organizations` + `memberships`(owner) + `ai_settings` + 4 `executive_kpis`; a política de backup vem do gatilho existente. **Idempotência pela PK da própria org**, derivada do token do cliente (`uuidFromToken` = sha256→UUID) com `INSERT ON CONFLICT DO NOTHING` (nova opção `ignoreDuplicates` no adaptador); caminho de duplicata confere `created_by == user`. Frontend: `create_organization` no store chama a função com `{name, subtitle, token}` + guarda anti-duplo-clique; `defaultExecutiveKpiRows` migrou pro servidor. Cobre onboarding e Settings (mesmo dispatch). Testes: `tests/integration/create-organization-atomicity.test.ts` (feliz, idempotência, token-novo, rollback, permissão) + 1A/1B sem regressão.

Criar `create-organization` ou RPC segura que grave atomicamente:

- `organizations`;
- membership owner;
- `ai_settings` inicial;
- quatro `executive_kpis`;
- política de backup;
- demais defaults obrigatórios.

Se qualquer seed falhar, a organização não deve existir.

Preservar onboarding e alternância de empresa.

## 1.6 Fatia 1D — Objetivo, ações e vínculos

> **STATUS Fatia 1D: ✅ EM PRODUÇÃO (2026-07-12). Deploy: `save-objective` (v1) + `set-objective-kpi-links` (v1) + frontend (Netlify, `index-BvL9IG0G.js`). SEM migration. 2 rodadas de verificação adversarial: a 1ª pegou uma REGRESSÃO de segurança (a função service-role não revalidava `kpi_id ∈ org`, checagem que a RLS fazia) — corrigido (valida KPI∈org + deduplica kpiId; `save-objective` valida parent_id/owner_membership_id ∈ org); a 2ª (dos fixes) ficou limpa. 10 testes de integração. Pendente: prova ao vivo na 1ª criação de objetivo real em produção.** Caminho MANUAL (o da IA já é atômico desde a 1A). `save-objective`: objetivo + key_actions numa transação (`runInTransaction`), idempotência pela PK do objetivo derivada do token (`uuidFromToken` + ON CONFLICT DO NOTHING); revalida `assertAreaWriter`. `set-objective-kpi-links`: upsert+prune do conjunto numa transação (novo filtro `notIn` com cast uuid no adaptador), preserva `created_at` (a UI ordena por ele), naturalmente idempotente. Frontend: handlers `add_objective`/`set_objective_kpi_links` chamam as funções; builder gera token. `toObjectiveInsert`/`toKeyActionInsert` continuam no frontend (usados por `update_objective`/`update_key_action`, que já são atômicos por serem uma só instrução). Testes: `tests/integration/objective-atomicity.test.ts` (7). **Com a 1D, ETAPA 1 COMPLETA (1A+1B+1C+1D).**

Tornar atômicos:

- objetivo + ações-chave;
- conjunto completo de vínculos objetivo-KPI;
- edições que atualizam mais de uma entidade;
- criação/importação em lote.

Uma falha em ação-chave não pode deixar objetivo órfão com mensagem de erro enganosa.

## 1.7 Testes obrigatórios da Etapa 1

Para cada operação:

1. caso feliz;
2. mesma confirmação duas vezes;
3. mesma chave com payload diferente;
4. falha intencional no último item;
5. usuário sem membership;
6. coordenador em área alheia;
7. admin tentando ação owner-only;
8. referência a objetivo/KPI de outra organização;
9. concorrência com duas requisições simultâneas.

Teste operacional:

- criar plano mensal com dois objetivos e ações;
- confirmar duas vezes pelo app;
- confirmar novamente pelo WhatsApp;
- conferir uma única sessão concluída, um único documento e nenhuma duplicação;
- simular erro de documento e provar rollback completo;
- importar KPI duas vezes e provar idempotência.

## 1.8 Rollback

- Migration nova deve ser aditiva.
- Manter backup antes do deploy.
- Publicar RPC + function antes de trocar frontend.
- Em rollback, frontend/function pode voltar ao commit anterior; não remover tabela de comandos até estabilizar.

## 1.9 Critério de conclusão

Todas as gravações compostas críticas são atômicas e idempotentes, com testes de falha parcial aprovados.

---

# ETAPA 2 — Segurança técnica, MFA e controle de custo

## 2.1 Resumo funcional que deve ser apresentado antes

Esta etapa fecha vulnerabilidades conhecidas e adiciona proteção de conta/custo. A maior mudança visível será a opção de MFA para owners e mensagens claras quando um limite de IA for alcançado.

Antes de ativar MFA obrigatório ou bloquear custo, mostrar exatamente:

- quais ações pedirão segundo fator;
- quem será afetado;
- como recuperar acesso;
- qual limite será padrão;
- o que o Oráculo responde ao atingir o limite.

## 2.1.1 Fatia preliminar 2A.0 — gatilho da fila de backup

**Status: concluída e em produção em 2026-07-12.**

- Corrigido `queue_organization_backup()` para manter o enfileiramento em alterações normais e não inserir uma solicitação quando a organização já está sendo removida por `ON DELETE CASCADE`.
- Migration `20260712150000_fix_backup_queue_on_org_delete.sql` aplicada e registrada no staging e em produção.
- Testes de integração cobrem exclusão normal de registro, exclusão de organização populada e ausência de solicitação órfã.
- Validado com 48 testes unitários, 28 testes de integração, lint e build; smoke check de produção somente de leitura.
- Nenhuma mudança de frontend, WhatsApp ou Edge Function.

## 2.2 Fatia 2A — Dependências vulneráveis

**Status: concluída e em produção em 2026-07-12.** SheetJS oficial `0.20.3` e `lodash 4.18.1`; `.xlsx`, `.xls` e `.csv` preservados; fixtures reais e inválidas aprovadas; `pnpm audit --prod` sem vulnerabilidades conhecidas; frontend Netlify publicado sem mudança de backend.

1. Substituir/pinar `xlsx` em versão oficial corrigida `>=0.20.2` ou parser mantido equivalente.
2. Não aceitar simplesmente ignorar o advisory.
3. Se usar pacote oficial fora do npm, fixar versão e integridade no lockfile e documentar origem.
4. Preservar `.xlsx`, `.xls` e `.csv`. Se o parser seguro não suportar `.xls`, apresentar essa mudança ao dono antes e oferecer conversão clara; não remover silenciosamente.
5. Atualizar Recharts ou aplicar override seguro para `lodash >=4.17.24`.
6. Rodar `pnpm audit --prod`; o aceite é zero vulnerabilidade alta/crítica.
7. Reexecutar fixtures de importação com arquivos reais e arquivos malformados.

## 2.3 Fatia 2B — JWT e configuração declarativa

**Status: concluída e em produção em 2026-07-12.** As 24 funções têm política explícita no `supabase/config.toml`; as três funções administrativas antes públicas exigem JWT; testes cobrem `401`, JWT válido e CORS; `verify:deploy` confirma configuração, remoto, migrations, frontend e segredos sem problemas.

Adicionar entrada explícita em `supabase/config.toml` para todas as functions.

`verify_jwt=true` obrigatório para, entre outras:

- `invite-member`;
- `save-ai-settings`;
- `save-whatsapp-settings`;
- `oracle-chat`;
- `oracle-session`;
- `set-member-role`;
- `set-member-area`;
- `remove-member`;
- imports e lifecycle autenticados.

`verify_jwt=false` somente para:

- `whatsapp-webhook`, protegido por segredo;
- crons protegidos por segredo;
- `organization-backup`, enquanto mantiver endpoint duplo cron/usuário.

Mesmo com gateway JWT, manter `getUser` e autorização server-side.

## 2.4 Fatia 2C — Headers do frontend

**Status: concluída e em produção em 2026-07-12.** CSP e demais headers validados primeiro em preview com enforcement real; login e recuperação sem violações; cache imutável para assets e revalidação do HTML; `verify:deploy` cobre regressões automaticamente.

Adicionar no Netlify, testar e documentar:

- `Content-Security-Policy` compatível com Supabase e assets;
- `frame-ancestors 'none'` ou `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Content-Type-Options: nosniff`;
- `Permissions-Policy` bloqueando câmera/microfone/localização quando não usados;
- HSTS no domínio HTTPS;
- cache longo para assets com hash e `no-cache` para `index.html`.

Montar CSP em modo `Report-Only` primeiro se houver risco de bloquear produção.

## 2.5 Fatia 2D — MFA para owners

> **STATUS: concluída e em produção em 2026-07-12.** Decisão do dono: MFA opcional, sem desafio no login e com política por empresa desligada por padrão. O owner cadastra um ou mais TOTP em Configurações > Segurança e pode elevar a sessão sob demanda. Só depois de ativar explicitamente `Exigir segundo fator em ações críticas`, Edge Functions e RLS exigem `aal2` nos fluxos abaixo. Validação: 62 unitários, 43 integrações, lint/build, revisão visual desktop/mobile e `verify:deploy`; produção confirmou zero política ativa após o deploy.

Implementar em duas fases:

1. cadastro e recuperação de TOTP em Configurações > Segurança;
2. exigir AAL2 para ações críticas:
   - chaves de IA;
   - WhatsApp/segredos;
   - promover/rebaixar papéis;
   - backups portáteis/restauração;
   - arquivar/excluir empresa.

Não exigir MFA de coordenadores nesta primeira versão.

Proteções:

- fluxo de recuperação documentado;
- não ativar obrigatoriedade sem owner ter fator confirmado;
- Edge Functions críticas devem verificar AAL, não apenas esconder botão;
- sessão antiga AAL1 recebe orientação para elevar autenticação.

## 2.6 Fatia 2E — Rate limit e orçamento de IA

> **STATUS: concluída e em produção em 2026-07-12.** Decisão do dono: tudo liberado por enquanto. Defaults: 10 chamadas por pessoa/minuto, 60 por empresa/minuto e referência mensal de US$ 100, sempre em `monitor`; exceder apenas registra evento e continua. Bloqueio existe como opção futura explícita do owner. Contadores são atômicos, alertas 70/90/100 são imediatos e deduplicados, conclusão em andamento tem bypass, falha da telemetria não derruba a IA e WhatsApp recebe mensagem clara se o modo block for ativado no futuro. Política/eventos entram no backup; restauração força `monitor`. Produção recebeu as migrations `20260712220000`/`20260712223000`, nove Edge Functions e o frontend Netlify `6a54320c8619a31f8662e0cb`; `verify:deploy` ficou verde e a consulta final confirmou zero política de bloqueio ativa.

Criar configuração por organização:

- limite de mensagens por pessoa/minuto;
- limite de chamadas por organização/minuto;
- teto mensal em USD ou tokens;
- alerta em 70%, 90% e 100%;
- opção owner de bloquear ou apenas alertar;
- exceção controlada para concluir confirmação já iniciada.

Aplicar antes da chamada ao provedor em `callModelForFunction`.

Comportamento ao bloquear:

```text
O limite de IA desta empresa foi alcançado. Seus dados continuam salvos.
O dono pode revisar o orçamento em Configurações > IA.
```

O WhatsApp não deve ficar silencioso.

## 2.7 Fatia 2F — Prompt injection e entrada não confiável

> **STATUS: concluída e em produção em 2026-07-12.** `_shared/untrusted-content.ts` delimita e neutraliza documentos, limita a estrutura devolvida pela IA e exige o tipo de proposal esperado. Imports estratégico, trimestral e mensal não guardam mais texto bruto nem nome completo do arquivo no histórico da conversa; Memória Estratégica usa os mesmos blocos não confiáveis; o classificador do WhatsApp recebe contexto mínimo sem IDs. Vínculos estratégicos de plano trimestral são conferidos contra objetivos ativos da mesma empresa tanto ao preparar quanto ao confirmar. Validado com 72 testes unitários, 50 integrações, fixtures, auditoria de dependências, lint e build; `oracle-chat`, `oracle-session` e `whatsapp-webhook` publicadas em staging e produção. `verify:deploy` ficou verde. Sem migration ou frontend.

Uniformizar para plano estratégico, trimestral e mensal:

- documento importado é dado, nunca instrução;
- delimitar conteúdo em bloco explícito;
- ignorar pedidos do documento para revelar contexto, segredos ou mudar regras;
- não ecoar contexto privado desnecessariamente;
- validar schema e limites depois do modelo;
- confirmação humana permanece obrigatória.

Adicionar fixtures com documento contendo “ignore as regras”, JSON malicioso, URLs, base64 e tentativa de usar IDs de outra organização.

## 2.8 Testes obrigatórios da Etapa 2

- `pnpm audit --prod` sem alta/crítica.
- Arquivos XLSX/XLS/CSV válidos continuam funcionando.
- Arquivos malformados não congelam a aplicação.
- Requisição sem JWT falha nas functions autenticadas.
- Cron/webhook com segredo inválido falha.
- CSP não bloqueia login, Supabase, fontes, PDFs ou downloads.
- Owner cadastra TOTP, eleva sessão e executa ação crítica.
- Owner AAL1 é bloqueado no servidor em ação crítica.
- Rate limit não afeta conversa normal, mas bloqueia rajada simulada.
- Teto mensal gera aviso e bloqueio conforme configuração.
- Prompt injection não altera contrato nem grava sem confirmação.

## 2.9 Critério de conclusão

Zero vulnerabilidade alta/crítica conhecida, funções com JWT coerente, owner protegido por MFA em ações críticas e custo de IA controlável.

---

# ETAPA 3 — WhatsApp confiável com fila, worker e outbox

## 3.1 Resumo funcional que deve ser apresentado antes

Hoje o WhatsApp tenta fazer tudo durante a chamada do webhook. Depois desta etapa, o webhook confirma recebimento rapidamente e o processamento acontece em uma fila durável.

Mudanças visíveis:

- respostas podem levar alguns segundos, mas deixam de depender do tempo limite do webhook;
- mensagens duplicadas não geram respostas duplicadas;
- falha temporária da IA/Evolution é tentada novamente;
- após falha definitiva, fica diagnóstico visível para owner;
- planejamento e confirmação pelo WhatsApp continuam disponíveis.

## 3.2 Arquitetura alvo

```text
Evolution/Evo Go
      |
      v
whatsapp-webhook (validar, deduplicar, enfileirar, responder 200)
      |
      v
whatsapp_inbound_jobs
      |
      v
whatsapp-worker (ordem por empresa+pessoa, IA, transcrição, gravação)
      |
      v
whatsapp_outbox
      |
      v
whatsapp-sender (retry/backoff)
      |
      v
Evolution/Evo Go
```

## 3.3 Fatia 3A — Fila de entrada

> **STATUS Fatia 3A: publicada em produção em 2026-07-13, com zero empresas ativadas e zero jobs após o deploy.** As migrations criam `whatsapp_inbound_jobs`, RPC service-only e flag por empresa protegida contra alteração pelo navegador. O webhook só enfileira quando a flag está ativa e, caso contrário, preserva integralmente o fluxo síncrono atual. Payloads têm allowlist por tipo; mídia bruta, base64, URL temporária, `mediaKey` e segredos não entram no banco. O fallback de deduplicação usa SHA-256 e não expõe texto. Validação: 76 unitários, 58 integrações no staging, RLS, fixtures, lint, build e `verify:deploy` verdes. A 3B também está publicada, mas a fila deve permanecer desligada até nova autorização e teste operacional.

Criar tabela/RPC de fila com:

- `org_id`;
- chave única do evento;
- telefone/perfil resolvido quando possível;
- tipo `text|audio|document`;
- payload mínimo;
- `status queued|processing|completed|retry|dead`;
- tentativas, próximo retry, lock e erro sanitizado;
- timestamps e correlation ID.

Regras de mídia:

- nunca guardar arquivo/base64 bruto;
- guardar somente o mínimo para buscar/processar a mídia;
- se `mediaKey` temporária for indispensável, cifrar com segredo dedicado, definir expiração curta e apagar imediatamente após processamento;
- documentar explicitamente essa exceção antes de implementá-la;
- job expirado não pode conservar credencial temporária.

O webhook deve responder `200` após enfileirar. Evento não autorizado nunca entra na fila.

## 3.4 Fatia 3B — Worker e ordenação

> **STATUS Fatia 3B: publicada em produção, ainda inerte, em 2026-07-13.** `whatsapp-worker` usa o mesmo núcleo importável do webhook, adquire jobs com `FOR UPDATE SKIP LOCKED`, preserva ordem por empresa+pessoa/telefone, renova e recupera locks, faz até 5 tentativas com backoff, envia falha permanente para `dead` e mantém retenção curta. Webhook desperta o worker sem aguardar; cron a cada minuto recupera jobs, mas o endpoint nasce nulo e mantém o mecanismo inerte. Validação: 80 unitários, 69 integrações regulares, prova opt-in de wake imediato+cron, RLS, fixtures, lint e build. Produção recebeu a migration `20260713120000` e as Functions `whatsapp-worker`/`whatsapp-webhook`; `verify:deploy` ficou verde e a consulta final confirmou endpoint nulo, zero empresas ativas e zero jobs. Pendente obrigatório antes de ativação real: áudio e documento válidos usando uma instância Evolution de staging. A garantia transacional do envio pertence à Fatia 3C.

Extrair do webhook handlers independentes:

- texto;
- áudio;
- documento;
- sessão ativa;
- confirmação;
- atualização rápida;
- pergunta de documento;
- conversa diária.

O worker deve:

- adquirir job com `FOR UPDATE SKIP LOCKED` via RPC;
- manter ordem por `org_id + user_id/phone`;
- impedir duas mensagens simultâneas na mesma conversa;
- renovar lock em trabalho longo;
- reprocessar timeout/erro transitório;
- enviar erro permanente para dead-letter;
- não apagar job concluído imediatamente, respeitando retenção curta para auditoria.

## 3.5 Fatia 3C — Outbox de envio

> **STATUS Fatia 3C: publicada em produção, ainda inerte, em 2026-07-13.** A RPC central grava `chat_messages` e 1–3 blocos de `whatsapp_outbox` na mesma transação; o sender mantém ordem por destino/bloco, heartbeat, lock recovery, retry e dead-letter e marca `sent` apenas após HTTP 2xx. Flag, segredo, endpoint e cron são service-only e nasceram desligados. Validação: 83 unitários, 78 integrações regulares, 1 RLS, fixtures e prova real do webhook enfileirando sem chamar a Evolution no staging. Produção recebeu a migration `20260713160000` e as Functions `whatsapp-sender`, `whatsapp-webhook`, `whatsapp-worker`, `weekly-pulse`, `organization-backup`, `oracle-chat` e `oracle-session`; `verify:deploy` ficou verde. A consulta final confirmou migration=1, cron=1, endpoints nulos, zero flags e zero itens. Pendente antes de ativação: envio real controlado e nova autorização explícita. A Evolution não aceita chave de idempotência, portanto o intervalo após aceite e antes do `sent` local continua ambíguo.

Nunca considerar resposta entregue só porque foi gerada.

Criar `whatsapp_outbox` com:

- mensagem/correlation ID;
- destino;
- conteúdo formatado;
- status;
- tentativas;
- resposta/status da Evolution sanitizado;
- `sent_at` e erro final.

Gravar mensagem do Oráculo e outbox na mesma transação. O sender marca `sent` somente após confirmação HTTP da Evolution.

Retries sugeridos: imediato, 10s, 30s, 2min, 10min. Depois, `dead` e alerta.

## 3.6 Fatia 3D — Recuperação e saúde

> **STATUS Fatia 3D: publicada em produção em 2026-07-13.** Painel owner-only, telemetria service-only de 30 dias, consulta sanitizada à Evolution, teste manual e retry condicionado à fila correspondente. Na publicação original, nenhuma flag/endpoint foi ativada. Validação: 89 unitários, 6 integrações específicas, lint/build, QA visual desktop/mobile e `verify:deploy`. Produção recebeu migration `20260713200000`, `whatsapp-health` v2, `whatsapp-webhook` v69 e Netlify `6a54d36b5d77e73b1a491a0b`; o estado imediatamente após aquele deploy era migration=1, filas/endpoints/jobs/outbox=0.

> **PILOTO OPERACIONAL INICIADO em 2026-07-13:** worker/sender e as duas flags duráveis foram ativados somente na empresa piloto. Evo Go conectada; envio real HTTP 200 em uma tentativa; 10 entregas autenticadas do mesmo evento geraram um único job, uma única mensagem e uma única resposta; duas mensagens rápidas preservaram ordem; zero pendências e zero dead-letter ao final. Texto real também percorreu o caminho completo em uma tentativa. O incidente semântico `Piloto ok` -> evidência foi corrigido e limpo; confirmações curtas são não mutáveis e alvo inferido exige confirmação. O health check usa `/instance/status` da Evo Go e tráfego autenticado como prova do webhook quando a configuração remota não pode ser consultada. Falta validar áudio/documento. Não iniciar 3E antes dessas provas.

Em Configurações > WhatsApp mostrar de forma simples:

- conectado/desconectado;
- último evento recebido;
- última resposta enviada;
- fila pendente;
- falhas recentes;
- botão de teste;
- botão de reprocessar item morto, owner-only;
- URL esperada do webhook sem expor segredo.

Adicionar alerta quando:

- não chega evento por período anormal enquanto instância está conectada;
- outbox acumula;
- taxa de erro passa do limite;
- webhook deixa de estar configurado.

## 3.7 Fatia 3E — Limpeza do webhook

> **STATUS: concluída e em produção em 2026-07-13.** `whatsapp-webhook/index.ts` virou apenas o ponto de entrada; o núcleo único está em `_shared/whatsapp-processor.ts` e é reutilizado pelo worker sem importar outra Edge Function. Texto exige fila + outbox e devolve `503` quando o caminho durável estiver incompleto, sem cair no processador síncrono. Worker valida as flags antes de qualquer mutação. Áudio/documento e PDF continuam como exceções de mídia em memória. A migration `20260713223000` ativa defaults duráveis e atualiza integrações habilitadas; `save-whatsapp-settings` liga/desliga as duas flags junto com a integração. Validação: 128 testes unitários, 91 integrações no staging + 1 skip opt-in, lint e build. Produção recebeu a migration e as Functions `whatsapp-webhook`, `whatsapp-worker` e `save-whatsapp-settings`; `verify:deploy` confirmou 29 Functions e 42 migrations coerentes.

Depois do worker estar validado:

- webhook deve ficar pequeno e previsível;
- remover caminhos síncronos antigos;
- não manter dois processadores ativos;
- atualizar runbook de reconexão Evo Go;
- confirmar que URL com `orgId` e autenticação continuam corretas;
- preservar anti-loop `from_me` e deduplicação.

## 3.8 Testes obrigatórios da Etapa 3

Automatizados e operacionais:

- `oi` simples;
- conversa após 4 horas;
- duas mensagens em sequência rápida;
- mesmo evento entregue 2 e 10 vezes;
- dois usuários simultâneos;
- áudio válido e mídia inválida;
- documento mensal e confirmação;
- proposta confirmada durante retry;
- IA timeout;
- Evolution retorna 500/429/timeout;
- worker morre depois de gravar e antes de enviar;
- sender morre depois de enviar e antes de marcar `sent`;
- ordem das mensagens preservada;
- dead-letter e reprocessamento;
- nenhuma mídia/base64 temporária permanece após TTL.

Teste real controlado:

1. mandar `oi`;
2. mandar áudio curto;
3. iniciar plano mensal;
4. confirmar proposta;
5. desligar temporariamente envio em ambiente de teste;
6. comprovar retry e envio posterior único;
7. conferir `chat_messages`, fila, outbox e logs pelo correlation ID.

## 3.9 Rollback

- Primeiro publicar tabelas e worker sem mudar webhook.
- Ativar fila por feature flag por organização.
- Testar em empresa descartável e depois em uma empresa piloto.
- Manter rollback para processamento antigo por curto período, mas nunca executar os dois no mesmo evento.
- Remover flag antiga somente após estabilidade medida.

## 3.10 Critério de conclusão

Webhook responde rapidamente, processamento é durável, envio tem retry e nenhum cenário de teste produz resposta duplicada ou mensagem silenciosamente perdida.

---

# ETAPA 4 — Qualidade automatizada e observabilidade

> **STATUS Fatia 4C:** concluída em 2026-07-13. Logger estruturado compartilhado conectado aos caminhos críticos `whatsapp-worker`, `whatsapp-sender`, `oracle-chat` e `oracle-session`; quatro Functions publicadas em produção. Logs não carregam conteúdo de conversa, segredos ou payloads brutos.

## 4.1 Resumo funcional que deve ser apresentado antes

Esta etapa não muda os fluxos principais. Ela torna erros detectáveis antes do usuário e cria alertas quando Supabase, IA, WhatsApp, backup ou frontend apresentam problema.

Mudança visível possível: uma tela simples de saúde para owners e mensagens de erro com código de suporte.

## 4.2 Fatia 4A — Cobertura por risco

> **STATUS: concluída em 2026-07-13.** Cobertura local para períodos, telefone, áreas, pricing, imports, idempotência, propostas, memória e formatação; matriz de segurança no staging para empresas, papéis, áreas, segredos, RPCs, arquivo, auditoria e backup; Playwright autenticado desktop/mobile para as jornadas principais com dados descartáveis. Validação: 155 unitários, fixtures, 91 integrações + 1 skip opt-in, 5 testes de segurança/RLS, 8 E2E, lint e build. Comandos e matriz em `docs/TESTING.md`. Sem mudança funcional, migration ou deploy de produção.

Cobertura mínima obrigatória:

### Unitários

- períodos e datas;
- normalização de telefone;
- matching de área;
- pricing;
- parser/importação;
- idempotência;
- sanitização de propostas;
- contexto e memória;
- formatação de KPI/WhatsApp.

### Integração/RLS

- isolamento entre empresas;
- papéis owner/admin/coordenador;
- área própria/alheia;
- tabelas de segredo inacessíveis;
- RPCs exclusivas de service role;
- itens arquivados;
- auditoria e backup.

### E2E

- login/recuperação;
- onboarding;
- empresa/área/pessoa;
- plano estratégico;
- trimestral/mensal;
- KPI;
- histórico;
- arquivo/restauração;
- configurações de IA/WhatsApp sem usar segredos reais no CI.

## 4.3 Fatia 4B — CI obrigatório

Criar pipeline GitHub Actions:

1. instalação congelada pelo lockfile;
2. secret scan;
3. audit de dependências;
4. lint/typecheck;
5. unitários;
6. integração com Supabase local;
7. build;
8. E2E smoke;
9. artefatos de falha, sem dados sensíveis.

Bloquear merge/deploy em falha. Deploy de produção deve usar commit identificado e migrations verificadas.

## 4.4 Fatia 4C — Logs estruturados

Padronizar todas as Edge Functions:

```json
{
  "level": "info|warn|error",
  "requestId": "uuid",
  "function": "whatsapp-worker",
  "orgId": "uuid ou hash quando adequado",
  "userId": "uuid ou null",
  "operation": "...",
  "durationMs": 123,
  "status": "ok|error",
  "errorCode": "AI_TIMEOUT"
}
```

Nunca logar:

- conteúdo completo de conversa/documento;
- telefone/email em claro quando desnecessário;
- chave, token, segredo, URL temporária ou mediaKey;
- payload bruto do webhook.

## 4.5 Fatia 4D — Métricas, alertas e SLOs

> **STATUS: concluída em 2026-07-13.** Monitor operacional a cada cinco minutos, snapshots e alertas service-only, painel owner-only e telemetria sanitizada de falhas de IA. Mede frontend, migrations, webhook, p95 do WhatsApp, filas, backups, custo/erros de IA e testes de restauração. Alertas não bloqueiam a operação nem enviam mensagens. Testes unitários e integração no staging provam abertura, resolução e isolamento.

Definir inicialmente:

- disponibilidade frontend: 99,9%;
- webhook aceito: 99,9%;
- resposta WhatsApp p95 menor que 30s para texto;
- fila sem job parado acima de 5min;
- backup diário concluído em até 26h;
- erro de IA por função/provedor;
- custo mensal por organização;
- restauração testada periodicamente.

Alertas para:

- erro de Edge Function acima do limite;
- fila/outbox parada;
- webhook sem eventos;
- backup atrasado/falhando;
- migration divergente;
- custo próximo do teto;
- frontend indisponível.

Usar Sentry ou ferramenta equivalente para frontend/Edge, removendo dados sensíveis antes do envio.

## 4.6 Fatia 4E — Error Boundary e suporte

> **STATUS: concluída em 2026-07-13.** Error Boundary global substitui tela branca por recuperação com foco, código `ORC-...`, nova tentativa, recarga e Dashboard. Ocorrências autenticadas são correlacionadas no monitor sem mensagem, stack, query string ou conteúdo. Mensagens assíncronas principais usam `role`/`aria-live`. Unitários, integração e Playwright desktop/mobile com Axe cobrem falha, recuperação, isolamento, viewport e contraste.

- Adicionar Error Boundary global.
- Mostrar tela recuperável, nunca tela branca.
- Gerar código de ocorrência/request ID.
- Oferecer `Tentar novamente` e retorno seguro ao Dashboard.
- Não mostrar stack trace ao usuário.
- Mensagens assíncronas devem usar `aria-live` quando apropriado.

## 4.7 Testes obrigatórios da Etapa 4

- CI falha com erro de TypeScript, teste, secret scan e migration divergente.
- Erro proposital de componente cai no Error Boundary.
- Erro de Edge aparece com request ID e sem segredo.
- Alertas são disparados em ambiente de teste.
- Logs permitem seguir webhook -> worker -> outbox pelo mesmo correlation ID.
- E2E principal passa em desktop e mobile.
- Teste axe não encontra violação crítica nas telas principais.

## 4.8 Critério de conclusão

Falhas relevantes são detectadas automaticamente, têm diagnóstico rastreável e bloqueiam deploy quando reproduzíveis.

---

# ETAPA 5 — Estrutura, desempenho e escala

## 5.1 Resumo funcional que deve ser apresentado antes

Esta etapa reorganiza código e carregamento para o app continuar rápido conforme os anos e documentos aumentarem. Não deve remover funcionalidade nem redesenhar o produto.

Mudanças visíveis esperadas:

- abertura mais rápida;
- listas longas paginadas ou carregadas progressivamente;
- menos recarregamentos após pequenas alterações;
- Configurações e WhatsApp mais responsivos.

## 5.2 Fatia 5A — Dividir o store

Separar `src/state/store.tsx` por domínio:

- auth/organizações;
- áreas/pessoas;
- planos/objetivos;
- documentos/histórico;
- KPIs;
- IA/WhatsApp;
- sessões/chat;
- lifecycle/backups.

Preferir hooks React Query por domínio e um contexto pequeno apenas para UI global.

Não trocar toda a arquitetura de uma vez. Migrar domínio por domínio com testes de equivalência.

## 5.3 Fatia 5B — Dividir Edge Functions grandes

No WhatsApp, preservar function pública e mover handlers para módulos.

No motor de sessões, separar:

- criação/retomada;
- importação pronta;
- processamento por condutor;
- confirmação;
- normalizadores;
- documentos.

Em Configurações, separar cada aba em componente/feature próprio.

Meta orientativa: nenhum arquivo central crítico acima de aproximadamente 800 linhas sem justificativa.

## 5.4 Fatia 5C — Queries seletivas e paginação

Hoje o app carrega muitos registros históricos de uma vez. Alterar para:

- dados ativos no carregamento principal;
- arquivo/histórico sob demanda;
- paginação cursor-based para documentos, evidências, check-ins, uso de IA e revisões;
- filtro server-side por ano/área/status;
- limites explícitos;
- índices compostos ajustados às queries reais.

Não esconder dados antigos: eles continuam acessíveis por busca/filtro/paginação.

## 5.5 Fatia 5D — Invalidação seletiva

Substituir `invalidateOrg()` amplo por invalidação da entidade afetada.

Exemplos:

- nova evidência invalida evidências e objetivo relacionado;
- uso de IA invalida somente logs/custo;
- mensagem invalida somente conversa;
- KPI invalida KPI e documento criado;
- alteração de área invalida áreas/planos relacionados.

Realtime deve chamar handlers específicos por tabela.

## 5.6 Fatia 5E — Bundle e rotas

- Usar `React.lazy`/`Suspense` nas páginas.
- Isolar Settings, PDF, XLSX e importadores pesados.
- Definir orçamento de bundle.
- `index.html` deve abrir sem baixar parsers de PDF/planilha antes de serem usados.
- Medir mobile em rede lenta.

Metas iniciais:

- chunk inicial gzip abaixo de 200 KB, se viável;
- nenhuma regressão de interação;
- parsers carregados sob demanda;
- LCP/login/dashboard dentro de meta definida no ambiente real.

## 5.7 Fatia 5F — Concorrência e consistência de tela

- Tratar conflitos de edição com `updated_at`/versão otimista.
- Avisar quando registro mudou em outra sessão.
- Não sobrescrever silenciosamente edição mais nova.
- Preservar auditoria antes/depois.

Começar por objetivos, KPI e configurações críticas.

## 5.8 Testes obrigatórios da Etapa 5

- Dataset com milhares de objetivos/ações/documentos.
- Dashboard não carrega arquivo completo.
- Paginação não duplica nem pula registros.
- Realtime atualiza somente módulos afetados.
- Duas abas editando o mesmo objetivo geram conflito controlado.
- Bundle analyzer confirma redução.
- E2E completo continua passando.
- Desktop e mobile sem sobreposição, salto ou texto cortado.
- Comparar número de requests antes/depois em ações comuns.

## 5.9 Critério de conclusão

O app preserva todas as funcionalidades, carrega menos dados, faz menos requests e mantém desempenho aceitável com vários anos de operação.

---

# ETAPA 6 — Governança, LGPD e recuperação de desastre

## 6.1 Resumo funcional que deve ser apresentado antes

Esta etapa deixa claro como os dados empresariais e pessoais são usados, compartilhados com provedores de IA, guardados, exportados e removidos. Também transforma backup em recuperação comprovada, não apenas arquivo existente.

Mudanças visíveis:

- informações de privacidade e provedores;
- controles de retenção;
- exportação/remoção de conta com proteções;
- histórico administrativo mais completo;
- indicação da última restauração testada.

## 6.2 Fatia 6A — Inventário e classificação de dados

Documentar por tabela/fluxo:

- dado empresarial;
- dado pessoal;
- dado sensível/confidencial;
- origem;
- finalidade;
- base legal definida pelo responsável;
- quem acessa;
- provedor externo;
- retenção;
- forma de exclusão/exportação.

Incluir WhatsApp, áudio transcrito, documentos, prompts, logs de IA, backups e fontes de pesquisa da empresa.

## 6.3 Fatia 6B — Transparência e consentimento operacional

Adicionar política e UI em PT-BR explicando:

- quais dados vão para Supabase;
- quais conteúdos podem ir para OpenAI, Anthropic, xAI ou Moonshot;
- que o dono escolhe provedores/modelos;
- tratamento de WhatsApp e áudio;
- retenção e backups;
- direitos de exportação/correção/exclusão;
- contato responsável.

Não usar checkbox genérico sem ligação com versão da política. Registrar versão/aceite quando juridicamente necessário.

## 6.4 Fatia 6C — Retenção e minimização

Definir e implementar políticas para:

- conversas arquivadas;
- jobs/outbox;
- logs técnicos;
- uso de IA;
- documentos históricos;
- backups;
- usuários sem membership;
- auditorias que precisam sobreviver.

Exclusão automática deve ser reversível quando possível e nunca apagar auditoria obrigatória sem decisão documentada.

## 6.5 Fatia 6D — Conta pessoal e desligamento

Criar fluxo seguro para:

- exportar dados pessoais associados;
- corrigir perfil;
- sair de empresa;
- solicitar exclusão da conta Auth/perfil;
- bloquear exclusão se for último owner, orientando transferência/encerramento;
- preservar registros empresariais com autoria anonimizada quando necessário;
- remover telefone para impedir WhatsApp após desligamento.

Não apagar histórico empresarial apenas porque um colaborador saiu, salvo decisão legal específica.

## 6.6 Fatia 6E — Auditoria administrativa

Adicionar trilha para:

- convite/remoção de membro;
- troca de papel/área;
- alteração de IA/modelo/chave sem guardar a chave;
- alteração de WhatsApp sem guardar segredo;
- MFA e eventos críticos de segurança;
- política de backup;
- restauração;
- orçamento de IA;
- mudanças de retenção.

Guardar ator, ação, alvo, antes/depois sanitizado, timestamp e request ID.

## 6.7 Fatia 6F — Recuperação de desastre

Definir:

- RPO: perda máxima aceitável de dados;
- RTO: tempo máximo para restaurar;
- responsável por incidente;
- canal de comunicação;
- sequência de recuperação Supabase, Netlify, Evolution e provedores;
- rotação de segredos após incidente.

Backups externos:

- bucket privado fora do projeto principal;
- versionamento e retenção;
- criptografia server-side/KMS ou bucket default comprovado;
- credencial mínima;
- alerta de réplica falha;
- teste de restauração trimestral automatizado ou assistido.

## 6.8 Testes obrigatórios da Etapa 6

- Exportar pacote e verificar conteúdo esperado/exclusões.
- Restaurar como clone e comparar contagens/checksum.
- Fazer login no clone e abrir planos, documentos, KPIs e histórico.
- Confirmar que chaves/WhatsApp não foram restaurados ativos.
- Simular saída e exclusão de colaborador.
- Bloquear exclusão do último owner.
- Conferir auditoria administrativa sem segredos.
- Executar limpeza por retenção em dados descartáveis.
- Medir RPO/RTO real do exercício.
- Registrar data, resultado e falhas do restore drill.

## 6.9 Critério de conclusão

O produto possui política clara de dados, controles de titularidade, auditoria administrativa e restauração comprovada dentro do RPO/RTO definido.

---

# 7. TESTE MESTRE FINAL — Aprovação do pacote inteiro

Este teste só ocorre depois das Etapas 0 a 6 concluídas.

## 7.1 Preparação

- Criar owner, admin e dois coordenadores descartáveis.
- Criar Organização A e Organização B.
- Configurar áreas Produção e Comercial na A.
- Usar chaves/provedores de teste com orçamento baixo.
- Configurar instância WhatsApp de teste.
- Registrar IDs e horário de início.

## 7.2 Cenário funcional completo

1. Login owner com MFA.
2. Criar empresa e verificar quatro KPIs/defaults.
3. Criar áreas e pessoas.
4. Confirmar permissões owner/admin/coordenador.
5. Importar histórico estratégico, trimestral e mensal.
6. Criar plano estratégico pelo app.
7. Confirmar duas vezes e provar idempotência.
8. Criar plano trimestral pelo WhatsApp.
9. Criar plano mensal por áudio/documento.
10. Atualizar ação pelo WhatsApp.
11. Fazer revisão mensal.
12. Importar KPI por XLSX e imagem.
13. Conferir Dashboard e vínculo objetivo-KPI.
14. Arquivar/restaurar objetivo, área e documento.
15. Verificar auditoria.
16. Criar backup, baixar pacote cifrado e restaurar clone.
17. Conferir clone e exclusão de segredos.

## 7.3 Cenário de falhas

- Repetir evento WhatsApp.
- Derrubar provedor de IA de teste.
- Simular Evolution 500 e timeout.
- Falhar último item de uma proposta.
- Enviar duas confirmações simultâneas.
- Tentar acesso cruzado A -> B.
- Tentar ação owner como coordenador/admin.
- Estourar rate limit e orçamento.
- Simular frontend exception.
- Simular backup externo indisponível.

## 7.4 Aceite final obrigatório

O pacote só é aprovado se:

- nenhuma gravação parcial for encontrada;
- nenhuma duplicação ocorrer;
- nenhum acesso cruzado funcionar;
- nenhuma função autenticada estiver com JWT indevido;
- não houver vulnerabilidade alta/crítica conhecida;
- WhatsApp recuperar falhas transitórias;
- mensagens mortas forem diagnosticáveis;
- backup restaurar dentro do RTO;
- CI, lint, testes e build passarem;
- desktop/mobile passarem revisão visual;
- logs não contiverem segredos ou conteúdo indevido;
- documentação e handoffs estiverem atualizados;
- produção passar smoke test sem alterar empresa real.

## 7.5 Relatório final

O agente deve entregar:

- tabela de todas as etapas/fatias;
- commits e deploys;
- migrations aplicadas;
- testes e evidências;
- métricas antes/depois;
- vulnerabilidades resolvidas;
- RPO/RTO medidos;
- riscos residuais;
- decisões que ainda dependem do dono;
- link de produção.

---

# 8. Ordem de execução recomendada

| Ordem | Etapa | Motivo |
|---|---|---|
| 0 | Fundação | Permite alterar com segurança |
| 1 | Integridade | Evita perda e duplicação de dados |
| 2 | Segurança | Fecha vulnerabilidades e abuso/custo |
| 3 | WhatsApp | Resolve a principal fragilidade operacional |
| 4 | Qualidade/observabilidade | Detecta regressões e incidentes |
| 5 | Estrutura/escala | Reduz complexidade e degradação futura |
| 6 | Governança/LGPD/DR | Prepara expansão comercial responsável |
| 7 | Teste mestre | Aprova o conjunto como sistema único |

Não inverter Integridade e WhatsApp: a fila não deve chamar gravações compostas ainda não idempotentes. Não deixar testes apenas para o final: cada fatia precisa sair coberta.

# 9. Estimativa relativa

Estimativa em esforço técnico, não calendário:

- Etapa 0: média;
- Etapa 1: alta e crítica;
- Etapa 2: média/alta;
- Etapa 3: alta e crítica;
- Etapa 4: média/alta;
- Etapa 5: alta, porém divisível;
- Etapa 6: média tecnicamente, com decisões jurídicas/operacionais;
- Teste mestre: média.

A execução deve privilegiar segurança e comprovação. “Funcionou uma vez” não é critério de aceite para integridade, WhatsApp ou backup.

# 10. Prompt pronto para iniciar em outra ferramenta

Usar este texto, trocando apenas o número da etapa:

```text
Rode git pull --rebase. Leia AGENTS.md, os handoffs privados disponíveis e
plans/2026-07-12-hardening-confiabilidade-escala.md.

Quero executar somente a ETAPA <NOME/NÚMERO>, fatia por fatia. Antes de editar
qualquer arquivo, cumpra o “Resumo pré-execução obrigatório” do plano: explique
em linguagem simples o que muda no app, no WhatsApp, no banco e nas permissões,
mostre exemplos de antes/depois quando houver mudança funcional, informe riscos,
rollback e testes, e PARE para minha autorização.

Depois de autorizado, execute uma fatia por vez. Não use empresa real em teste
destrutivo. Se qualquer migration, teste, build ou deploy falhar, pare e informe
o erro; não reporte conclusão parcial.

Ao concluir a etapa, rode todos os testes obrigatórios do plano, lint e build,
aplique migrations, publique apenas as Edge Functions afetadas e o frontend
quando necessário, faça smoke test, atualize documentação e handoffs, commite,
faça push e confirme com git log --oneline -3 e git status limpo. Inclua o link
de produção no relatório final.

Não avance para a etapa seguinte sem novo pedido meu.
```

Para a primeira execução, substituir por `ETAPA 0 — Fundação de execução segura`.
