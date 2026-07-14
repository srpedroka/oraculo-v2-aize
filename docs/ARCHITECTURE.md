# Arquitetura

## Visao geral

O Oraculo V2 e um app web de execucao estrategica. O frontend roda em React/Vite e conversa diretamente com o Supabase para autenticacao, leitura e escrita de dados protegidos por RLS. A logica que exige privilegio maior, como salvar chaves de IA e acionar o modelo, fica em Supabase Edge Functions.

## Camadas

### Frontend

- `src/App.tsx`: define rotas e bloqueios de acesso. Sem sessao, mostra login. Com sessao sem empresa, mostra onboarding. Com empresa, mostra o app.
- `src/state/store.tsx`: fachada compatível de `AppProvider`/`useAppState`, responsável por compor os domínios e o estado final. O contrato público fica em `store-contract.ts`, UI local em `ui-state.ts`, cliente seguro em `store-client.ts`, consultas React Query agrupadas por domínio em `use-domain-queries.ts`, comandos em `use-store-commands.ts`/`use-store-dispatch.ts` e transformações em `src/state/domains/`. `query-invalidation.ts` centraliza as chaves e dependencias de cache: mutacoes e eventos Realtime invalidam somente os dominios afetados; apenas o refresh manual percorre o conjunto completo. Essa divisão preserva os consumidores atuais enquanto permite migrá-los gradualmente para hooks menores.
- `src/lib/supabase.ts`: cria o cliente Supabase com sessao persistente e realtime.
- `src/pages/`: telas de produto.
- `src/components/`: layout, sidebar, painel do Oraculo e componentes de UI.
- `src/features/objective/`: componentes de objetivo e builder.

As rotas de produto sao carregadas sob demanda com `React.lazy`/`Suspense`. O shell autenticado permanece visivel enquanto a nova tela chega, e dialogos pesados do Dashboard e da importacao de historico tambem sao chunks independentes. PDF, XLSX, DOCX e ZIP ficam fora do grafo inicial. O build gera `dist/.vite/manifest.json`, e `scripts/verify-bundle-budget.ts` falha se um parser pesado entrar no carregamento inicial ou se o JavaScript inicial ultrapassar 200 KB gzip.

Na tela `src/pages/Strategic.tsx`, o Plano Estrategico pode nascer de duas entradas: condução do zero pelo Oraculo ou importacao de plano pronto. A importacao aceita PDF, PPTX, DOCX e TXT no navegador, extrai texto com `src/lib/fileImport.ts` e permite dois caminhos independentes: "Só revisar texto", que roda uma revisão local sem gravar, e "Gerar proposta e carregar no módulo", que chama `oracle-session` com `action = import_ready_plan`. O arquivo bruto nao e enviado ao banco; o texto extraido/colado vira insumo para uma proposta estruturada e a gravacao continua dependendo de confirmacao. Quando a importacao nasce no app, o painel lateral mostra uma previa estruturada do que sera gravado, com objetivos, projetos, vinculos e lacunas, sem mandar a pessoa para WhatsApp. Owners com plano estrategico existente tambem podem iniciar a Revisao Estrategica sob demanda, que abre uma sessao `strategic_review` para microajustar objetivos estrategicos existentes, sempre com proposta e confirmacao. A importacao de **historico** nao mora mais nesta tela.

Na tela `src/pages/QuarterlyPlans.tsx`, cada departamento com permissao de escrita pode importar um plano trimestral pronto. A entrada usa o mesmo `src/lib/fileImport.ts`, aceita PDF, PPTX, DOCX e TXT, envia apenas o texto extraido para `oracle-session` com `action = import_ready_quarterly_plan` e exige confirmacao antes de gravar `area_plans` e objetivos trimestrais. O painel lateral mostra a previa de papel da area, diagnostico, objetivos anuais de apoio, objetivos do trimestre, entregas e lacunas. O chat lateral `src/components/OraclePanel.tsx` tambem aceita anexo de PDF/PPTX/DOCX/TXT e envia o texto extraido como mensagem para a conversa ou sessao ativa; ele nao salva o arquivo bruto.

Na tela `src/pages/Documents.tsx`, os documentos gravados em `plan_documents` aparecem com filtros server-side por tipo, area e periodo e paginacao cursor-based de 30 itens (`created_at` + `id`). A origem separa documentos de sessao (`session`) de historicos importados (`historical`). No desktop, lista e leitor ficam contidos na altura util e rolam de forma independente, evitando que um documento longo estique a pagina indefinidamente. O botao **Importar historico** (owner ou coordenador com area gravavel) abre `src/features/history/HistoricalImportDialog.tsx` em portal no `body`, sempre centralizado na viewport e sem herdar o `transform` da transicao de pagina. Arquivos de texto sao interpretados automaticamente depois da extracao. `_shared/historical-header.ts` le o cabecalho antes da IA e prioriza tipo, area, periodo, titulo, empresa citada, responsavel e versao explicitamente rotulados. `_shared/area-matching.ts` resolve nomes equivalentes comuns (`Industrial` -> `Producao`, por exemplo) quando existe um unico candidato seguro; empate continua exigindo escolha. A classificacao devolve `headerMetadata` e o contrato estruturado (`importSuggestion` com `candidates`, `tables`, `conflicts`, `warnings`). Conflitos obrigatorios exigem escolha humana; candidatos selecionados sao inseridos atomicamente. `save-historical-document` grava os campos confirmados em `content.source_metadata` e `content.import_backup` (schemaVersion 1, sem midia bruta), permitindo reabrir a importacao com os valores confirmados. O componente `src/components/PlanDocument.tsx` renderiza o mesmo conteudo para tela e para a rota limpa `src/pages/DocumentPrint.tsx` (`/documentos/:documentId/imprimir`), que busca o documento por empresa e ID, inclusive quando antigo ou arquivado, e usa CSS de impressao A4 sem sidebar nem painel lateral.

