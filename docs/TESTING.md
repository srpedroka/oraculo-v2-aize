# Testes automatizados

## Princípio

A suíte é organizada por risco. Testes unitários não acessam rede; integração e RLS usam Supabase local no CI ou staging isolado e recusam a referência de produção; E2E autenticado inicia um frontend local e cria organizações/usuários descartáveis com limpeza obrigatória.

## CI obrigatorio

Pull requests e pushes para `main` executam `.github/workflows/ci.yml`. O status de protecao da branch e `CI required`. A especificacao completa, os artefatos sanitizados e a verificacao por commit estao em `docs/CI.md`.

## Comandos

Sem rede:

```bash
pnpm run test:unit
pnpm run lint
pnpm run build
```

Ao mover código de Edge Functions, verificar também as entradas afetadas com Deno. O `tsc` do frontend não cobre esses módulos:

```bash
pnpm dlx deno check --node-modules-dir=auto supabase/functions/whatsapp-webhook/index.ts supabase/functions/whatsapp-worker/index.ts supabase/functions/oracle-chat/index.ts supabase/functions/oracle-session/index.ts
```

Erros de tipagem legados podem aparecer nessa checagem; referências ausentes (`TS2304`/`TS2552`) bloqueiam o deploy.

Staging (carregar as variáveis privadas sem exibi-las):

```bash
set -a
source .agents-private/agent-env
set +a
pnpm run test:integration
pnpm run test:security
pnpm run test:e2e:staging
```

Os testes que injetam falhas SQL usam `SUPABASE_STAGING_DB_URL` quando a URL e local. Em staging hospedado, usam `SUPABASE_STAGING_PROJECT_REF` e `SUPABASE_STAGING_ACCESS_TOKEN` pela Management API. A decisao fica centralizada em `tests/helpers/sql.ts`.

O Supabase local precisa nascer apenas das migrations versionadas. `20260714120000_service_role_baseline_grants.sql` declara os privilégios administrativos que o ambiente hospedado provisiona para `service_role`; sem essa base, a autenticação admin funciona, mas operações REST em tabelas básicas falham com `permission denied`.

Smoke público, somente leitura:

```bash
pnpm run test:e2e
```

## Matriz da Fatia 4A

| Risco | Cobertura principal |
| --- | --- |
| Períodos, datas e viradas de ano | `src/lib/periods.test.ts`, `_shared/periods.test.ts`, `src/lib/execution.test.ts` |
| Telefone e variação brasileira do nono dígito | `_shared/phone.test.ts` |
| Área exata, equivalente e ambígua | `_shared/area-matching.test.ts`, `_shared/whatsapp-planning.test.ts` |
| Catálogo e preço frontend/servidor | `src/lib/aiPricing.test.ts` |
| TXT/PPTX, planilha, imagem e estrutura histórica | `src/lib/fileImport.test.ts`, `src/lib/kpiSpreadsheet.test.ts`, `_shared/historical-import.test.ts` |
| Idempotência e transações | `_shared/tx-client.test.ts`, `proposal-atomicity`, `kpi-import-atomicity`, `create-organization-atomicity`, `objective-atomicity` |
| Propostas e conteúdo não confiável | `_shared/untrusted-content.test.ts`, `_shared/confirmation-policy.test.ts` |
| Contexto e memória estratégica | `_shared/plan-context.test.ts`, `test:conversation-memory` |
| KPI e formatação do WhatsApp | `src/lib/kpi.test.ts`, `_shared/whatsapp-*` |
| Isolamento entre empresas | `tests/security/rls.test.ts`, `tests/security/risk-coverage.test.ts` |
| Owner/admin/coordenador e área própria/alheia | `tests/security/risk-coverage.test.ts` |
| Segredos e RPCs service-only | `tests/security/risk-coverage.test.ts`, `function-jwt.test.ts` |
| Arquivo, auditoria e backup | `tests/security/risk-coverage.test.ts`, `backup-trigger-delete.test.ts` |
| Login, recuperação e onboarding | `tests/e2e/login.spec.ts`, `tests/e2e/risk-journeys.spec.ts` |
| Dashboard/KPI, planos, documentos, áreas, execução, arquivo e configurações | `tests/e2e/risk-journeys.spec.ts` em desktop e mobile |
| Paginação e invalidação seletiva do cache | `src/state/use-paginated-records.test.ts`, `src/state/query-invalidation.test.ts`, `tests/integration/cursor-pagination.test.ts` |

## Regras de segurança

- Nunca rodar integração/RLS/E2E autenticado contra produção.
- Nunca colocar credenciais de staging no Git ou em artefatos do Playwright.
- Toda fixture deve usar `createDisposableOrg` e `destroyDisposableOrg`, ou limpeza equivalente para usuário sem empresa.
- O E2E de recuperação intercepta a requisição; não envia email real.
- Configurações de IA e WhatsApp são apenas inspecionadas no E2E; nenhuma chave real é preenchida.
- Falha de limpeza torna a suíte vermelha.

## Limites atuais

As Fatias 4A/4B provam regras críticas, jornadas principais e o gate automático, mas não medem percentual de linhas como meta de produto. Axe, Error Boundary, correlação de logs e alertas pertencem às Fatias 4C–4E.
- `tests/e2e/error-boundary.spec.ts`: força uma falha apenas no build local, valida foco, código, recuperação, viewport desktop/mobile e zero violações Axe críticas/graves. O gatilho é protegido por `import.meta.env.DEV` e não existe no build de produção.
- A suíte de integração usa um único Supabase de staging e roda os arquivos sequencialmente. Alguns cenários criam triggers temporários e exercitam rollback; paralelizar esses arquivos pode saturar o ambiente ou produzir interferência entre provas destrutivas.
- `src/state/store-equivalence.test.tsx` protege a fachada pública de `useAppState` e as ações locais de UI; `src/state/domain-mappers.test.ts` protege os contratos de leitura/escrita extraídos do store para organizações, planejamento, documentos, KPIs, IA e WhatsApp.
- A Fatia 5B repetiu a suíte completa após o deploy dos módulos extraídos: 175 unitários, 95 integrações + 1 skip opt-in e 10 E2E autenticados desktop/mobile. O cenário de PDF comprimido e os contratos de worker/outbox são regressões obrigatórias para o processador modular.
