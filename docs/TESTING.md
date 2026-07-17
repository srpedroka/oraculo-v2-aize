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

Teste Mestre final no staging, com estado privado persistente entre as fases:

```bash
pnpm run test:master:setup
pnpm run test:master:verify
pnpm run test:master:functional
pnpm run test:master:failures
# Somente após o aceite final:
pnpm run test:master:cleanup
```

O roteiro e o estado atual estão em `docs/MASTER_TEST.md`, e o consolidado em `docs/MASTER_TEST_REPORT.md`. Durante um ciclo aberto, credenciais e IDs ficam apenas em `.agents-private/master-test-7a.json`; o cleanup autorizado apaga esse estado sensível. As evidências sanitizadas ficam em `master-test-7b.json`, `master-test-7c.json` e `master-test-7d.json`, com permissão `600` e fora do Git. As seis capturas sintéticas da revisão final ficam em `.agents-private/master-test-7d-screenshots/`.

## Qualidade estratégica e operacional

O Teste Mestre comprova integridade técnica, mas não substitui a avaliação da condução da IA e do plano produzido. A sequência pós-hardening está em `plans/2026-07-16-qualidade-estrategica-operacional.md`:

- Q0–Q6: rubrica, laboratório, casos de referência, baseline, correções, regressão e aceite estratégico no staging;
- O0–O8: preflight e piloto operacional progressivo com owner, WhatsApp e depois um gestor real;
- o Mapa B não começa antes do gate Q6;
- judge de IA é somente leitura e a aprovação final continua humana;
- custos, versões de prompt/modelo e transcrições sanitizadas fazem parte da evidência.

A Q0 está materializada em:

- `docs/STRATEGIC_QUALITY_STANDARD.md`: regra humana, pontuação, custo, sanitização e gate;
- `tests/evals/strategic-quality/rubric.json`: critérios, pesos, faixas e falhas críticas com IDs estáveis;
- `tests/evals/strategic-quality/deliverable-coverage.json`: todas as rotas, rituais, entregas, métodos e gates;
- `tests/evals/strategic-quality/baseline.json`: modelos observados e hashes dos condutores/prompts;
- `tests/evals/strategic-quality/human-review-template.md`: ficha de revisão independente do judge;
- `src/test/strategic-quality-standard.test.ts`: pesos, duplicidade, mapeamento, custo, sanitização e drift do baseline.

O teste roda dentro da suíte unitária:

```bash
pnpm exec vitest run src/test/strategic-quality-standard.test.ts
```

Uma alteração futura nos condutores ou prompts listados quebra o teste até que o baseline seja atualizado explicitamente e a mudança seja justificada. Isso é deliberado: impede que a comparação Q3/Q5 use versões diferentes sem registrar a troca.

A Q1 adiciona o laboratório isolado descrito em `docs/STRATEGIC_EVALUATION_LAB.md`. Sua validação local roda sem rede:

```bash
pnpm run test:strategic-eval
```

A Q2 adiciona 29 casos de referencia em cinco blocos. O verificador confere schema, contagem, entregas, rubricas, metodos, canais, confirmacoes, 16 falhas criticas e ausencia de identificadores/credenciais. Ele nao acessa staging, producao ou provider:

```bash
pnpm run test:strategic-cases
```

O gate humano e legivel em `docs/STRATEGIC_QUALITY_CASES.md`. O manifesto esta `owner-approved`; a execucao Q3 fica fora do CI porque chama provider pago e exige autorizacao explicita.

O runner Q3 reutiliza as travas da Q1 e pode retomar sem repetir rodadas registradas:

```bash
pnpm run eval:strategic:q3 -- preflight
pnpm run eval:strategic:q3 -- phase Q3A
pnpm run eval:strategic:q3 -- phase Q3B
pnpm run eval:strategic:q3 -- phase Q3C
pnpm run eval:strategic:q3 -- phase Q3D
pnpm run eval:strategic:q3 -- deterministic
pnpm run eval:strategic:q3 -- summary
pnpm run eval:strategic:q3 -- human-packet
```

Transcricoes, propostas, ledger e pacote humano ficam em `.agents-private/` com permissao `600`. O relatorio sanitizado e versionado fica em `docs/STRATEGIC_QUALITY_BASELINE_Q3.md`. Nao use `archive-calibration`, `archive-errors`, `cleanup-stale` ou `repair-execution-checks` fora de um incidente documentado do laboratorio.

