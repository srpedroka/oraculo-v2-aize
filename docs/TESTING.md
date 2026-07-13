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

## Regras de segurança

- Nunca rodar integração/RLS/E2E autenticado contra produção.
- Nunca colocar credenciais de staging no Git ou em artefatos do Playwright.
- Toda fixture deve usar `createDisposableOrg` e `destroyDisposableOrg`, ou limpeza equivalente para usuário sem empresa.
- O E2E de recuperação intercepta a requisição; não envia email real.
- Configurações de IA e WhatsApp são apenas inspecionadas no E2E; nenhuma chave real é preenchida.
- Falha de limpeza torna a suíte vermelha.

## Limites atuais

As Fatias 4A/4B provam regras críticas, jornadas principais e o gate automático, mas não medem percentual de linhas como meta de produto. Axe, Error Boundary, correlação de logs e alertas pertencem às Fatias 4C–4E.
