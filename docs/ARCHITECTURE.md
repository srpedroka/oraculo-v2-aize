# Arquitetura

## Visao geral

O Oraculo V2 e um app web de execucao estrategica. O frontend roda em React/Vite e conversa diretamente com o Supabase para autenticacao, leitura e escrita de dados protegidos por RLS. A logica que exige privilegio maior, como salvar chaves de IA e acionar o modelo, fica em Supabase Edge Functions.

## Camadas

### Frontend

- `src/App.tsx`: define rotas e bloqueios de acesso. Sem sessao, mostra login. Com sessao sem empresa, mostra onboarding. Com empresa, mostra o app.
- `src/state/store.tsx`: concentra carregamento, mutacoes e estado de UI. Usa React Query para buscar dados e Context/reducer para estado local.
- `src/lib/supabase.ts`: cria o cliente Supabase com sessao persistente e realtime.
- `src/pages/`: telas de produto.
- `src/components/`: layout, sidebar, painel do Oraculo e componentes de UI.
- `src/features/objective/`: componentes de objetivo e builder.

Na tela `src/pages/Strategic.tsx`, o Plano Estrategico pode nascer de duas entradas: condução do zero pelo Oraculo ou importacao de plano pronto. A importacao aceita PDF, PPTX, DOCX e TXT no navegador, extrai texto com `src/lib/fileImport.ts` e permite dois caminhos independentes: "Só revisar texto", que roda uma revisão local sem gravar, e "Gerar proposta e carregar no módulo", que chama `oracle-session` com `action = import_ready_plan`. O arquivo bruto nao e enviado ao banco; o texto extraido/colado vira insumo para uma proposta estruturada e a gravacao continua dependendo de confirmacao. Quando a importacao nasce no app, o painel lateral mostra uma previa estruturada do que sera gravado, com objetivos, projetos, vinculos e lacunas, sem mandar a pessoa para WhatsApp. A mesma tela tambem permite importar historico estrategico: o usuario cola ou extrai o texto, pode chamar `suggest-historical-metadata` para receber sugestao de tipo, area, periodo e titulo pela funcao de IA `background`, revisa campos editaveis e so entao grava um `plan_documents` com `origin = historical`. Se nao houver data clara, o periodo fica vazio ate o usuario preencher. Esse fluxo nao cria objetivos ativos. Owners com plano estrategico existente tambem podem iniciar a Revisao Estrategica sob demanda, que abre uma sessao `strategic_review` para microajustar objetivos estrategicos existentes, sempre com proposta e confirmacao.

Na tela `src/pages/QuarterlyPlans.tsx`, cada departamento com permissao de escrita pode importar um plano trimestral pronto. A entrada usa o mesmo `src/lib/fileImport.ts`, aceita PDF, PPTX, DOCX e TXT, envia apenas o texto extraido para `oracle-session` com `action = import_ready_quarterly_plan` e exige confirmacao antes de gravar `area_plans` e objetivos trimestrais. O painel lateral mostra a previa de papel da area, diagnostico, objetivos anuais de apoio, objetivos do trimestre, entregas e lacunas. O chat lateral `src/components/OraclePanel.tsx` tambem aceita anexo de PDF/PPTX/DOCX/TXT e envia o texto extraido como mensagem para a conversa ou sessao ativa; ele nao salva o arquivo bruto.

Na tela `src/pages/Documents.tsx`, os documentos gravados em `plan_documents` aparecem com filtros por tipo, origem, departamento e periodo. A origem separa documentos de sessao (`session`) de historicos importados (`historical`). O componente `src/components/PlanDocument.tsx` renderiza o mesmo conteudo para tela e para a rota limpa `src/pages/DocumentPrint.tsx` (`/documentos/:documentId/imprimir`), que usa CSS de impressao A4 sem sidebar nem painel lateral.