O mesmo executor isola a regressao Q5 da baseline Q3. A Q5 exige autorizacao paga propria, para em erro tecnico e nao permite arquivar uma falha para continuar silenciosamente:

```bash
pnpm run eval:strategic:q5 -- preflight
pnpm run eval:strategic:q5 -- deterministic
pnpm run eval:strategic:q5 -- phase Q5A
pnpm run eval:strategic:q5 -- phase Q5B
pnpm run eval:strategic:q5 -- phase Q5C
pnpm run eval:strategic:q5 -- phase Q5D
pnpm run eval:strategic:q5 -- summary
pnpm run eval:strategic:q5 -- compare
pnpm run eval:strategic:q5 -- human-packet
```

`compare` exige as mesmas 40 combinacoes, nove resultados deterministas, 15 entregas cobertas, modelos iguais aos registrados na Q3, inputs sinteticos equivalentes, cleanup, notas minimas, regressao por dimensao, mediana de turnos e custo. `human-packet` monta cinco pares A/B e guarda o gabarito em arquivo privado separado. Em 2026-07-17, a Q4H aprovou os cinco riscos anuais e a Q5A concluiu 10/10 medicoes, sem erro, falha critica ou check reprovado. O runner tambem aceita `rejudge-report <arquivo>` somente para relatorio Q5 privado com cleanup concluido; ele reutiliza transcricao/proposta, envia o escopo canonico ao judge, preserva o parecer anterior e registra apenas o novo custo. Depois do bloqueio inicial da Q5B, o runner passou a encerrar a fase tambem quando `qualityGate=blocked`, sempre depois de persistir relatorio/custo e concluir cleanup; rejudge mantem `qualityStatus` sincronizado. Detalhes em `docs/STRATEGIC_QUALITY_REGRESSION_Q5.md`.

A Q4A possui 15 testes unitarios em `_shared/session-adaptive.test.ts` e um smoke pago, opt-in e restrito ao staging:

```bash
pnpm run eval:strategic:q4a
```

O smoke cria uma empresa e usuario descartaveis, copia apenas a chave temporaria do laboratorio, testa bloco completo, resposta vaga e anti-loop, recusa mutacao pre-confirmacao, registra custo no ledger privado e remove org/usuario/chave. A rodada aprovada em 2026-07-16 passou 15/15; somente `oracle-session` de staging foi publicada. O comando nunca pertence ao CI comum e exige a mesma autorizacao financeira do plano.

A Q4B acrescenta dez testes puros em `_shared/quarterly-guidance.test.ts` e um smoke pago, opt-in e restrito ao staging:

```bash
pnpm run eval:strategic:q4b
```

O runner usa duas empresas descartaveis para cobrir plano anual presente e ausente. Ele testa gestor completo, resposta vaga, excesso de prioridades, atividade como falso objetivo e excecao anual; confirma somente o caso completo e compara proposta, objetivo, acoes e documento canonico. Em 2026-07-16, passou 21/21 antes e depois do reforco final. A rodada final custou US$ 0,066221; as duas validacoes Q4B somaram US$ 0,124095 e removeram empresas, usuarios e chaves. Producao e WhatsApp real nao participam.

A Q4C acrescenta doze testes puros em `_shared/monthly-guidance.test.ts`, testes de periodo/contexto/importacao e um smoke pago, opt-in e restrito ao staging:

```bash
pnpm run eval:strategic:q4c
```

O runner usa duas empresas descartaveis para cobrir mes futuro ligado ao trimestre correto e ausencia de plano trimestral. Ele testa bloco completo, uma confirmacao, limite global de cinco acoes, pendencia herdada, capacidade/backlog, excecao consciente, zero mutacao antes da confirmacao e correspondencia entre proposta, banco e documento. A primeira rodada reprovou apenas o fallback de pendencia em 21/22 e custou US$ 0,042510. Depois da correcao server-side, tres rodadas passaram 22/22: US$ 0,041647, US$ 0,042509 e a prova final apos compatibilidade `YYYY-MM` por US$ 0,042908. Q4C totalizou US$ 0,169574; o acumulado do plano ficou US$ 2,337748. Cleanup foi confirmado nas quatro rodadas; producao e WhatsApp real nao participam.