Na tela `src/pages/Dashboard.tsx`, o bloco "Resultado" combina objetivos ativos com o Dashboard dos 4 KPIs executivos: Faturamento, Margem operacional, Producao e Caixa. Valores exibidos usam `formatKpiCompact` / `formatKpiFull` em `src/lib/kpi.ts` (sufixos fixos `mil`/`mi`/`bi` em pt-BR; percentual sem abreviar; valor integral no `title`). As definicoes vivem em `executive_kpis`, os lancamentos mensais em `kpi_monthly_values`, e o frontend renderiza o ano corrente sem seletor de ano na primeira versao. O numero em evidencia e sempre o mes calendario anterior, tratado como ultimo mes fechado; se algum KPI ainda nao tiver realizado, o cabecalho e o card sinalizam que o fechamento esta pendente em vez de mostrar um mes antigo. O mes atual aparece somente como em andamento. Os minigraficos exibem Meta/Atingido com os meses no eixo horizontal. Owners e admins abrem `src/features/kpi/KpiEditorDialog.tsx` para editar a grade de 12 meses ou importar `.xlsx`, `.xls`, `.csv`, JPG, PNG e WEBP. `src/lib/kpiSpreadsheet.ts` extrai tabela de planilha ou prepara imagem reduzida em memoria; `suggest-kpi-spreadsheet` usa a funcao de IA `background` para propor somente os quatro KPIs e pode devolver varios anos. Depois da confirmacao, `apply-kpi-import` grava `kpi_monthly_values` e cria `plan_documents(type = kpi_history, origin = historical)`, exibido em Documentos. Arquivo e imagem brutos nao sao armazenados; a escrita final depende da validacao server-side de `owner`/`admin` e da RLS `is_admin`.

Objetivos podem ser ligados aos KPIs executivos por `objective_kpi_links`. Na criacao/edicao manual, `suggest-objective-kpis` usa a IA `background` para sugerir no maximo dois KPIs existentes e a pessoa confirma quais relacoes serao gravadas. Condutores e importadores tambem podem incluir `kpiLinks` na proposta visivel antes da confirmacao. Os cards de KPI mostram os objetivos ligados, e os vinculos entram no backup por empresa.

Na tela `src/pages/Settings.tsx`, o card "Tom do Oráculo" lê `org_ai_tone` para todos os membros da empresa e permite edição somente pelo owner. Presets preenchem os eixos gentil↔ácido/franco e direto↔motivador; o preset personalizado libera os sliders e uma preferência da casa de até 280 caracteres.

Na aba `WhatsApp`, owners também veem `WhatsAppHealthPanel`: conexão consultada na Evolution, correspondência da URL/evento do webhook, último evento recebido, último envio confirmado, itens pendentes, falhas recentes e alertas operacionais. `whatsapp-health` faz a leitura privilegiada e devolve apenas diagnóstico sanitizado; a URL esperada não contém segredo. Para Evolution Node, a Function consulta o estado e a configuração remota do webhook. Para Evo Go, usa `/instance/status`, normaliza `Connected`/`LoggedIn` e, como o servidor não oferece inspeção equivalente do webhook, confirma a entrega por tráfego autenticado recente. O teste envia uma única mensagem ao celular do owner. O reprocessamento de dead-letter só é liberado quando a fila correspondente, seu endpoint e a política de MFA permitem a ação; o painel nunca ativa filas ou endpoints automaticamente.

Atualizações rápidas passam por duas fronteiras. `_shared/quick-update-policy.ts` impede que confirmações curtas virem mutação, exige sinal concreto e valida a qualidade mínima de evidências. `_shared/quick-updates.ts` só grava diretamente quando operação e alvo aparecem explicitamente; alvo inferido vira `conversations.pending_context(type = quick_update_confirmation)` com validade de 30 minutos e é revalidado no `sim`. Uma nova mensagem não relacionada cancela a pendência. Essa política vale para o webhook síncrono e para o worker, que reutiliza o mesmo núcleo.

Documentos recebidos pelo WhatsApp são baixados e extraídos apenas em memória. TXT, DOCX e PPTX usam seus formatos estruturados; PDF usa `unpdf`/PDF.js no runtime Deno para interpretar a camada de texto real, inclusive streams comprimidos. O classificador de bastidores devolve tanto o destino operacional quanto uma leitura do conteúdo (`documentKind`, resumo, pontos principais e uso sugerido), priorizando o conteúdo sobre o nome. Materiais de apoio como roteiro, ata ou procedimento podem ficar em `unknown` sem serem tratados como "não lidos". Para continuidade da conversa, `chat_messages` recebe somente um resumo automático limitado e marcado como dado não confiável; nome, bytes e texto bruto permanecem fora do histórico.

Na aba `IA > Limites`, owners acompanham o custo do mês e configuram `ai_control_policies`. `evaluate_ai_call_controls` incrementa contadores atômicos antes de cada chamada ao provedor e grava `ai_limit_events` deduplicados. O default é `monitor`: limites excedidos não interrompem o app nem o WhatsApp. `call-for-function.ts` é a fronteira central; pesquisa web e transcrição, que usam clientes próprios, chamam o mesmo controle explicitamente. `ai_monthly_usage` agrega o custo exato com `security_invoker` e RLS das linhas de uso.

Na mesma tela, owners administram `Segurança e backups`. Cada empresa tem uma política em `organization_backup_policies`; snapshots concluídos são registrados em `organization_backups` e armazenados como JSON versionado e comprimido no bucket privado `organization-backups`. O pacote inclui dados do domínio, configurações não secretas, perfis públicos ligados à empresa, manifesto, contagem por tabela e SHA-256. Chaves, senhas, mídia bruta e metadados de backups anteriores ficam fora. O download portátil é criptografado no navegador com AES-256-GCM e senha que não sai do dispositivo. A restauração sempre cria uma nova empresa, remapeia IDs e usuários existentes por email, abandona sessões que estavam ativas e mantém a origem intacta. Se a conta não tiver mais nenhuma empresa, `Onboarding.tsx` oferece a importação do pacote; o servidor só libera essa rota sem `org_id` quando o usuário autenticado realmente não possui membership.

Em `Configurações > Segurança`, owners podem cadastrar TOTP pelo Supabase Auth sem tornar MFA obrigatória no login. A política `organization_security_settings.require_mfa_for_critical_actions` nasce desligada e só pode mudar por `save-security-settings` numa sessão `aal2`. Quando ligada, `_shared/auth.ts` exige `aal2` nas Edge Functions críticas e `critical_action_aal_ok(org_id)` fecha os caminhos equivalentes pela Data API/RLS. Planejamento, Dashboard, conversas e WhatsApp operacional não pedem código.

Depois que objetivos sao gravados, a operacao diaria nao depende apenas do Oraculo. `src/features/objective/ObjectiveEditDialog.tsx` permite editar tipo, resultado, indicador, meta, valor atual, tendencia, status, progresso, responsavel, prazo, evidencia e entregas. O mesmo editor aparece em Plano Estrategico, Dashboard e cards de planos por area. A tela de Areas tambem permite ao owner cadastrar areas e vincular coordenadores no proprio modulo, enquanto coordenadores e demais membros ficam em leitura quando nao tiverem permissao de escrita.

