# ORACULO - Guia para agentes de IA

Este arquivo e o ponto de entrada para qualquer agente trabalhar no projeto sem contexto previo. Ele resume o produto, a stack, a estrutura, os comandos, as integracoes, as regras de seguranca e o estado atual.

Idioma do produto: portugues do Brasil.
Idioma do codigo: ingles para identificadores, tipos, variaveis e nomes tecnicos. Textos visiveis ficam em PT-BR.

## 1. Visao geral

O Oraculo V2/V3 e um sistema web de execucao estrategica para empresas acompanharem Resultado, Evolucao, planos estrategicos anuais, planos trimestrais por area e execucao mensal com apoio de uma IA estrategica.

O app permite:

- autenticar usuarios e organizar empresas;
- cadastrar areas, membros, coordenadores e permissoes;
- criar/importar plano estrategico, plano trimestral e plano mensal;
- registrar objetivos, acoes-chave, evidencias, check-ins e fechamentos;
- conversar com o Oraculo pelo app e pelo WhatsApp;
- configurar provedores/modelos de IA por funcao;
- configurar o tom/persona do Oraculo por empresa, com presets e eixos;
- rastrear tokens e custo estimado;
- gerar documentos canonicos de planos e fechamentos para tela, PDF e WhatsApp.

## 2. Stack tecnica

- Linguagem principal: TypeScript.
- Frontend: Vite `^5.4.8`, React `^18.3.1`, React DOM `^18.3.1`.
- Rotas: React Router DOM `^6.26.2`.
- Estado e dados: React Context + `useReducer` para UI local; React Query `^5.101.2` para dados remotos.
- Estilo: TailwindCSS `^3.4.13`, PostCSS, Autoprefixer, fonte Inter via `@fontsource/inter`.
- Icones: `lucide-react`.
- Graficos: `recharts`.
- Importacao de arquivos: `pdfjs-dist`, `mammoth`, `jszip`.
- Backend/Banco/Auth/Realtime: Supabase.
- Backend leve: Supabase Edge Functions em Deno.
- Deploy frontend: Netlify.
- Gerenciador de pacotes: `pnpm`.
- Node exigido: `>=22.13.0`.