A Q4D acrescenta testes de naturalidade em `_shared/session-adaptive.test.ts`, `_shared/natural-conversation.test.ts`, a rubrica aplicavel normalizada e um smoke pago opt-in no staging:

```bash
pnpm run eval:strategic:q4d
pnpm run eval:strategic:q4d:recompute .agents-private/<relatorio-q4d>.json
```

O runner executa anual, trimestral, mensal, Revisao Estrategica e fechamentos mensal/trimestral em uma empresa descartavel. Checa uma pergunta, resposta curta, ausencia de bordao/estado tecnico, pergunta ancorada, proposta mensal, zero mutacao e cleanup; o judge avalia escopo, diagnostico, pergunta, desafio, naturalidade, fidelidade e fechamento. `ORACULO_Q4D_DIAGNOSTIC=1` e `ORACULO_Q4D_CASES=ANNUAL|MONTHLY` isolam defeitos sem chamar judge. O recálculo e somente leitura: preserva o relatorio original, normaliza os pesos aplicaveis para 100 e nao chama provider nem staging. Gate final: 95,59, zero candidato critico. Q4D total US$ 0,553094; acumulado US$ 2,890842. Os relatorios bloqueados e erros transitórios foram preservados; todas as empresas, usuarios e chaves descartaveis foram removidos.

A Q4E adiciona testes unitarios dos tres renderizadores e uma integracao opt-in restrita ao staging:

```bash
pnpm run eval:strategic:q4e
```

O teste cria empresa e usuario descartaveis, confirma uma proposta trimestral pela `oracle-session`, compara os objetos semanticos da proposta, banco e documento canonico e procura os mesmos 18 fatos materiais na tela, PDF e WhatsApp. Tambem verifica fingerprint igual, zero mutacao durante a renderizacao, zero `ai_usage_logs` e cleanup. O relatorio opcional fica privado em `.agents-private/strategic-q4e-output-equality-*.json`. Em 2026-07-17, a prova final passou 18/18 sem chamar IA; custo Q4E US$ 0 e acumulado US$ 2,890842.

A Q4F reutiliza os gates existentes em vez de criar uma segunda orquestracao. O aceite executa, nesta ordem, unitarios/fixtures/catalogo, integracao completa no staging, RLS/seguranca, E2E staging desktop/mobile, lint, build/bundle, secret scan e auditoria independente de residuos. Resultado de 2026-07-17: 350 unitarios, 122 integracoes, 7 testes de seguranca e 11 E2E aprovados; zero organizacao/usuario descartavel remanescente. Skips opt-in e justificativas ficam registrados no relatorio `docs/STRATEGIC_QUALITY_ACCEPTANCE_Q4.md`. Custo Q4F US$ 0.

A Q4G reproduz exatamente o primeiro caso anual que bloqueou a Q5, sem alterar o progresso da regressao:

```bash
pnpm run eval:strategic:q4g
```

O motor oferece caminhos contextuais para aspiracoes vagas, classifica falhas do provedor sem expor resposta bruta e compartilha uma unica repeticao transitoria por requisicao. Cada mensagem tem teto inferior ao timeout do cliente. Quando uma proposta completa ja existe e a falha e somente de envelope, estado, fase ou confirmacao, o servidor normaliza esses campos deterministicamente; defeitos de conteudo continuam no reparo por IA. As duas primeiras rodadas bloqueadas foram preservadas (US$ 0,032266 e US$ 0,027390). A rodada final passou com Conducao 85, Plano Anual 100, media 92,50, confirmacao 1/1, zero gravacao prematura, documento canonico e cleanup. Custou US$ 0,040492; Q4G total US$ 0,100148 e acumulado US$ 3,053653. Somente `oracle-session` de staging foi publicada.

A Q4H repete os cinco riscos anuais com parada no primeiro gate reprovado:

```bash
pnpm run eval:strategic:q4h
```

Ela exige nota minima 80 em cada rubrica, media 85, zero candidato critico e zero check reprovado. A rodada aprovada custou US$ 0,263934 e liberou o reinicio limpo da Q5. O judge recebe `sessionScope` com tipo, periodo e area canonicos; um rejudge Q5 nunca regenera o plano nem acessa staging.

A Q4I repete somente o caso trimestral vago que bloqueou a Q5B:

```bash
pnpm run eval:strategic:q4i
```

O smoke exige notas minimas 80, media conjunta 85, zero candidato critico, dez checks deterministas e cleanup completo. Ele verifica diagnostico de situacao/causa/impacto, ausencia de menu generico prematuro e preservacao conservadora de cadencia explicitamente informada. A rodada aprovada obteve Conducao 96,25, Plano Trimestral 97,50 e media 96,88; custou US$ 0,034506 e levou o acumulado a US$ 4,612626. Somente `oracle-session` de staging foi publicada.

O gate real usa `pnpm run eval:strategic:q1` e começa obrigatoriamente pelo Plano Estratégico Anual. Ele exige primeiro o aceite da Q0 R2 e depois credenciais de staging e uma chave de provedor exclusiva/temporária em `.agents-private/strategic-eval-env`. A ausência da chave bloqueia antes da criação de dados. Produção, chaves operacionais e WhatsApp real são recusados pelo desenho do runner.

Não há teto isolado por execução. O runner controla somente o orçamento acumulado de US$ 20, com aviso em US$ 15 e parada preventiva em US$ 19. Toda execução informa separadamente geração do plano, judge, total e acumulado antes/depois.

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
| Exclusão pessoal, último owner, anonimização e retirada do telefone | `tests/integration/personal-account-lifecycle.test.ts` |
| Auditoria administrativa, sanitização, RLS owner-only, idempotência e tela responsiva | `src/test/administrative-audit.test.ts`, `tests/integration/administrative-audit.test.ts`, `tests/security/risk-coverage.test.ts`, `tests/e2e/risk-journeys.spec.ts` |
| RPO, incidentes, fonte interna/R2, checksum, contagens, clone inerte e limpeza | `src/test/disaster-recovery.test.ts`, `tests/integration/disaster-recovery.test.ts`, `tests/security/risk-coverage.test.ts`, `tests/e2e/disaster-recovery.spec.ts` |

## Regras de segurança

- Nunca rodar integração/RLS/E2E autenticado contra produção.
- Nunca colocar credenciais de staging no Git ou em artefatos do Playwright.
- Toda fixture deve usar `createDisposableOrg` e `destroyDisposableOrg`, ou limpeza equivalente para usuário sem empresa.
- O E2E de recuperação intercepta a requisição; não envia email real.
- Configurações de IA e WhatsApp são apenas inspecionadas no E2E; nenhuma chave real é preenchida.
- Falha de limpeza torna a suíte vermelha.
- A limpeza descartável remove `organization_restore_runs` antes dos backups porque esses registros usam `source_org_id`/`target_org_id`, não `org_id`; isso evita referências órfãs quando a fixture desliga triggers para a purga defensiva.

## Limites atuais

As Fatias 4A/4B provam regras críticas, jornadas principais e o gate automático, mas não medem percentual de linhas como meta de produto. Axe, Error Boundary, correlação de logs e alertas pertencem às Fatias 4C–4E.
- `tests/e2e/error-boundary.spec.ts`: força uma falha apenas no build local, valida foco, código, recuperação, viewport desktop/mobile e zero violações Axe críticas/graves. O gatilho é protegido por `import.meta.env.DEV` e não existe no build de produção.
- A suíte de integração usa um único Supabase de staging e roda os arquivos sequencialmente. Alguns cenários criam triggers temporários e exercitam rollback; paralelizar esses arquivos pode saturar o ambiente ou produzir interferência entre provas destrutivas.
- `scripts/run-vitest-files.ts` enumera explicitamente todos os `.test.ts` de integração/segurança e executa cada arquivo com coleta obrigatória. Isso impede um CI verde quando a descoberta automática do Vitest retorna zero arquivos.
- `src/state/store-equivalence.test.tsx` protege a fachada pública de `useAppState` e as ações locais de UI; `src/state/domain-mappers.test.ts` protege os contratos de leitura/escrita extraídos do store para organizações, planejamento, documentos, KPIs, IA e WhatsApp.
- A Fatia 5B repetiu a suíte completa após o deploy dos módulos extraídos: 175 unitários, 95 integrações + 1 skip opt-in e 10 E2E autenticados desktop/mobile. O cenário de PDF comprimido e os contratos de worker/outbox são regressões obrigatórias para o processador modular.