A rota `/arquivo` concentra o ciclo de vida reversível da operação. Objetivos podem ser arquivados com seus desdobramentos, ações e evidências ainda ativas; ações-chave, projetos prioritários, evidências, check-ins e documentos também podem ser retirados individualmente e restaurados. Registros arquivados saem das telas ativas, do WhatsApp e do contexto da IA. Atualizações em planos, objetivos, execução e KPIs geram snapshots antes/depois em `operational_revisions`, permitindo corrigir sem sobrescrever silenciosamente o histórico.

Edicoes de alto valor usam concorrencia otimista. Objetivos comparam o `updated_at` lido pela tela antes do update. O editor de KPI envia a versao da definicao e de cada mes para `save_kpi_editor_if_current`, que valida e grava definicao + meses em uma unica instrucao SQL. Tom, modelo por funcao de IA e WhatsApp seguem o mesmo contrato de versao. Realtime atualiza a versao observada; se existir rascunho local, a UI o preserva e mostra um conflito em vez de substituir campos silenciosamente.

### Supabase

Migrations principais:

- `20260629150100_initial_schema.sql`: tabelas do dominio.
- `20260629150200_auth_rls.sql`: triggers, funcoes auxiliares e politicas RLS.
- `20260629150300_v2_runtime_support.sql`: schema privado para chaves de IA, realtime e suporte de runtime.
- `20260630130000_whatsapp_integration.sql`: configuracao inicial de WhatsApp, segredo de webhook e canal em `chat_messages`.
- `20260702121500_service_role_secret_tables.sql`: tabelas de segredo acessiveis apenas por service role.
- `20260702152000_ai_pricing_usage.sql`: pricing por modelo/provedor e logs de consumo de IA.
- `20260702153000_ai_usage_realtime.sql`: realtime para logs de uso de IA.
- `20260702154500_update_openai_gpt54_pricing.sql`: pricing inicial do `gpt-5.4` salvo no ambiente.
- `20260704110000_v3_intelligence_foundation.sql`: fundacao da V3 com conversas por pessoa/canal, sessoes de planejamento, funcoes de IA por uso e documentos canonicos de plano.
- `20260704123000_v3_ai_function_router.sql`: libera xAI/Grok nos checks de provider e adiciona status publico, sem segredo, das chaves por provedor.
- `20260707170000_plan_documents_origin.sql`: adiciona `origin` em `plan_documents` para distinguir documentos de sessao e historicos importados.
- `20260708120000_strategic_review_type.sql`: adiciona o tipo `strategic_review` a `planning_sessions` e `plan_documents`.
- `20260708140000_ai_config_health.sql`: adiciona status da ultima validacao/uso em `ai_function_settings` e `ai_provider_key_status`.
- `20260709123000_executive_kpis.sql`: adiciona os 4 KPIs executivos do Dashboard, lancamentos mensais, papel `admin` e helper `is_admin`.
- `20260709150000_org_ai_tone.sql`: adiciona tom/persona por empresa, RLS membro-le/owner-escreve e realtime.
- `20260710234500_management_rhythm_kpi_links.sql`: amplia o fechamento mensal, configura pulso semanal no WhatsApp, cria contexto temporario de conversa e adiciona vinculos objetivo-KPI com RLS.
- `20260709180000_kpi_history_documents.sql`: adiciona `kpi_history` aos tipos de `plan_documents` e indice para documentos históricos de importação de KPIs.
- `20260710120000_organization_backups.sql`: adiciona políticas, snapshots, auditoria de restauração, bucket privado, fila de marcos e cron protegido para backups por empresa.
- `20260710133000_portable_restore_without_org.sql`: permite restaurar pacote portátil pelo onboarding quando a conta ficou sem empresa.
- `20260710170000_area_lifecycle_member_removal.sql`: adiciona arquivamento reversível de áreas, bloqueia delete direto de memberships, desvincula coordenador por `on delete set null` e cria a função transacional de remoção de membro.
- `20260710193000_operational_lifecycle.sql`: adiciona ciclo de vida reversível aos registros operacionais, histórico imutável de revisões e bloqueio de delete direto no navegador.
- `20260713090000_whatsapp_inbound_queue.sql` e `20260713093000_whatsapp_inbound_queue_flag_guard.sql`: fundação aditiva da fila de entrada do WhatsApp, deduplicação atômica, RLS service-only e feature flag por empresa protegida.
- `20260713120000_whatsapp_worker.sql`: RPCs de claim/heartbeat/retry/dead-letter/limpeza, segredo e endpoint server-only e cron inerte de recuperação do worker.
- `20260713160000_whatsapp_outbox.sql`: gravação atômica de resposta+outbox, ordem por destinatário/bloco, sender service-only, retry/dead-letter e cron inerte.
- `20260713200000_whatsapp_health.sql`: telemetria técnica service-only, gatilhos de falha/envio, retenção de 30 dias e RPC service-only para reabrir dead-letter sem ativar filas.
- `20260714190000_s4_operational_safety.sql`: classifica exercícios de recuperação, registra eventos sanitizados de schema destrutivo e mantém a telemetria de segurança exclusiva de `service_role`.
- `20260714223000_optimistic_concurrency.sql`: versao otimista de objetivos/KPIs e operacoes atomicas condicionais para KPI, modelo de IA e WhatsApp.

Tabelas publicas principais:

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
- `whatsapp_settings`
- `whatsapp_inbound_jobs`
- `whatsapp_worker_secrets`
- `whatsapp_outbox`
- `whatsapp_sender_secrets`
- `whatsapp_health_events`
- `conversations`
- `planning_sessions`
- `plan_documents`
- `executive_kpis`
- `kpi_monthly_values`
- `operational_revisions`
- `org_ai_tone`
- `organization_backup_policies`
- `organization_backups`
- `organization_security_settings`
- `ai_control_policies`
- `ai_call_counters`
- `ai_limit_events`
- `organization_restore_runs`

`profiles.email` guarda o email publico usado na administracao de convites. `profiles.phone` guarda o celular em formato internacional (`+5546999990000`). Ele e unico quando preenchido e sera usado como chave de identificacao para canais externos, como WhatsApp.

`areas.archived_at` separa estrutura ativa de histórico. Áreas arquivadas continuam no banco, em backups e na resolução de nomes de documentos, mas saem do Dashboard, planejamentos, seletores operacionais, virada mensal, WhatsApp e contexto ativo da IA. `areas.archived_by` registra quem executou a ação, e a restauração limpa os dois campos.

`objectives`, `key_actions`, `strategic_projects`, `evidences`, `check_ins` e `plan_documents` usam `archived_at`, `archived_by`, `archive_reason` e `archive_batch_id`. O lote permite que um objetivo arquive/restaure somente os descendentes que estavam ativos naquele momento, sem reativar itens retirados anteriormente por outra decisão. `operational_revisions` recebe snapshots antes/depois por trigger para mudanças nesses registros, nos planos e nos KPIs; membros leem a auditoria e somente triggers/service role gravam nela.