Scripts reais em `package.json`:

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "lint": "tsc --noEmit --pretty false"
}
```

## 3. Estrutura de pastas

- `src/`: frontend React.
- `src/main.tsx`: entrada do React.
- `src/App.tsx`: rotas, guardas de sessao, onboarding e recuperacao de senha.
- `src/index.css`: Tailwind e estilos globais.
- `src/components/`: layout, sidebar, painel do Oraculo, documentos e componentes reutilizaveis.
- `src/components/ui/`: componentes basicos de interface (`Button`, `Card`, badges, barras, regua de concretude).
- `src/features/objective/`: cards, builder e editor de objetivos.
- `src/lib/`: helpers de Supabase, importacao de arquivo, pricing de IA, periodos, formatacao, concretude e cliente do Oraculo.
- `src/pages/`: telas principais do produto.
- `src/state/store.tsx`: fachada compatível do store; compõe contrato/UI, consultas e comandos extraídos em `src/state/store-*.ts`, `use-*.ts` e `src/state/domains/`.
- `src/types/`: tipos compartilhados do frontend.
- `src/data/`: seed local/historico.
- `supabase/migrations/`: schema, RLS, realtime, tabelas de segredo bloqueadas e fundacao V3.
- `supabase/functions/`: Edge Functions publicadas no Supabase.
- `supabase/functions/_shared/`: codigo compartilhado das Edge Functions.
- `supabase/functions/_shared/conductors/`: persona e condutores do Oraculo para planejamento e fechamentos.
- `docs/`: documentacao de arquitetura, seguranca, inventario de dados, acessos, runbook, decisoes e changelog.
- `plans/`: planos de implementacao e referencia.
- `public/`: arquivos estaticos, incluindo fallback `_redirects`.
- `dist/`: build gerado localmente, nao deve ser versionado.
- `.supabase-private/`, `.netlify/`, `.pnpm-store/`: artefatos locais privados/cache, nao devem ser versionados.

## 4. Comandos essenciais

Instalar dependencias:

```bash
pnpm install
```

Rodar local:

```bash
pnpm run dev
```

URL local usual:

```text
http://127.0.0.1:5173
```

Se a porta estiver ocupada, o Vite pode abrir em outra porta.

Checar tipos/lint:

```bash
pnpm run lint
```

Build de producao:

```bash
pnpm run build
```

Preview local do build:

```bash
pnpm run preview
```

Testes automatizados:

- `pnpm run test:unit`: Vitest local, sem rede.
- `pnpm run test:integration`: integrações no Supabase de staging.
- `pnpm run test:security`: matriz de RLS, papéis, segredos, lifecycle, auditoria e backup no staging.
- `pnpm run test:e2e`: smoke público de login, somente leitura.
- `pnpm run test:e2e:staging`: jornadas autenticadas desktop/mobile com dados descartáveis.
- Matriz e regras: `docs/TESTING.md`.
- Antes de encerrar mudança relevante, rode ao menos unitários, lint e build; amplie para integração/segurança/E2E conforme o risco.

Deploy frontend manual:

```bash
netlify deploy --prod --dir=dist
```

Deploy Supabase Functions via CLI nova, quando Docker local nao estiver disponivel:

```bash
supabase functions deploy whatsapp-webhook oracle-chat --project-ref bkswkfazkjilwfzwzthz --use-api
```

`supabase/config.toml` e a fonte de verdade de `verify_jwt` para todas as Edge Functions. Nao use flags manuais para mudar a politica durante um deploy; rode `pnpm run verify:deploy` depois de publicar.

## 5. Arquivos-chave, rotas e variaveis

### Frontend

- `src/App.tsx`: rotas:
  - `/`: Dashboard;
  - `/estrategico`: Plano Estrategico;
  - `/planos-trimestrais`: Planos Trimestrais;
  - `/documentos`: Documentos canonicos;
  - `/documentos/:documentId/imprimir`: impressao/PDF A4 sem layout do app;
  - `/areas`: Areas;
  - `/areas/:areaId`: detalhe da area;
  - `/execucao`: Execucao Viva;
  - `/arquivo`: arquivo operacional e historico de alteracoes;
  - `/configuracoes`: configuracoes de conta, empresa, IA, WhatsApp e membros;
  - `/privacidade`: aviso público de privacidade e uso de dados;
  - `/redefinir-senha`: recuperacao de senha.
- `src/state/store.tsx`: principal ponte entre frontend e Supabase.
- `src/lib/supabase.ts`: cliente Supabase do navegador e checagem de configuracao.
- `src/lib/fileImport.ts`: extracao local de texto de PDF/PPTX/DOCX/TXT.
- `src/lib/aiPricing.ts`: catalogo de pricing usado na UI.
- `src/lib/kpi.ts`: formatacao e calculos dos KPIs; cards usam ate 2 casas e tooltip do grafico ate 4. Fixture: `pnpm run test:kpi-format`.
- `src/components/OraclePanel.tsx`: chat lateral do Oraculo, sessoes e anexos.
- `src/components/PlanDocument.tsx`: renderizacao canonica de documentos.
- `src/features/objective/ObjectiveEditDialog.tsx`: edicao manual de objetivos.

### Supabase

Migrations principais:

- `supabase/migrations/20260629150100_initial_schema.sql`: schema inicial.
- `supabase/migrations/20260629150200_auth_rls.sql`: triggers e RLS.
- `supabase/migrations/20260629150300_v2_runtime_support.sql`: suporte runtime inicial.
- `supabase/migrations/20260630130000_whatsapp_integration.sql`: WhatsApp.
- `supabase/migrations/20260702121500_service_role_secret_tables.sql`: tabelas de segredo acessiveis apenas via service role.
- `supabase/migrations/20260702152000_ai_pricing_usage.sql`: pricing e logs de uso de IA.
- `supabase/migrations/20260704110000_v3_intelligence_foundation.sql`: conversas, sessoes, funcoes de IA e documentos canonicos.
- `supabase/migrations/20260704123000_v3_ai_function_router.sql`: roteador por funcao e xAI/Grok.
- `supabase/migrations/20260709150000_org_ai_tone.sql`: tom/persona por empresa, RLS e realtime.
- `supabase/migrations/20260710170000_area_lifecycle_member_removal.sql`: arquivamento reversivel de areas e remocao transacional de memberships.
- `supabase/migrations/20260710193000_operational_lifecycle.sql`: arquivamento reversivel de registros operacionais e snapshots antes/depois de planos e KPIs.
- `supabase/migrations/20260713200000_whatsapp_health.sql`: telemetria técnica service-only, alertas e recuperação controlada de dead-letter do WhatsApp.
- `supabase/migrations/20260713090000_whatsapp_inbound_queue.sql`: fundacao da fila de entrada do WhatsApp, desligada por padrao.
- `supabase/migrations/20260713093000_whatsapp_inbound_queue_flag_guard.sql`: corrige e reforca a flag server-only.
- `supabase/migrations/20260713120000_whatsapp_worker.sql`: worker, locks, retry/dead-letter, segredo e cron inerte.
- `supabase/migrations/20260713160000_whatsapp_outbox.sql`: outbox transacional, sender, retry/dead-letter e cron inerte de saída.
- `supabase/migrations/20260713223000_whatsapp_durable_path_default.sql`: torna fila/outbox padrão para integrações ativas e remove o fallback síncrono de texto.
- `supabase/migrations/20260714150000_cursor_pagination_indexes.sql`: indices compostos para listas historicas com cursor por empresa.
- `supabase/migrations/20260712190000_optional_owner_mfa.sql`: politica opcional de MFA por empresa.
- `supabase/migrations/20260712193000_mfa_rls_defense.sql`: defesa AAL2 condicional nas policies de acoes criticas.
- `supabase/migrations/20260712220000_ai_controls.sql`: limites, orçamento, contadores e alertas de IA em modo monitor por padrão.
- `supabase/migrations/20260712223000_ai_budget_alert_refresh.sql`: alertas mensais imediatos e deduplicados após registrar custo.
- `supabase/migrations/20260715220000_disaster_recovery.sql`: RPO mensurável, verificação de restores, incidentes estruturados e cobertura dos gatilhos de backup.
- `supabase/migrations/20260714223000_optimistic_concurrency.sql`: versao otimista e gravacoes condicionais atomicas para objetivo, KPI e configuracoes criticas.
- `supabase/migrations/20260714120000_service_role_baseline_grants.sql`: mantém Supabase local/hospedado equivalentes nos grants server-only do `service_role` e nos defaults de objetos futuros.
- `supabase/migrations/20260714090000_operational_health_slos.sql`: snapshots, alertas, falhas sanitizadas de IA e cron do monitor operacional.
- `supabase/migrations/20260714190000_s4_operational_safety.sql`: eventos de segurança service-only e classificação dos exercícios mensal/trimestral de recuperação.
- `supabase/migrations/20260714110000_frontend_error_events.sql`: correlação service-only dos códigos de ocorrência do Error Boundary.
- `supabase/migrations/20260715100000_data_notice_acknowledgements.sql`: versões públicas do aviso e ciência imutável por empresa, com RLS membro-lê/owner-insere.
- `supabase/migrations/20260715140000_data_retention.sql`: retenção técnica diária, prévia service-only, resumo sanitizado e preservação explícita da memória estratégica.
- `supabase/migrations/20260715170000_personal_account_lifecycle.sql`: exportação/exclusão pessoal, proteção transacional do último owner, anonimização de autoria e retirada do telefone sem vínculos.

Tabelas publicas importantes:

- `profiles`
- `organizations`
- `memberships`
- `areas`
- `strategic_plans`
- `area_plans`
- `objectives`
- `key_actions`
- `strategic_projects`
- `evidences`
- `chat_messages`
- `check_ins`
- `ai_settings`
- `ai_function_settings`
- `ai_provider_key_status`
- `ai_usage_logs`
- `org_ai_tone`
- `whatsapp_settings`
- `whatsapp_health_events`
- `whatsapp_inbound_jobs`
- `whatsapp_worker_secrets`
- `whatsapp_outbox`
- `whatsapp_sender_secrets`
- `data_notice_versions`
- `organization_data_notice_acknowledgements`
- `data_retention_runs`
- `personal_data_requests`
- `administrative_audit_events`
- `organization_recovery_incidents`
- `conversations`
- `planning_sessions`
- `plan_documents`
- `operational_revisions`
- `organization_security_settings`
- `ai_control_policies`
- `ai_limit_events`

Tabelas com segredos reais, bloqueadas para `anon` e `authenticated`:

- `public.ai_model_keys`
- `public.whatsapp_instance_keys`
- `public.whatsapp_worker_secrets`
- `public.whatsapp_sender_secrets`

Observacao: migrations antigas podem citar schema `private`, mas o caminho operacional atual usa tabelas publicas bloqueadas por RLS/revokes e acessadas somente por `service_role`.

### Edge Functions

- `invite-member`: cadastro de membros e convite **somente por WhatsApp** (link pessoal); cadastro silencioso sem mensagem.
- `set-member-area`: troca atomica da area principal do membro (owner).
- `suggest-historical-metadata`: extrai cabecalho explicito, classifica historico (texto/imagem) e devolve `headerMetadata` + `importSuggestion` estruturado (candidatos, tabelas, conflitos); acao de uso `historical_import_classification`.
- `save-historical-document`: grava historico com `content.raw`, `content.source_metadata` e `content.import_backup` recuperavel (sem midia bruta); aceita lote atomico de candidatos e a reabertura cria nova versao.
- `set-member-role`: altera papel de membros com proteção do último owner.
- `remove-member`: revoga o acesso de uma pessoa, reatribui áreas em transação e preserva perfil/histórico.
- `personal-account`: exporta dados pessoais/autorais acessíveis e exclui Auth/perfil/vínculos com proteção do último owner, MFA opcional e autoria empresarial anonimizada.
- `operational-lifecycle`: arquiva/restaura objetivos, ações, projetos, evidências, check-ins e documentos com validação server-side.
- `save-ai-settings`: salva chaves de IA, provider/modelo e configuracoes por funcao.
- `save-ai-control-policy`: salva limites e orçamento da IA; defaults permanecem em observacao sem bloqueio.
- `save-whatsapp-settings`: salva configuracao publica e segredos da Evolution API/Evo Go.
- `save-security-settings`: ativa/desativa a exigencia opcional de AAL2, sempre a partir de sessao AAL2.
- `oracle-chat`: chat web em episodios de 4 horas, historico por conversa, contexto do plano e inicio de sessoes.
- `oracle-session`: motor server-side de planejamento/importacao/fechamento com proposta e confirmacao.
- `month-turn`: virada mensal e convite de fechamento.
- `weekly-pulse`: convite semanal leve, configuravel e deduplicado para coordenadores com plano ativo.
- `suggest-kpi-spreadsheet`: interpreta tabela de planilha ou imagem com a funcao `background` e propõe lançamentos de KPI para confirmação por owner/admin.
- `suggest-objective-kpis`: sugere ate dois KPIs existentes para um objetivo e nunca grava sem confirmacao.
- `apply-kpi-import`: valida a proposta confirmada, grava valores por ano/mês e cria um documento histórico de KPIs sem guardar o arquivo ou imagem bruta.
- `organization-backup`: cria, baixa, remove e restaura snapshots completos por empresa, com cron protegido, checksum, Storage privado e réplica S3 opcional; executa exercícios internos/externos verificados e remove somente o clone de teste.
- `whatsapp-health`: diagnóstico owner-only da Evolution/webhook/filas, teste manual e retry controlado, sem expor segredo ou conteúdo.
- `suggest-historical-metadata`: sugere tipo, area, periodo e titulo para historicos importados usando a funcao de IA `background`, com fallback heuristico e confirmacao obrigatoria antes de gravar.
- `whatsapp-webhook`: entrada HTTP mínima do WhatsApp; autentica, bloqueia loop e encaminha texto obrigatoriamente para a fila. Mídia permanece síncrona/em memória para não persistir descritores criptográficos.
- `whatsapp-sender`: envia itens da outbox um por vez, confirma HTTP da Evolution e aplica lock, retry e dead-letter; endpoint nulo o mantem inerte.
- `whatsapp-worker`: processa a fila com ordem por conversa, heartbeat, retry/dead-letter e segredo server-side; endpoint automatico nulo mantem o worker inerte.
- `operational-health`: monitor owner/cron de frontend, migrations, WhatsApp, backups interno/externo, IA, retiradas em massa e exercícios de recuperação; alertas são informativos e service-only.

Compartilhados criticos:

- `_shared/auth.ts`: sessao, membership, owner e permissao por area.
- `_shared/administrative-audit.ts`: grava eventos administrativos idempotentes e sanitizados, sem segredos, contatos, prompts ou conteúdo.
- `_shared/conversation-policy.ts`: timeout de 4 horas entre episodios e deteccao de retomada explicita.
- `_shared/whatsapp-processor.ts`: núcleo único de autenticação/processamento usado pelo ingress e pelo worker; texto externo nunca usa fallback síncrono.
- `_shared/whatsapp-event.ts`, `_shared/whatsapp-media.ts`, `_shared/whatsapp-documents.ts` e `_shared/whatsapp-conversation.ts`: parsing/autenticação, mídia em memória, importação de documentos e respostas do processador público.
- `_shared/model.ts`: chamadas OpenAI, Anthropic, Moonshot/Kimi e xAI/Grok.
- `_shared/ai-router.ts`: resolve provider/modelo/chave por funcao (`planning`, `daily`, `background`).
- `_shared/conductors/persona.ts`: fonte unica de persona, tom e guias por contexto.
- `_shared/conductors/tone.ts`: carrega o ajuste de tom da empresa e monta a diretiva segura para os prompts.
- `_shared/session-engine.ts`: estado e ciclo de sessoes, com validacao adaptativa antes de persistir respostas da IA.
- `_shared/session-adaptive.ts`: contrato `vague|partial|ready`, fatos canonicos, anti-loop, reparo unico e fallback deterministico.
- `_shared/quarterly-guidance.ts`: contrato verificavel do plano trimestral, limite de prioridades, vinculo anual real ou excecao explicita e bloqueio de atividade tratada como resultado.
- `_shared/monthly-guidance.ts`: contrato verificavel do plano mensal, limite global de cinco acoes, datas no mes, vinculo trimestral real ou excecao explicita e decisoes de pendencia/capacidade.
- `_shared/session-runtime.ts`, `_shared/session-imports.ts` e `_shared/session-ready-plans.ts`: runtime comum, importações prontas e normalizadores/prompts puros do motor de sessões.
- `_shared/proposals.ts`: aplica propostas confirmadas com validacao server-side.
- `_shared/plan-context.ts`: contexto textual do plano e ate 5 historicos relevantes para IA.
- `_shared/untrusted-content.ts`: fronteira para documentos não confiáveis, limites de saída da IA e validação de referências importadas por empresa.
- `_shared/plan-documents.ts`: cria `plan_documents` deterministico.
- `_shared/plan-render.ts`: renderiza documentos para WhatsApp.
- `_shared/intent-router.ts`: classificacao operacional.
- `_shared/historical-classifier.ts`: classificacao orientativa de historicos importados.
- `_shared/area-matching.ts`: correspondencia conservadora entre nomes equivalentes de areas; aliases semanticos so vinculam quando existe um unico candidato seguro.
- `_shared/phone.ts`: normalizacao e equivalencia testavel de telefones/JIDs, incluindo celular brasileiro com ou sem nono digito.
- `_shared/quick-updates.ts`: atualizacoes pequenas por WhatsApp.
- `_shared/quick-update-policy.ts`: guardas deterministicas para confirmacoes curtas, evidencias concretas e alvo explicito nas atualizacoes rapidas.
- `_shared/whatsapp-queue.ts`: deduplicacao sem texto em claro e payload minimo da fila inbound.
- `_shared/evolution-media.ts`: ordem de rotas e corpos para download de midia, priorizando `/message/downloadmedia` da Evo Go.
- `_shared/whatsapp-outbox.ts`: despertar seguro do sender quando a outbox esta ativa.
- `_shared/whatsapp-sender.ts`: sanitizacao e classificacao de falhas de envio.
- `_shared/whatsapp-health.ts` e `_shared/whatsapp-health-events.ts`: normalização sanitizada da Evolution e telemetria técnica service-only.
- `_shared/whatsapp-worker.ts`: reconstrucao do evento minimo, sanitizacao de erro e classificacao de retry.
- `_shared/transcription.ts`: transcricao de audio.
- `_shared/usage.ts`: registro de tokens/custo.

### Variaveis de ambiente e secrets

Frontend/Netlify, publicas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase Edge Functions, server-side:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MONTH_TURN_SECRET`