Na tela `src/pages/Dashboard.tsx`, o bloco "Resultado" combina objetivos ativos com o Dashboard dos 4 KPIs executivos: Faturamento, Margem operacional, Producao e Caixa. As definicoes vivem em `executive_kpis`, os lancamentos mensais em `kpi_monthly_values`, e o frontend renderiza o ano corrente sem seletor de ano na primeira versao. O numero em evidencia e sempre o mes calendario anterior, tratado como ultimo mes fechado; se algum KPI ainda nao tiver realizado, o cabecalho e o card sinalizam que o fechamento esta pendente em vez de mostrar um mes antigo. O mes atual aparece somente como em andamento. Os minigraficos exibem Meta/Atingido com os meses no eixo horizontal. Owners e admins abrem `src/features/kpi/KpiEditorDialog.tsx` para editar a grade de 12 meses ou importar `.xlsx`, `.xls`, `.csv`, JPG, PNG e WEBP. `src/lib/kpiSpreadsheet.ts` extrai tabela de planilha ou prepara imagem reduzida em memoria; `suggest-kpi-spreadsheet` usa a funcao de IA `background` para propor somente os quatro KPIs e pode devolver varios anos. Depois da confirmacao, `apply-kpi-import` grava `kpi_monthly_values` e cria `plan_documents(type = kpi_history, origin = historical)`, exibido em Documentos. Arquivo e imagem brutos nao sao armazenados; a escrita final depende da validacao server-side de `owner`/`admin` e da RLS `is_admin`.

Na tela `src/pages/Settings.tsx`, o card "Tom do Oráculo" lê `org_ai_tone` para todos os membros da empresa e permite edição somente pelo owner. Presets preenchem os eixos gentil↔ácido/franco e direto↔motivador; o preset personalizado libera os sliders e uma preferência da casa de até 280 caracteres.

Na mesma tela, owners administram `Segurança e backups`. Cada empresa tem uma política em `organization_backup_policies`; snapshots concluídos são registrados em `organization_backups` e armazenados como JSON versionado e comprimido no bucket privado `organization-backups`. O pacote inclui dados do domínio, configurações não secretas, perfis públicos ligados à empresa, manifesto, contagem por tabela e SHA-256. Chaves, senhas, mídia bruta e metadados de backups anteriores ficam fora. O download portátil é criptografado no navegador com AES-256-GCM e senha que não sai do dispositivo. A restauração sempre cria uma nova empresa, remapeia IDs e usuários existentes por email, abandona sessões que estavam ativas e mantém a origem intacta. Se a conta não tiver mais nenhuma empresa, `Onboarding.tsx` oferece a importação do pacote; o servidor só libera essa rota sem `org_id` quando o usuário autenticado realmente não possui membership.

Depois que objetivos sao gravados, a operacao diaria nao depende apenas do Oraculo. `src/features/objective/ObjectiveEditDialog.tsx` permite editar tipo, resultado, indicador, meta, valor atual, tendencia, status, progresso, responsavel, prazo, evidencia e entregas. O mesmo editor aparece em Plano Estrategico, Dashboard e cards de planos por area. A tela de Areas tambem permite ao owner cadastrar areas e vincular coordenadores no proprio modulo, enquanto coordenadores e demais membros ficam em leitura quando nao tiverem permissao de escrita.

A rota `/arquivo` concentra o ciclo de vida reversível da operação. Objetivos podem ser arquivados com seus desdobramentos, ações e evidências ainda ativas; ações-chave, projetos prioritários, evidências, check-ins e documentos também podem ser retirados individualmente e restaurados. Registros arquivados saem das telas ativas, do WhatsApp e do contexto da IA. Atualizações em planos, objetivos, execução e KPIs geram snapshots antes/depois em `operational_revisions`, permitindo corrigir sem sobrescrever silenciosamente o histórico.

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
- `20260709180000_kpi_history_documents.sql`: adiciona `kpi_history` aos tipos de `plan_documents` e indice para documentos históricos de importação de KPIs.
- `20260710120000_organization_backups.sql`: adiciona políticas, snapshots, auditoria de restauração, bucket privado, fila de marcos e cron protegido para backups por empresa.
- `20260710133000_portable_restore_without_org.sql`: permite restaurar pacote portátil pelo onboarding quando a conta ficou sem empresa.
- `20260710170000_area_lifecycle_member_removal.sql`: adiciona arquivamento reversível de áreas, bloqueia delete direto de memberships, desvincula coordenador por `on delete set null` e cria a função transacional de remoção de membro.
- `20260710193000_operational_lifecycle.sql`: adiciona ciclo de vida reversível aos registros operacionais, histórico imutável de revisões e bloqueio de delete direto no navegador.

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
- `conversations`
- `planning_sessions`
- `plan_documents`
- `executive_kpis`
- `kpi_monthly_values`
- `operational_revisions`
- `org_ai_tone`
- `organization_backup_policies`
- `organization_backups`
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