Tabelas de segredo com acesso apenas por service role:

- `public.ai_model_keys`: guarda chaves de provedores de IA. Tem RLS habilitado, acesso revogado para `anon` e `authenticated`, e grant para `service_role`.
- `public.whatsapp_instance_keys`: guarda chave da Evolution API e segredo do webhook. Tem o mesmo padrao de acesso exclusivo por `service_role`.

O schema `private` existiu como desenho inicial e pode aparecer em migrations antigas. O caminho operacional atual das Edge Functions usa as tabelas publicas bloqueadas por RLS/revokes.

Fundacao V3:

- `conversations`: separa o historico por pessoa e canal (`web` ou `whatsapp`) e guarda um resumo rolante para memoria futura.
- `planning_sessions`: guarda o estado das sessoes conduzidas pelo Oraculo, incluindo tipo, periodo, fase atual, dados coletados e proposta pendente de confirmacao.
- `ai_function_settings`: permite configurar modelos diferentes para planejamento, conversa do dia a dia e bastidores, sem duplicar chaves no frontend.
- `ai_provider_key_status`: guarda apenas `has_key` e `key_preview` por provedor para a tela de Configuracoes. A chave real continua em `public.ai_model_keys`, acessivel apenas por service role.
- `plan_documents`: guarda o conteudo dos documentos de plano e fechamento renderizados em tela, PDF A4 e WhatsApp. A coluna `origin` diferencia documentos canonicos gerados por sessoes (`session`) de documentos historicos importados como memoria de referencia (`historical`).

Essas tabelas foram criadas na Fase 0 da V3. A partir da Fase 3, `conversations` passa a ser usada em runtime por `oracle-chat`, `oracle-session` e `whatsapp-webhook`: cada pessoa tem uma conversa ativa por canal (`web` ou `whatsapp`), `chat_messages` recebe `user_id` e `conversation_id`, e conversas longas ganham resumo em `conversations.summary`. Depois de 4 horas sem mensagens, o episodio ativo e arquivado e outro e criado no mesmo canal; o resumo anterior pode seguir como memoria de fundo, sem retomar automaticamente perguntas ou formularios antigos.

Dashboard executivo:

- `executive_kpis`: uma definicao por empresa e KPI (`revenue`, `operating_margin`, `production`, `cash`), com unidade, direcao, tipo fluxo/estoque, ordem e escada opcional para caixa.
- `kpi_monthly_values`: valores mensais planejados e realizados por KPI, ano e mes. Faturamento e margem usam valor numerico; Producao aceita valor financeiro e quantidade secundaria; Caixa usa saldo realizado de fim de mes e pode registrar etapa-alvo da escada.
- `objective_kpi_links`: relacionamento confirmado entre objetivo e KPI executivo, com justificativa, confianca da sugestao e autoria.

As duas tabelas sao lidas por membros da empresa e escritas apenas por `owner` ou `admin`, via helper `is_admin(org_id)`. O papel `admin` foi adicionado para permitir manutencao operacional do Dashboard sem entregar permissoes de dono para configuracoes, membros ou areas.

### Edge Functions