Nao colocar no frontend, Git, docs ou migrations:

- `SUPABASE_SERVICE_ROLE_KEY`
- chaves OpenAI, Anthropic, Moonshot/Kimi, xAI/Grok;
- chave da Evolution API/Evo Go;
- segredo do webhook;
- tokens Netlify/GitHub;
- senhas, dumps e exports privados.

## 6. Integracoes externas

### Supabase

Uso: Auth, PostgreSQL, RLS, Realtime, Edge Functions e secrets server-side.

Configuracao:

- frontend: `src/lib/supabase.ts`;
- schema/RLS: `supabase/migrations/`;
- functions: `supabase/functions/`;
- docs: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/ACCESS.md`.

Projeto atual:

```text
bkswkfazkjilwfzwzthz
https://bkswkfazkjilwfzwzthz.supabase.co
```

### Netlify

Uso: deploy do frontend Vite.

Configuracao:

- `netlify.toml`;
- `public/_redirects`;
- variaveis publicas no painel Netlify.

Build:

```text
command: pnpm run build
publish: dist
NODE_VERSION: 22
```

Regra de custo e deploy:

- Deploy de frontend somente quando o runtime web mudou. Alteração apenas em docs, testes, scripts ou Edge Functions não recebe deploy Netlify.
- Agrupe correções relacionadas para não consumir um deploy por ajuste documental.
- Compra de créditos, upgrade, assinatura, recarga automática ou qualquer nova cobrança exige autorização explícita do owner imediatamente antes da confirmação.
- Uma autorização de consumo de API não autoriza compra ou contratação de serviço.

### GitHub

Repositorio:

```text
git@github.com:srpedroka/oraculo-v2-aize.git
```

O repositorio esta publico para leitura. Escrita depende de permissao GitHub/SSH.

### IA

Provedores suportados:

- OpenAI via Responses API;
- Anthropic via Messages API;
- Moonshot/Kimi via Chat Completions compativel;
- xAI/Grok via Chat Completions compativel.

Configuracao:

- UI: `src/pages/Settings.tsx`;
- catalogo UI: `src/lib/aiPricing.ts`;
- catalogo servidor: `supabase/functions/_shared/pricing.ts`;
- roteamento: `supabase/functions/_shared/ai-router.ts`;
- chamadas: `supabase/functions/_shared/model.ts`;
- secrets: `public.ai_model_keys`, gravados por `save-ai-settings`.

Funcoes de IA:

- `planning`: planejamento, importacao e fechamentos;
- `daily`: conversa do dia a dia no app e WhatsApp;
- `background`: classificacoes, resumos e tarefas auxiliares.

### WhatsApp / Evolution API / Evo Go

Uso: convites, conversa operacional, audio, documentos e atualizacoes rapidas via WhatsApp.

Configuracao:

- UI: Configuracoes > WhatsApp;
- function de salvar: `save-whatsapp-settings`;
- webhook: `whatsapp-webhook`;
- helper: `_shared/whatsapp.ts`;
- segredos: `public.whatsapp_instance_keys`.

O frontend nunca deve chamar a Evolution API diretamente com chave real.

## 7. Onde o projeto vive

- Repositorio Git: `git@github.com:srpedroka/oraculo-v2-aize.git`.
- Branch principal: `main`.
- App em producao: `https://oraculo-v2-aize.netlify.app`.
- Netlify site: `oraculo-v2-aize`.
- Supabase project ref: `bkswkfazkjilwfzwzthz`.
- VPS/Evolution: URL publica e instancia ficam salvas em Configuracoes > WhatsApp e documentadas em `docs/ACCESS.md` sem segredos.