Essas tabelas foram criadas na Fase 0 da V3. A partir da Fase 3, `conversations` passa a ser usada em runtime por `oracle-chat`, `oracle-session` e `whatsapp-webhook`: cada pessoa tem uma conversa ativa por canal (`web` ou `whatsapp`), `chat_messages` recebe `user_id` e `conversation_id`, e conversas longas ganham resumo em `conversations.summary`.

Dashboard executivo:

- `executive_kpis`: uma definicao por empresa e KPI (`revenue`, `operating_margin`, `production`, `cash`), com unidade, direcao, tipo fluxo/estoque, ordem e escada opcional para caixa.
- `kpi_monthly_values`: valores mensais planejados e realizados por KPI, ano e mes. Faturamento e margem usam valor numerico; Producao aceita valor financeiro e quantidade secundaria; Caixa usa saldo realizado de fim de mes e pode registrar etapa-alvo da escada.

As duas tabelas sao lidas por membros da empresa e escritas apenas por `owner` ou `admin`, via helper `is_admin(org_id)`. O papel `admin` foi adicionado para permitir manutencao operacional do Dashboard sem entregar permissoes de dono para configuracoes, membros ou areas.

### Edge Functions

- `invite-member`: cria ou registra membros convidados. Se WhatsApp estiver ativo e houver celular, gera link de convite e envia pela Evolution API/Evo Go; caso contrario usa convite por email do Supabase.
- `set-member-role`: permite que owner altere membro entre `admin` e `coordinator`, ou rebaixe outro owner quando ainda existir pelo menos um owner restante. Nao promove novos owners.
- `remove-member`: valida owner, impede autoexclusão e remoção do último owner, aplica reatribuições de coordenação e remove somente a membership em uma transação PostgreSQL. Perfil, Auth e histórico da pessoa não são apagados.
- `operational-lifecycle`: valida sessão e permissão por empresa/área, chama a RPC transacional de arquivamento/restauração e impede que um coordenador restaure um lote iniciado por objetivo fora do seu escopo.
- `save-ai-settings`: salva chaves por provedor, configura as funcoes de IA (`planning`, `daily`, `background`), valida provider/modelo/chave contra o provedor no momento do salvamento/teste, preserva o modo legado de provider/modelo unico e grava a chave real em tabela acessivel apenas por service role.
- `save-whatsapp-settings`: salva configuracao publica do WhatsApp e segredos da Evolution API em tabela acessivel apenas por service role.
- `suggest-kpi-spreadsheet`: valida sessao e papel `owner`/`admin`, carrega as definicoes dos quatro KPIs e usa a funcao de IA `background` para sugerir Meta/Atingido por indicador, mes e ano a partir de planilha ou imagem. A funcao nao grava valores.
- `apply-kpi-import`: recebe somente a proposta confirmada, revalida os quatro KPIs/anos/meses no servidor, preserva campos antigos ausentes da proposta, grava `kpi_monthly_values` e cria um `plan_documents.kpi_history` para auditoria em Documentos.
- `suggest-historical-metadata`: valida sessao/permissao, restringe areas candidatas ao owner ou ao coordenador da propria area, usa a funcao de IA `background` para sugerir tipo, area, periodo e titulo do historico e cai para heuristica segura se a IA nao estiver disponivel. Nunca inventa periodo quando nao ha data clara.
- `save-historical-document`: valida sessao, permissao de empresa/area, tipo, periodo e tamanho do texto antes de gravar um `plan_documents` historico. Pode guardar em `content.classification` a sugestao revisada pelo usuario, mas nao cria objetivos, acoes ou planos ativos.
- `organization-backup`: owner cria, lista, baixa, remove e restaura snapshots por empresa; o cron usa segredo próprio gerado no banco. O arquivo interno fica em Storage privado e pode ser replicado para S3 compatível quando os secrets opcionais estiverem configurados.
- `oracle-chat`: usa a conversa web da pessoa, grava pergunta e resposta com `user_id`/`conversation_id`, monta contexto legivel do plano e responde com fallback deterministico ou modelo configurado. Tambem classifica a intencao da mensagem para iniciar planejamento anual/trimestral/mensal ou fechamento mensal/trimestral pelo app.
- `oracle-session`: motor de condução da Fase 2 da V3. Inicia sessoes estruturadas, processa mensagens com a funcao de IA `planning`, importa plano estrategico pronto via `import_ready_plan`, importa plano trimestral pronto via `import_ready_quarterly_plan`, conduz a Revisao Estrategica `strategic_review`, persiste fase/estado/proposta pendente e grava planos, revisoes ou fechamentos apenas depois de confirmacao.
- `month-turn`: funcao de virada de mes. Verifica areas com plano mensal encerrado sem check-in e envia convite por WhatsApp para owner/coordenador quando a integracao estiver ativa.
- `whatsapp-webhook`: recebe mensagem da Evolution API, valida segredo, identifica usuario por `profiles.phone`, usa a conversa WhatsApp da pessoa e grava historico com `user_id`/`conversation_id`. Para áudio, baixa a mídia da Evolution/Evo Go, descriptografa mídia de WhatsApp quando vier criptografada, transcreve com OpenAI e envia o texto transcrito para o mesmo fluxo de IA. Para documentos PDF/PPTX/DOCX/TXT, baixa e descriptografa quando necessario, extrai texto e classifica por IA. Documentos classificados como Plano Estrategico, Trimestral ou Mensal usam importadores server-side e geram proposta pendente; evidencias e documentos indefinidos recebem pergunta de direcionamento. Na Fase 4 da V3, o webhook ganhou roteamento operacional: classifica intencao, inicia planejamento por WhatsApp quando a pessoa pedir, aplica atualizacoes rapidas em objetivos/acoes mensais quando houver alvo claro, formata respostas para WhatsApp e limita respostas longas a blocos curtos. Na Fase 6, perguntas de documento (`document_question`) buscam o `plan_documents` mais recente por tipo/periodo/area e enviam resumo nativo pelo WhatsApp.

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
- `_shared/conductors/persona.ts`: persona, tom de conversa e guias por contexto usados pelos condutores e pelo chat web.
- `_shared/conductors/tone.ts`: carrega `org_ai_tone`, usa o padrão equilibrado quando não há registro e gera uma diretiva de forma que não sobrepõe regras de segurança.
- `_shared/intent-router.ts`: classifica mensagens em `smalltalk`, `status`, `quick_update`, `start_planning`, `close_period`, `document_question` ou `other`, usando a funcao de IA `background` com fallback deterministico.
- `_shared/historical-classifier.ts`: sugere metadados para historicos importados, usando IA `background` quando configurada e fallback heuristico com periodo vazio se nao houver data clara.
- `_shared/kpi-spreadsheet.ts`: sanitiza a proposta de importacao de KPI, aceita somente os quatro indicadores e meses 1-12, e nunca transforma inferencia ausente em valor gravado.
- `_shared/periods.ts`: normaliza texto e resolve ano, trimestre e mes vigentes ou citados na mensagem.
- `_shared/quick-updates.ts`: identifica atualizacoes curtas do WhatsApp, escolhe objetivo/acao mensal, pede esclarecimento em caso de ambiguidade, valida permissao e grava status, progresso ou evidencia.
- `_shared/conversations.ts`: cria/retoma conversa por pessoa e canal, grava mensagens com dono, carrega historico da conversa e resume historico longo com a funcao `background`.
- `_shared/plan-context.ts`: monta contexto textual do plano, com empresa, objetivos estrategicos, area em foco, plano anual, trimestre/mes em foco, IDs de objetivos/acoes, acoes-chave, evidencias, pendencias e memoria estrategica historica truncada quando o foco e estrategico ou trimestral.
- `_shared/session-engine.ts`: orquestra sessoes de planejamento, historico, prompts, estado e chamadas ao modelo.
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