- `invite-member`: cria ou registra membros (invite→magiclink). Convite de notificacao **somente por WhatsApp** (celular + instancia ativa); cadastro silencioso com `notify=false` nao envia mensagem. Nao usa email de convite.
- `set-member-role`: permite que owner altere membro entre `admin` e `coordinator`, ou rebaixe outro owner quando ainda existir pelo menos um owner restante. Nao promove novos owners.
- `set-member-area`: owner troca a area principal de um membro de forma atomica via RPC `set_member_primary_area` (limpa vinculos antigos e aplica o novo, ou remove todos).
- `remove-member`: valida owner, impede autoexclusão e remoção do último owner, aplica reatribuições de coordenação e remove somente a membership em uma transação PostgreSQL. Perfil, Auth e histórico da pessoa não são apagados.
- `operational-lifecycle`: valida sessão e permissão por empresa/área, chama a RPC transacional de arquivamento/restauração e impede que um coordenador restaure um lote iniciado por objetivo fora do seu escopo.
- `save-ai-settings`: salva chaves por provedor, configura as funcoes de IA (`planning`, `daily`, `background`), valida provider/modelo/chave contra o provedor no momento do salvamento/teste, preserva o modo legado de provider/modelo unico e grava a chave real em tabela acessivel apenas por service role.
- `save-whatsapp-settings`: salva configuracao publica do WhatsApp e segredos da Evolution API em tabela acessivel apenas por service role.
- `save-security-settings`: altera a política opcional de MFA depois de validar owner e sessão `aal2`.
- `save-ai-control-policy`: altera limites e modo de enforcement, com owner e MFA condicional.
- `suggest-kpi-spreadsheet`: valida sessao e papel `owner`/`admin`, carrega as definicoes dos quatro KPIs e usa a funcao de IA `background` para sugerir Meta/Atingido por indicador, mes e ano a partir de planilha, imagem **ou** corpus de `plan_documents` historicos (`fromHistory`). Com historico, filtra por padrao so as lacunas (meses sem Meta/Atingido). A funcao nao grava valores.
- `apply-kpi-import`: recebe somente a proposta confirmada, revalida os quatro KPIs/anos/meses no servidor, preserva campos antigos ausentes da proposta, grava `kpi_monthly_values` e cria um `plan_documents.kpi_history` para auditoria em Documentos.
- `suggest-historical-metadata`: valida sessao/permissao, restringe areas candidatas e combina extracao deterministica do cabecalho com a funcao de IA `background`. Fatos explicitos vencem inferencias, divergencias viram conflitos e o fallback sem IA ainda devolve `headerMetadata`. Aceita texto ou imagem; o binario nao e persistido.
- `save-historical-document`: valida sessao, permissao de empresa/area, tipo, periodo e tamanho antes de gravar. Persiste `classification`, `source_metadata` e backup recuperavel; quando recebe varios candidatos, valida todos e faz uma unica insercao em lote.
- `organization-backup`: owner cria, lista, baixa, remove e restaura snapshots por empresa; o cron usa segredo próprio gerado no banco. O arquivo interno fica em Storage privado e pode ser replicado para S3 compatível quando os secrets opcionais estiverem configurados.
- `oracle-chat`: usa a conversa web da pessoa, grava pergunta e resposta com `user_id`/`conversation_id`, monta contexto legivel do plano e responde com fallback deterministico ou modelo configurado. Tambem classifica a intencao da mensagem para iniciar planejamento anual/trimestral/mensal ou fechamento mensal/trimestral pelo app.
- `oracle-session`: motor de condução da Fase 2 da V3. Inicia sessoes estruturadas, processa mensagens com a funcao de IA `planning`, importa plano estrategico pronto via `import_ready_plan`, importa plano trimestral pronto via `import_ready_quarterly_plan`, conduz a Revisao Estrategica `strategic_review`, persiste fase/estado/proposta pendente e grava planos, revisoes ou fechamentos apenas depois de confirmacao.
- `month-turn`: funcao de virada de mes. Verifica areas com plano mensal encerrado sem check-in e envia convite por WhatsApp para owner/coordenador quando a integracao estiver ativa.
- `weekly-pulse`: cron horario protegido que respeita dia/horario configurados por empresa, convida uma vez por semana coordenadores com plano ativo e guarda contexto temporario para interpretar a resposta sem insistencia.
- `suggest-objective-kpis`: valida usuario e permissao do objetivo, usa a funcao `background` e devolve no maximo dois KPIs existentes; nao grava vinculos.
- `company-research`: owner-only; monta termos a partir de nome/subtítulo (split em `/`), usa busca web nativa de Anthropic ou OpenAI via `callModelWithWebSearch` e devolve apenas uma sugestão (`summary`, `sources`, `queries`, `links`). Nunca grava no banco; a confirmação grava `plan_documents` com `type = company_profile` pelo cliente (RLS owner).
- `whatsapp-webhook`: recebe mensagem da Evolution API, valida segredo, identifica usuario por `profiles.phone`, usa a conversa WhatsApp da pessoa e grava historico com `user_id`/`conversation_id`. Para áudio, baixa a mídia da Evolution/Evo Go pela rota atual `/message/downloadmedia`, descriptografa mídia de WhatsApp quando vier criptografada, transcreve com OpenAI e envia o texto transcrito para o mesmo fluxo de IA. Para documentos PDF/PPTX/DOCX/TXT, baixa e descriptografa quando necessario, extrai texto e classifica por IA. Documentos classificados como Plano Estrategico, Trimestral ou Mensal usam importadores server-side e geram proposta pendente; evidencias e documentos indefinidos recebem pergunta de direcionamento. Na Fase 4 da V3, o webhook ganhou roteamento operacional: classifica intencao, inicia planejamento por WhatsApp quando a pessoa pedir, aplica atualizacoes rapidas em objetivos/acoes mensais quando houver alvo claro, formata respostas para WhatsApp e limita respostas longas a blocos curtos. Na Fase 6, perguntas de documento (`document_question`) buscam o `plan_documents` mais recente por tipo/periodo/area e enviam resumo nativo pelo WhatsApp. A Fatia 3A adiciona um desvio opcional para `whatsapp_inbound_jobs`: autenticação, anti-loop e validação básica acontecem antes da fila; texto usa o caminho durável quando a flag está ligada, enquanto áudio/documento permanecem síncronos para não persistir o descritor criptográfico da mídia.
- `whatsapp-worker`: endpoint protegido por segredo server-side que adquire jobs prontos com lock transacional, executa o núcleo importável de `whatsapp-webhook`, renova lock, conclui ou agenda retry/dead-letter e limpa retenção vencida. O request pode ser despertado pelo webhook ou pelo cron; endpoint nulo mantém ambos inertes.
- `operational-health`: monitor protegido por segredo de cron ou autorização de owner. Consolida SLOs de frontend, banco, WhatsApp, backup interno/externo, IA e recuperação em snapshots service-only; também sinaliza retirada incomum em massa, migrations destrutivas auditadas e exercícios mensal/trimestral vencidos, sem conteúdo de negócio.
- `AppErrorBoundary`: envolve providers e rotas na raiz React. Em falha de renderização troca a árvore por uma tela recuperável e correlaciona o código de ocorrência via `operational-health`; o envio de telemetria é secundário e nunca impede a recuperação local.
- `whatsapp-sender`: endpoint protegido por segredo server-side que envia exatamente um bloco da outbox por POST, registra o ID/status sanitizado devolvido pela Evolution após HTTP 2xx e usa lock, heartbeat, retry e dead-letter. Endpoint nulo mantém wake e cron inertes.
- `whatsapp-health`: endpoint owner-only com JWT que consulta estado/conexão/webhook na Evolution, agrega telemetria técnica e filas e permite teste ou retry controlado. Teste e retry respeitam MFA opcional; nenhum segredo, telefone, conteúdo ou resposta bruta do provedor volta ao navegador.

Funcoes compartilhadas:

- `_shared/auth.ts`: valida sessao, acesso a empresa, owner e escrita por area.
- `_shared/cors.ts`: respostas CORS e JSON.
- `_shared/model.ts`: chamada aos provedores de IA.
- `_shared/model-probe.ts`: chamada minima de validacao de provider/modelo/chave, com classificacao segura de erros.
- `_shared/call-for-function.ts`: wrapper de chamada de IA que atualiza o status de runtime por funcao antes de devolver sucesso ou fallback.
- `_shared/pricing.ts`: resolucao de pricing conhecido/automatico no servidor.
- `_shared/transcription.ts`: normalizacao de arquivo de áudio e chamada da API de transcrição da OpenAI, com fallback de modelo.
- `_shared/usage.ts`: calculo e gravacao de consumo de IA.
- `_shared/whatsapp.ts`: normaliza numero e envia texto pela Evolution API/Evo Go.
- `_shared/whatsapp-queue.ts`: gera fallback de deduplicação sem texto em claro e reduz cada evento ao payload mínimo permitido para a fila.
- `_shared/whatsapp-worker.ts`: reconstrói o evento mínimo, sanitiza diagnóstico e classifica falhas transitórias/permanentes.
- `_shared/whatsapp-outbox.ts`: desperta o sender somente quando o endpoint salvo coincide com a Function esperada do projeto.
- `_shared/whatsapp-sender.ts`: sanitiza erros e separa falhas transitórias de permanentes sem persistir resposta bruta da Evolution.
- `_shared/whatsapp-health.ts` e `_shared/whatsapp-health-events.ts`: normalizam o diagnóstico da Evolution, recusam destinos locais óbvios, sanitizam erros e registram somente metadados técnicos.
- `_shared/conductors/persona.ts`: persona, tom de conversa e guias por contexto usados pelos condutores e pelo chat web.
- `_shared/conductors/tone.ts`: carrega `org_ai_tone`, usa o padrão equilibrado quando não há registro e gera uma diretiva de forma que não sobrepõe regras de segurança.
- `_shared/intent-router.ts`: classifica mensagens em `smalltalk`, `status`, `quick_update`, `start_planning`, `close_period`, `document_question` ou `other`, usando a funcao de IA `background` com fallback deterministico.
- `_shared/historical-classifier.ts`: sugere metadados para historicos importados (texto ou imagem), usando IA `background` quando configurada e fallback heuristico com periodo vazio se nao houver data clara.
- `_shared/kpi-spreadsheet.ts`: sanitiza a proposta de importacao de KPI, aceita somente os quatro indicadores e meses 1-12, e nunca transforma inferencia ausente em valor gravado.
- `_shared/periods.ts`: normaliza texto e resolve ano, trimestre e mes vigentes ou citados na mensagem.
- `_shared/quick-updates.ts`: identifica atualizacoes curtas do WhatsApp, escolhe objetivo/acao mensal, pede esclarecimento em caso de ambiguidade, valida permissao e grava status, progresso ou evidencia.
- `_shared/conversation-policy.ts`: centraliza o timeout de 4 horas entre episodios e reconhece pedidos explicitos de retomada de planejamento.
- `_shared/conversations.ts`: cria/retoma conversa por pessoa e canal, arquiva episodios ociosos, grava mensagens com dono, carrega historico do episodio e resume historico longo com a funcao `background`.
- `_shared/plan-context.ts`: monta contexto textual do plano, com empresa, objetivos estrategicos, area em foco, plano anual, trimestre/mes em foco, IDs de objetivos/acoes, acoes-chave, evidencias, pendencias e ate 5 historicos relevantes em qualquer foco de planejamento. Quando existe `plan_documents.type = company_profile` confirmado, injeta o bloco permanente "PERFIL DA EMPRESA" (resumo truncado a ~1200 caracteres) logo após EMPRESA/TEMA, em todos os focos; sem perfil o bloco some sem erro.
- `_shared/session-engine.ts`: fachada/orquestrador das sessoes de planejamento e confirmação; criação comum fica em `session-runtime.ts`, importações prontas em `session-imports.ts` e normalizadores/prompts puros em `session-ready-plans.ts`.
- `_shared/untrusted-content.ts`: delimita documentos como dados não confiáveis, neutraliza marcadores falsos, limita a saída estruturada da IA e valida referências trimestrais contra a empresa.
- `_shared/proposals.ts`: aplica propostas confirmadas no banco com validacao server-side de permissao.
- `_shared/plan-documents.ts`: transforma propostas confirmadas em `plan_documents` deterministico, incrementando versao por empresa/area/tipo/periodo.
- `_shared/plan-render.ts`: formata o `content` canonico para WhatsApp, com blocos divididos por `---`.
- `_shared/conductors/`: persona e condutores de Planejamento Estrategico, Plano Trimestral da Area, Plano Mensal, Revisao Estrategica e fechamentos.

Arquivos `.md` de roteiro continuam no repositorio como referencia, mas Edge Functions publicadas nao dependem de leitura desses arquivos em runtime.

### IA

O owner configura chaves por provedor e modelos por funcao em Configuracoes. O frontend chama `save-ai-settings`; a funcao valida owner, salva a chave real em `public.ai_model_keys` e grava em tabelas publicas apenas status, preview, provider/modelo e pricing.

O Oraculo usa:

- OpenAI via Responses API;
- Moonshot/Kimi via Chat Completions compativel;
- Anthropic via Messages API;
- xAI/Grok via Chat Completions compativel em `https://api.x.ai/v1`.

Funcoes de IA:

- `planning`: planejamento e fechamentos, com teto maior de resposta.
- `daily`: conversa do dia a dia no painel e WhatsApp.
- `background`: classificacao de documentos, resumos e tarefas auxiliares.

O helper `_shared/ai-router.ts` resolve provider/modelo/chave por funcao. Se uma funcao ainda nao tiver configuracao especifica, ele cai no legado `ai_settings`, preservando o comportamento anterior. Na Fase 1, `oracle-chat` e `whatsapp-webhook` usam `daily`; classificacao de documentos usa `background`. A transcricao de audio continua exigindo uma chave OpenAI cadastrada.

Desde 2026-07-08, salvar ou testar uma chave/modelo chama `_shared/model-probe.ts` no servidor e grava `last_status`, `last_status_detail` e `last_checked_at` em `ai_function_settings` e `ai_provider_key_status`. Em runtime, `_shared/call-for-function.ts` marca sucesso ou erro real por funcao (`planning`, `daily`, `background`), sem expor chave e sem remover os fallbacks determinísticos dos canais.

Desde 2026-07-09, `org_ai_tone` permite calibrar a forma das respostas por empresa. `oracle-chat`, `whatsapp-webhook` e `_shared/session-engine.ts` carregam o ajuste uma vez por request e inserem a diretiva junto da persona/regras de sessão. Sem registro, o helper devolve o preset equilibrado e a diretiva vazia, preservando os prompts anteriores. O tom altera apenas a forma; contratos JSON, uma pergunta por vez, proibição de inventar números e confirmação de gravação continuam prioritários.

Na Fase 2, `oracle-session` usa `planning` para conduzir sessoes. O modelo responde em envelope JSON com `reply`, `state_patch`, `next_phase`, `proposal` e `done`. O sistema persiste `state`, `phase` e `pending_proposal` em `planning_sessions`.

Na Fase 3, as chamadas de conversa deixam de usar historico geral da empresa. `oracle-chat` e `whatsapp-webhook` carregam apenas a conversa ativa daquele usuario e canal. Quando existem mais de 40 mensagens novas desde o ultimo resumo, `_shared/conversations.ts` usa a funcao `background` para gerar um resumo curto em `conversations.summary`; depois disso, o modelo recebe o resumo e as ultimas mensagens, reduzindo custo e evitando perda de contexto. Desde 2026-07-11, 4 horas de inatividade encerram o episodio: a conversa anterior fica arquivada, uma nova fica ativa e recebe uma ponte compacta com o resumo existente e as ultimas 8 falas como memoria de referencia. Uma sessao estruturada antiga so e religada ao episodio atual por confirmacao pendente ou pedido explicito de retomada.

O contexto do plano tambem deixa de ser JSON cru. `_shared/plan-context.ts` devolve texto estruturado para a IA, incluindo objetivos, progresso, donos, prazos, entregas e acoes-chave. Isso permite que perguntas como "como está o mês da minha área?" enxerguem tambem as ações-chave, não só os objetivos.

Arquivos importados e trechos da Memória Estratégica ficam em blocos explícitos de conteúdo não confiável. O texto bruto é enviado somente para a chamada que precisa extrair dados e não é copiado ao histórico da conversa. O classificador de documentos do WhatsApp recebe nomes, níveis e períodos, sem IDs ou registros completos. Depois da IA, o servidor limita estrutura e texto, exige o tipo de proposta esperado e revalida IDs na organização antes de qualquer confirmação ou gravação.