## 8. Convencoes e decisoes de arquitetura

### Idioma e nomenclatura

- UI em portugues do Brasil.
- Codigo, tipos e variaveis em ingles.
- Use `Area` na interface e prompts. Evite reintroduzir nomenclatura antiga.
- Resultado = jogo atual; Evolucao = proximo jogo.

### Design

- Preservar cockpit executivo limpo: branco, cinzas, Inter, bordas discretas, status com cor contida.
- Evitar visual marketing/landing page. O app deve abrir direto na experiencia util.
- Componentes novos devem seguir padroes existentes antes de criar nova abstracao.
- A sidebar, painel do Oraculo e cards ja definem o tom visual.

### Dados e estado

- React Query para dados remotos.
- Context + reducer para UI local.
- Mutacoes comuns passam por `src/state/store.tsx`.
- Acoes sensiveis passam por Edge Functions.

Motivo: manter frontend simples, dados reativos e fronteira segura para operacoes privilegiadas.

### Banco e RLS

- Toda tabela publica com dados de empresa precisa de RLS.
- Alteracao de schema deve virar migration em `supabase/migrations/`.
- Ao criar tabela nova, atualizar `docs/ARCHITECTURE.md` e revisar `docs/SECURITY.md`.
- Owners administram empresa, membros, areas e configuracoes.
- Coordenadores escrevem apenas na propria area quando permitido.