Na Fase 3, as chamadas de conversa deixam de usar historico geral da empresa. `oracle-chat` e `whatsapp-webhook` carregam apenas a conversa ativa daquele usuario e canal. Quando existem mais de 40 mensagens novas desde o ultimo resumo, `_shared/conversations.ts` usa a funcao `background` para gerar um resumo curto em `conversations.summary`; depois disso, o modelo recebe o resumo e as ultimas mensagens, reduzindo custo e evitando perda de contexto.

O contexto do plano tambem deixa de ser JSON cru. `_shared/plan-context.ts` devolve texto estruturado para a IA, incluindo objetivos, progresso, donos, prazos, entregas e acoes-chave. Isso permite que perguntas como "como está o mês da minha área?" enxerguem tambem as ações-chave, não só os objetivos.

Na Fatia 2a da Memoria Estrategica, o mesmo helper passa a incluir a seção "MEMÓRIA ESTRATÉGICA (planos passados — referência)" quando o foco e estrategico (`org`) ou trimestral. A seção busca no maximo 3 documentos historicos (`plan_documents.origin = historical`) mais relevantes/recentes, limita cada texto a cerca de 1.800 caracteres e orienta o modelo a tratar recorrencia como pergunta construtiva, nao como prova de resultado. Nao ha migration nem chamada de IA extra nessa fatia.

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