Na Memoria Estrategica, o mesmo helper inclui a secao "MEMÓRIA ESTRATÉGICA (planos passados — referência)" nos focos estrategico, trimestral, mensal e de area. A selecao considera ate 40 documentos quando existe area em foco e 60 no contexto geral, ordena por relevancia/recencia e envia no maximo 5 textos de cerca de 1.600 caracteres. Historicos da area em foco e do tipo compativel com o planejamento recebem prioridade. O modelo usa decisoes, metas e tentativas anteriores antes de propor o novo plano e trata recorrencia como pergunta construtiva, nao como prova de resultado. Nao ha migration nem chamada de IA extra.

O Perfil da empresa e independente da memoria estrategica: a pesquisa web passa por `company-research` (so sugere), o dono confirma no app e o resumo vigente e injetado em todas as conversas via o bloco "PERFIL DA EMPRESA". `company_profile` nao entra no filtro de memoria historica, que considera documentos `strategic`, `quarterly` e `monthly` com `origin = historical`.

Modo misto de gravacao:

- criar plano, objetivo e acao exige `proposal` + confirmacao;
- ao confirmar, `proposals.ts` valida permissao de owner/coordenador, grava em `strategic_plans`, `area_plans`, `objectives`, `key_actions`, `strategic_projects`, `check_ins` quando aplicavel, e gera um `plan_documents` canonico a partir da mesma proposta;
- a resposta final so diz que salvou depois da gravacao retornar sem erro.

A Revisao Estrategica sob demanda usa o mesmo motor de sessao com `type = strategic_review`, mas tem fronteira mais estreita: apenas owner pode iniciar/gravar a revisao da empresa, sem `area_id`; a proposta `apply_strategic_review` so aceita ajustes em objetivos estrategicos existentes da organizacao, nos campos `metric`, `target`, `current`, `deadline` e `status`, com justificativa obrigatoria por ajuste. Ao confirmar, o servidor captura snapshot de antes/depois, atualiza os objetivos permitidos e grava um `plan_documents` do tipo `strategic_review`.

Plano pronto importado pela tela ou por documento no WhatsApp segue a mesma regra. O texto extraido/colado entra em `prepareReadyStrategicPlanProposal`, `prepareReadyQuarterlyPlanProposal` ou `prepareReadyMonthlyPlanProposal`, obrigando o modelo a devolver uma proposal estruturada. Sem clique em "Confirmar e gravar" no app, ou resposta "confirmar" no WhatsApp, nada e persistido como plano estruturado. Os canais permanecem independentes: no app a confirmacao acontece no cartao visual de aprovacao; no WhatsApp a previa vem em texto e a confirmacao acontece por mensagem.

Plano trimestral pronto importado pela tela de Planos Trimestrais segue a mesma fronteira de seguranca. O usuario escolhe o departamento antes de anexar o arquivo; o texto extraido entra em `prepareReadyQuarterlyPlanProposal`, que exige `proposal.type = save_quarterly_plan`; a gravacao em `area_plans` e `objectives` so acontece depois de "Confirmar e gravar" no painel lateral.

Cada chamada bem-sucedida grava `ai_usage_logs`, com tokens, custo estimado, canal e metadata. A tela de Configuracoes agrega esses logs para acompanhamento de gasto.

Na Fase 4, a funcao `background` tambem virou o classificador operacional do Oraculo. Ela decide a rota da mensagem antes da resposta diaria:

- `start_planning`: cria ou retoma uma `planning_session` para plano estrategico, trimestral ou mensal, no canal em que a pessoa esta falando;
- `quick_update`: usa `_shared/quick-updates.ts` para gravar pequenas atualizacoes de execucao mensal, como conclusao de acao, percentual de objetivo ou evidencia curta;
- `close_period`: inicia `month_close` ou `quarter_close` quando existe area em foco; sem area, pergunta qual departamento fechar;
- `document_question`: busca o documento canonico mais recente pelo tipo, periodo e departamento inferidos, renderiza com `_shared/plan-render.ts` e envia no WhatsApp.

Essa camada nao substitui proposta e confirmacao para criar planos. Ela so permite gravacao direta para atualizacoes operacionais pequenas, depois de identificar alvo, tipo de alteracao e permissao do usuario.

Na Fase 5, `oracle-session` tambem conduz fechamentos. `month_close` revisa objetivos mensais, acoes, evidencias, aprendizados e pendencias e, antes do resumo, coleta confianca no trimestre, trava que exige ajuda/decisao e compromisso principal do proximo mes. A proposta confirmada atualiza objetivos/acoes, registra evidencias, cria `check_ins.details` e rola pendencias. `quarter_close` aplica a mesma logica aos objetivos trimestrais e pode atualizar o foco de aprendizado do proximo trimestre. Depois de gravar, a sessao permanece na ponte para oferecer abrir o proximo ciclo.

Na Fase 6, toda proposta confirmada (`save_strategic_plan`, `save_quarterly_plan`, `save_monthly_plan`, `month_close`, `quarter_close`) tambem gera um documento canonico em `plan_documents`. O documento nao depende de nova chamada de IA: e montado de forma deterministica por `_shared/plan-documents.ts` a partir da proposta aprovada e de dados basicos de empresa/area. A tela `/documentos` renderiza esse conteudo, a rota `/documentos/:documentId/imprimir` exporta por impressao/PDF A4, e o WhatsApp usa `_shared/plan-render.ts` para enviar resumo nativo.

### WhatsApp

O WhatsApp real passa por Evolution API/Evo Go hospedada fora do app. O fluxo e:

Desde a Fatia 3E, a entrada durável é obrigatória para texto quando a integração está ativa. `whatsapp-webhook/index.ts` contém somente o `serve`; autenticação, anti-loop, deduplicação, enfileiramento e processamento vivem no núcleo compartilhado `_shared/whatsapp-processor.ts`. O webhook real nunca processa texto sincronamente: exige `inbound_queue_enabled` e `outbound_outbox_enabled`, enfileira e responde rápido; se a infraestrutura estiver incompleta, devolve `503` para permitir reentrega do provedor. O worker usa o mesmo núcleo em modo interno e valida fila/outbox antes de qualquer mutação. Claim usa `FOR UPDATE SKIP LOCKED`, uma conversa não processa dois jobs ao mesmo tempo, locks abandonados voltam para retry e a quinta falha vira `dead`.