Motivo: a anon key do Supabase e publica no navegador; isolamento real vem de Auth + RLS + validacao server-side.

### IA e seguranca

- Chaves de IA nunca ficam no cliente.
- O app envia chaves para `save-ai-settings`, que grava em `public.ai_model_keys`.
- `ai_provider_key_status` mostra apenas `has_key` e preview mascarado.
- Toda chamada de IA bem-sucedida deve registrar `ai_usage_logs`.
- Criar planos, objetivos e acoes exige proposta + confirmacao.
- O modelo nunca deve ser tratado como autoridade para gravar dados sem validacao.

Motivo: evitar vazamento de credenciais, controlar custo e impedir gravacao indevida por prompt injection ou interpretacao errada.

### Oraculo V3

- Conversas sao separadas por pessoa e canal em `conversations`; 4 horas de inatividade abrem novo episodio sem apagar memoria anterior.
- Sessoes estruturadas ficam em `planning_sessions`.
- Condutores ficam em `_shared/conductors/`.
- Persona, tom e guias por contexto ficam em `_shared/conductors/persona.ts`.
- Propostas confirmadas geram `plan_documents` deterministico.

Motivo: preservar memoria, reduzir contaminacao entre usuarios/canais e gerar documentos consistentes sem nova chamada de IA.