Na Fase 5, `oracle-session` tambem conduz fechamentos. `month_close` revisa objetivos mensais, acoes, evidencias, aprendizados e pendencias; a proposta `month_close` atualiza objetivos/acoes, registra evidencias, cria `check_ins` e rola pendencias para o mes seguinte quando confirmado. `quarter_close` aplica a mesma logica aos objetivos trimestrais e pode atualizar o foco de aprendizado do proximo trimestre. Depois de gravar, a sessao permanece na ponte para oferecer abrir o proximo ciclo.

Na Fase 6, toda proposta confirmada (`save_strategic_plan`, `save_quarterly_plan`, `save_monthly_plan`, `month_close`, `quarter_close`) tambem gera um documento canonico em `plan_documents`. O documento nao depende de nova chamada de IA: e montado de forma deterministica por `_shared/plan-documents.ts` a partir da proposta aprovada e de dados basicos de empresa/area. A tela `/documentos` renderiza esse conteudo, a rota `/documentos/:documentId/imprimir` exporta por impressao/PDF A4, e o WhatsApp usa `_shared/plan-render.ts` para enviar resumo nativo.

### WhatsApp

O WhatsApp real passa por Evolution API/Evo Go hospedada fora do app. O fluxo e:

1. Usuario envia mensagem para o numero pareado.
2. Evolution chama `whatsapp-webhook` com segredo.
3. O webhook identifica a empresa e o perfil pelo celular cadastrado.
4. O webhook cria ou retoma a conversa `whatsapp` daquela pessoa.
5. A mensagem do usuario e salva em `chat_messages` com `user_id` e `conversation_id`.
6. O roteador classifica a intencao. Se for planejamento, inicia uma sessao; se for atualizacao rapida, valida alvo/permissao e grava; se for conversa/status, segue para a IA diaria.
7. O Oraculo responde por IA real ou fallback seguro, usando apenas o historico daquela conversa.
8. A resposta e salva, formatada para WhatsApp e enviada de volta pela Evolution. Respostas longas podem ser divididas em ate tres mensagens separadas por pausa curta.

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

- RLS deve ser revisada sempre que uma tabela nova for criada.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve chegar ao frontend.
- Chaves de IA devem passar apenas por Edge Functions.
- Rotas diretas do app dependem do fallback SPA do Netlify.
- O projeto ainda nao tem testes automatizados de UI; build e typecheck sao a protecao minima.