Na Fatia 5B, `_shared/whatsapp-processor.ts` permaneceu como a única fachada pública, mas delega parsing/autenticação de evento a `whatsapp-event.ts`, download e extração em memória a `whatsapp-media.ts`, classificação/importação a `whatsapp-documents.ts`, respostas e anexos a `whatsapp-conversation.ts` e despertar assíncrono a `whatsapp-worker-wake.ts`. `whatsapp-text.ts` concentra normalizações compartilhadas. A divisão não cria um segundo fluxo de processamento.

Áudio e documento continuam fora da fila porque o download da Evo Go exige a mensagem original e a política de segurança proíbe persistir `mediaKey`, URL temporária ou arquivo bruto. Eles usam o núcleo compartilhado de forma síncrona e em memória, mas suas respostas textuais entram na outbox. O envio de PDF também permanece direto como mídia. Respostas textuais normais nunca usam Evolution diretamente; recusas anteriores à identificação da conversa e falhas operacionais que precisam alcançar o remetente são exceções explícitas com `forceDirect`.

1. Usuario envia mensagem para o numero pareado.
2. Evolution chama `whatsapp-webhook` com segredo.
3. O webhook identifica a empresa e o perfil pelo celular cadastrado.
4. O webhook cria ou retoma a conversa `whatsapp` daquela pessoa.
5. A mensagem do usuario e salva em `chat_messages` com `user_id` e `conversation_id`.
6. O roteador classifica a intencao. Se for planejamento, inicia uma sessao; se for atualizacao rapida, valida alvo/permissao e grava; se for conversa/status, segue para a IA diaria.
7. O Oraculo responde por IA real ou fallback seguro, usando apenas o historico daquela conversa.
8. A resposta e salva, formatada para WhatsApp e enviada de volta pela Evolution. Respostas longas podem ser divididas em ate tres mensagens separadas por pausa curta.

Pedidos explícitos de novo planejamento são resolvidos antes da conversa diária. A sessão é identificada por empresa, pessoa, tipo, período e área; mensal/trimestral/fechamento nunca iniciam sem área. O roteador aplica uma guarda determinística depois da classificação da IA: verbos como "planejar" dentro do título de uma ação não iniciam uma sessão; a pessoa precisa pedir explicitamente para começar, abrir, criar ou retomar um plano. Ao trocar de plano, uma sessão sem proposta pendente é marcada como abandonada e a nova sessão é criada no mesmo fluxo. Uma proposta pronta precisa ser confirmada ou descartada antes da troca. Fora de uma `planning_session`, a função `daily` não conduz fases nem reaproveita perguntas antigas como se houvesse sessão ativa.

Na síntese de uma sessão, o condutor apresenta o resumo e a proposta na mesma resposta e pede uma única confirmação server-side. Frases intermediárias como "pode gerar" ou "está bom" não criam uma segunda revisão; depois que `pending_proposal` existe, a próxima confirmação válida grava de forma idempotente.

Documentos canônicos são recuperados somente por correspondência exata de tipo, área e período, usando primeiro a sessão mais recente da conversa. Não existe fallback para qualquer área ou período. Quando a pessoa pede o arquivo ou confirma um plano pelo WhatsApp, `_shared/plan-pdf.ts` gera em memória um PDF executivo A4 com metadados, contexto, objetivos, ações, evidências e paginação, e `_shared/whatsapp.ts` envia pela rota de mídia da Evolution; bytes/base64 não são gravados no banco.

O WhatsApp tem limite de escopo de produto. Antes de chamar sessoes ou IA diaria, o webhook detecta curiosidades gerais claramente fora do Oraculo, como esporte, guerra, politica ampla, entretenimento ou noticias sem relacao com a empresa. Nesses casos, salva a mensagem, usa a funcao `daily` para gerar uma resposta contextual que reconhece o assunto sem responder o conteudo factual externo, aplica um guia de leveza por categoria de assunto e conduz a pessoa de volta ao planejamento. O guia envia apenas os temas detectados na mensagem atual, para evitar respostas artificiais que misturem exemplos como Copa, guerra e fofoca quando a pessoa citou so um assunto. Em temas sensiveis, como guerra, a resposta nao faz piada sobre sofrimento e usa apenas uma leveza discreta sobre o Oraculo nao ser o canal certo. Se a IA estiver indisponivel, usa fallback variado por tema. Se o tema externo estiver conectado ao negocio, por exemplo risco de mercado, custo, fornecedor ou estrategia da empresa, a conversa continua normalmente.

Esse desenho foi ajustado em 2026-07-02 para salvar a mensagem antes da IA, permitindo diagnosticar casos em que a chamada ao modelo ou o envio falham.

## Fluxo de dados

1. Usuario autentica pelo Supabase Auth.
2. Frontend carrega empresas e memberships do usuario.
3. Ao existir empresa ativa, o app carrega areas, planos, objetivos, acoes, evidencias, mensagens e check-ins.
4. Mutacoes comuns escrevem em tabelas publicas com RLS.
5. Acoes sensiveis chamam Edge Functions com o token da sessao.
6. Edge Functions validam usuario e permissao antes de usar service role.

## Autenticacao e permissoes

Papeis:

- `owner`: administra empresa, membros, areas, planos e configuracoes.
- `admin`: administra lancamentos e definicoes dos KPIs executivos do Dashboard, sem herdar permissoes gerais de owner.
- `coordinator`: escreve apenas no escopo da propria area quando a politica permitir.

As politicas RLS seguem a regra:

- membros da empresa podem ler dados da empresa;
- owners podem escrever em dados administrativos;
- admins podem escrever nos KPIs executivos;
- apenas owners podem alterar o tom/persona da empresa; todos os membros podem ler;
- coordenadores podem escrever em dados da propria area;
- chaves de IA ficam fora do schema publico.

## Deploy

Frontend:

- Netlify
- `netlify.toml`
- `public/_redirects`
- build `pnpm run build`
- publish `dist`

Backend e dados:

- Supabase hospedado.
- Edge Functions publicadas no Supabase.
- Secrets das funcoes configurados no painel ou CLI do Supabase.

## Pontos criticos

- No Dashboard, cards de KPI usam ate 2 casas decimais; tooltips das colunas preservam escala/unidade e usam ate 4 casas para conferência.
- RLS deve ser revisada sempre que uma tabela nova for criada.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve chegar ao frontend.
- Chaves de IA devem passar apenas por Edge Functions.
- Rotas diretas do app dependem do fallback SPA do Netlify.
- A qualidade automatizada é organizada por risco: Vitest local para domínio e parsers, integração/RLS em Supabase de staging e Playwright autenticado em frontend local contra staging, com organizações descartáveis. A matriz está em `docs/TESTING.md`; produção recebe apenas smoke E2E público e de leitura.