### WhatsApp

- Numero recebido precisa existir em `profiles.phone`.
- Mensagens sao salvas antes da IA para diagnostico.
- Audio e arquivos sao processados em memoria; bruto nao deve ser salvo.
- Atualizacoes rapidas podem gravar apenas pequenas operacoes conhecidas e com permissao.
- Criacao/importacao/fechamento segue proposta + confirmacao.
- Fora de escopo geral deve ser recusado com leveza e conduzido de volta a negocio, gestao, estrategia, planejamento, execucao ou funcionamento do Oraculo.

### Documentacao obrigatoria

Atualize docs quando:

- adicionar modulo importante;
- mudar comando de instalar, testar, buildar ou publicar;
- adicionar variavel de ambiente;
- alterar Supabase, RLS, Edge Functions ou autenticacao;
- mudar fluxo de permissao;
- corrigir problema que pode voltar;
- tomar decisao tecnica relevante.

Arquivos de referencia:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DATA_INVENTORY.md`
- `docs/ACCESS.md`
- `docs/RUNBOOK.md`
- `docs/DECISIONS.md`
- `docs/CHANGELOG.md`
- `AGENTS.md`

## 9. Regras de trabalho para agentes

Antes de mexer no codigo:

1. Leia `README.md`.
2. Leia `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_INVENTORY.md`, `docs/ACCESS.md`, `docs/RUNBOOK.md` e `docs/DECISIONS.md`.
3. Rode `git status`.
4. Se existir remoto configurado, rode `git pull` antes de alterar arquivos.
5. Verifique se a mudanca afeta ambiente, banco, deploy, autenticacao, seguranca ou fluxo de negocio. Se afetar, atualize docs no mesmo ciclo.

Antes de encerrar mudanca relevante:

```bash
pnpm run lint
pnpm run build
```

Politica de Git:

```bash
git status
git diff
git add .
git commit -m "mensagem curta e clara"
git push
```

Nao reverta mudancas de outro autor sem pedido explicito. Se encontrar worktree sujo, entenda antes de editar.

## 10. Estado atual

### Pronto

- V2 publicada em producao no Netlify.
- Publicacao sensivel protegida pelo workflow manual `Production release`: exige autorizacao explicita do owner na conversa antes do disparo, SHA da `main` com `CI required`, preflight sem segredo, Functions explicitas e guard de migrations destrutivas. O Environment `production` nao exige um segundo clique de reviewer; seus segredos continuam isolados e somente `main` pode usa-lo. Frontend comum continua no fluxo simples do Netlify.
- Supabase conectado com Auth, banco, RLS, realtime e Edge Functions.
- Login, onboarding, empresas, membros, areas e configuracoes.
- Arquivamento reversivel de areas e remocao segura de membros, com reatribuicao de coordenacao e bloqueio do ultimo owner.
- Arquivo operacional reversivel para objetivos, acoes, projetos, evidencias, check-ins e documentos, com auditoria antes/depois de planos e KPIs.
- Criacao e alternancia de empresas.
- Cadastro de celular no perfil e identificacao por WhatsApp.
- Convites por WhatsApp (cadastro silencioso opcional).
- Recuperacao de senha via Supabase Auth.
- Dashboard executivo.
- Revisao mensal com confianca, bloqueio e compromisso seguinte; pulso semanal leve opcional por WhatsApp.
- Vinculos confirmados entre objetivos e KPIs, sugeridos pela IA e exibidos no Dashboard.
- Backups por empresa com snapshot manual/automático, pacote portátil criptografado e restauração como clone.
- Recuperação de desastre owner-only com RPO/RTO visíveis, teste mensal interno, exercício trimestral forçado pelo R2, clone verificado e incidentes estruturados sem texto livre.
- Importacao de planilha ou imagem de KPIs (`.xlsx`, `.xls`, `.csv`, JPG, PNG e WEBP) com proposta da IA de bastidores, histórico/documento e confirmacao antes de gravar Meta/Atingido.
- Plano Estrategico com importacao de PDF/PPTX/DOCX/TXT e proposta estruturada.
- Planos Trimestrais com importacao por area e confirmacao.
- Areas com criacao manual e permissao por owner/coordenador.
- Execucao Viva com check-in/fechamento guiado.
- Objetivos editaveis manualmente.
- Oraculo web com historico por conversa.
- WhatsApp real via Evolution API/Evo Go.
- Painel owner-only de saúde do WhatsApp com conexão/webhook, telemetria sanitizada, teste manual e recuperação controlada de dead-letter.
- Audio no WhatsApp com download, descriptografia quando necessario e transcricao.
- Arquivos no WhatsApp com extração real de TXT/DOCX/PPTX/PDF, leitura do conteúdo, memória resumida segura e proposta pendente quando forem planos.
- Roteador de intencao, atualizacoes rapidas e limite de escopo no WhatsApp.
- Configuracao de IA por provedor e funcao (`planning`, `daily`, `background`).
- Tracking de tokens e custo estimado.
- Tom do Oraculo configuravel por empresa, com leitura para membros e edicao apenas pelo owner.
- Documentos canonicos em `plan_documents`, tela `/documentos`, impressao/PDF A4 e resumo por WhatsApp.
- Fase 7 da V3 concluida: removidos roteiros antigos, guia legado separado e function antiga de check-in mensal.

### Em andamento / atencao

- A Q0 R2 foi aprovada em 2026-07-16 após o owner exigir Plano Estratégico Anual primeiro e cobertura de todas as entregas. O padrão possui sete rubricas, dezesseis falhas críticas e matriz de 21 entregas em `tests/evals/strategic-quality/deliverable-coverage.json`. Regra financeira: sem teto isolado por caso, orçamento acumulado US$ 20, aviso US$ 15 e parada preventiva US$ 19; sempre reportar geração, judge, total e acumulado.
- A Q1 anual automatizada foi aprovada no staging em 2026-07-16: técnica verde, Condução 86,25, Plano Anual 92,50, média 89,38 e zero candidato crítico. A Revisão Estratégica foi alinhada ao modo adaptativo sem deixar de ser microajuste; teste real aprovou dois ajustes em lote, uma confirmação, banco/documento e cleanup. Acumulado do plano: US$ 0,437777. Produção concluída no merge `43b5935`, release protegido `29525599601` e Netlify `6a5928c0f349e3bcc2a4728a`; verificação e smoke autenticado verdes. A chave temporária deve permanecer privada para novos testes autorizados, sem revogação por enquanto. Consulte `docs/STRATEGIC_EVALUATION_LAB.md`.
- A Q2 foi implementada e aprovada pelo owner em 2026-07-16: 29 casos sinteticos em Q2A-Q2E cobrem 15 entregas e as 16 falhas criticas. `pnpm run test:strategic-cases` valida manifesto, casos, metodos, rubricas, canais, confirmacoes e sanitizacao. O gate esta `owner-approved`.
- A Q3 foi medida no staging em 2026-07-16 e a Q4A-Q4F foi concluida em 2026-07-17. O gate integrado passou 350 unitarios, 122 integracoes, 7 testes de seguranca, 11 E2E, fixtures, catalogo, paridade de saidas, lint/build/bundle e secret scan; cleanup independente ficou zerado. Q4F custou US$ 0 e o acumulado permanece US$ 2,890842. Producao permanece anterior; leia `docs/STRATEGIC_QUALITY_ACCEPTANCE_Q4.md`.
- A Q4G-Q4S e a Q5A foram aprovadas no staging. A Q4S normaliza acoes materialmente identicas dos objetivos trimestrais como transversais: confirmacao, banco e documentos contam cada uma uma vez, sem migration. O smoke de prioridade R2 passou com Conducao 92,50, Plano Trimestral 96,25 e media 94,38. Q4S custou US$ 0,040024; acumulado US$ 6,679758. A Q5B r8 mantem 11 aprovacoes e uma medicao de qualidade bloqueada; a retomada Q4S deve arquivar somente essa medicao e continuar incrementalmente. Producao permanece inalterada.

- Etapa 3 / Fatia 3E concluída e publicada em produção em 2026-07-13: texto usa obrigatoriamente fila + worker + outbox + sender; ausência da infraestrutura falha fechado antes de mutação. O piloto real aprovou texto, áudio, documento, envio, deduplicação 10x e ordem. Mídia continua síncrona/em memória e suas respostas textuais usam outbox.

- O produto esta pronto para operacao assistida, mas ainda precisa de teste operacional completo com dados reais controlados: criar plano mensal por sessao web, atualizar acoes pelo WhatsApp, pedir status, simular fechamento, exportar PDF e conferir custos.
- Etapa 4 / Fatias 4A–4E concluídas em 2026-07-13: suíte por risco cobre domínio/importação, idempotência, memória, RLS, papéis, segredos, arquivo/auditoria/backup e jornadas autenticadas desktop/mobile com dados descartáveis. O GitHub Actions usa Supabase local, logs sanitizados e o gate `CI required`; caminhos críticos têm logs estruturados, métricas/SLOs e Error Boundary global com código de ocorrência sanitizado.
- Etapa 5 / Fatias 5A–5F concluídas e publicadas em produção em 2026-07-14: store, processador do WhatsApp, motor de sessões e Configurações foram divididos por domínio/responsabilidade; históricos usam paginação cursor-based, mutações/Realtime invalidam somente consultas afetadas, rotas/importadores carregam sob demanda e edicoes de objetivo/KPI/configuracoes criticas recusam versoes antigas sem perder o rascunho.
- Etapa 6 / Fatia 6A concluída documentalmente em 2026-07-15: `docs/DATA_INVENTORY.md` classifica as tabelas públicas, 30 Edge Functions configuradas no projeto, arquivos transitórios, provedores externos, retenção, backup, exportação/exclusão e lacunas.
- Etapa 6 / Fatia 6B publicada em 2026-07-15: `/privacidade`, aba de Privacidade, aviso dispensável e ciência versionada por empresa. `data_notice_versions` é público e `organization_data_notice_acknowledgements` usa RLS membro-lê/owner-insere sem update/delete. Não bloqueia o app e não equivale a consentimento genérico.
- Etapa 6 / Fatia 6C publicada em 2026-07-15: cron diário remove apenas filas e telemetria vencidas; prévia e execução são service-only e cada execução guarda contagens sanitizadas. Planos, objetivos, documentos, conversas, usuários, backups manuais e auditorias críticas não entram na limpeza automática.
- Etapa 6 / Fatia 6D publicada em 2026-07-15: Minha conta consolida correção de perfil, exportação pessoal e exclusão segura. O banco bloqueia a remoção do último owner, limpa o telefone sem vínculos e preserva o histórico empresarial com autoria anonimizada.
- Etapa 6 / Fatia 6E publicada em 2026-07-15: Configurações ganhou Auditoria owner-only; alterações de pessoas, IA, WhatsApp, MFA, backup e retenção geram eventos automáticos, imutáveis, idempotentes e sanitizados. A trilha entra no backup e referências pessoais são anonimizadas na exclusão da conta.
- Etapa 6 / Fatia 6F publicada e comprovada em produção em 2026-07-15: RPO de 30 minutos parte da primeira alteração pendente; teste mensal usa Storage interno e o trimestral força R2; clones com checksum/contagens/segredos/WhatsApp verificados são navegáveis e removidos em um comando. O exercício externo real restaurou 636 registros em 1,7 s e validou Dashboard/KPIs, Plano Estratégico, Documentos e Arquivo antes da limpeza. Incidentes são owner-only e estruturados.
- Etapa 7 / 7A–7D concluída e tecnicamente aprovada em 2026-07-15; cleanup autorizado e concluído somente no staging em 2026-07-16. Baseline, cenário funcional, falhas, desktop/mobile, visual e smoke de produção passaram. A 7D corrigiu somente a responsividade do launcher mobile e das abas de Configurações; frontend Netlify `6a5840ed256e52e9b9a918d1`. A limpeza removeu empresas, usuários, backup interno e o estado 7A sensível, com verificação independente de zero resíduos. Produção, migrations, Functions e WhatsApp real não mudaram. A geração pelo modelo segue como limitação explícita porque o staging não tem chave descartável própria. Relatório em `docs/MASTER_TEST_REPORT.md`; evidências sanitizadas 7B/7C/7D e capturas privadas foram preservadas.
- Etapa S / S0–S4 concluídas e em produção em 2026-07-14. A S4 publicou a migration de segurança e as Functions `organization-lifecycle`, `organization-backup` e `operational-health`; a verificação read-only posterior confirmou o estado esperado.
- Plano Mensal por arquivo no app ainda depende de sessao mensal ativa; pelo WhatsApp ja existe importacao mensal estruturada com confirmacao.
- O deploy de Edge Functions depende de CLI/Supabase autenticado e deve seguir o runbook.
- Desligar fila/outbox não reativa o modo síncrono: produz `503`/retry. Rollback exige drenar itens e republicar a versão anterior antes de desligar flags/endpoints.
- Documentos, conversas e resumos podem conter dados privados da empresa; trate como sensiveis.

### Pendencias conhecidas / proximos passos

- Executar em ordem o plano integrado `plans/2026-07-16-qualidade-estrategica-operacional.md`: primeiro Mapa A de qualidade estratégica, depois Mapa B de qualidade operacional. A proxima fatia e a retomada incremental Q5B apos Q4S: `pnpm run eval:strategic:q5 -- resume-after-correction Q4S` preserva 21 aprovacoes totais e arquiva somente a medicao bloqueada; `pnpm run eval:strategic:q5 -- phase Q5B` repete prioridade R2 e continua com fail-fast. Corrigir novos problemas e repetir somente os cenarios afetados. Depois de Q5A-Q5D integralmente verdes, executar uma regressao geral limpa com todos os cenarios.
- Para uma futura prova com geração textual real, abrir um novo ciclo MASTER com chave própria e descartável apenas no staging; nunca reutilizar credencial de produção.
- Ampliar a suíte conforme regressões reais surgirem, mantendo a matriz de `docs/TESTING.md` atualizada.
- Antes de transformar o aviso operacional em política contratual definitiva, o responsável deve validar papéis de controlador/operador, razão social, contato institucional, bases legais e termos/retenção dos provedores listados em `docs/DATA_INVENTORY.md`.
- Manter catalogos de pricing de IA atualizados quando trocar/adicionar modelos.
- Revisar periodicamente RLS ao criar novas tabelas ou ampliar permissoes.

## 11. Seguranca: proibicoes absolutas

- Nunca commitar `.env`, `.env.*`, chaves, tokens, dumps, logs privados, zips de backup ou arquivos sensiveis.
- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nunca registrar valores reais de chaves em README, docs, comentarios, commits ou mensagens.
- Nunca salvar audio bruto, arquivo bruto recebido por WhatsApp, URL temporaria de midia, `mediaKey`, chave da Evolution ou chave de IA no banco.
- Nunca carregar `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` ou `SUPABASE_SERVICE_ROLE_KEY` de producao no ambiente padrao do agente. Verificacao e deploy de Functions usam somente os comandos allowlisted `production:*`, com autorizacao do Chaves; migration de producao segue o workflow protegido quando disponivel.
- Ao encontrar segredo exposto: pare, remova, avise o usuario e oriente rotacao da credencial.
