# Changelog

## 2026-07-09

- Ampliada a importação de KPIs: o editor agora aceita planilhas e imagens JPG/PNG/WEBP; a IA extrai somente Faturamento, Margem operacional, Produção e Caixa por ano/mês. Ao confirmar, valores históricos entram em `kpi_monthly_values` e um documento `Histórico de KPIs` é salvo para auditoria, sem armazenar a mídia original.
- Ajustada a referencia principal dos KPIs no Dashboard: Resultado agora destaca sempre o mes calendario anterior como ultimo mes fechado, mostra `aguardando fechamento` quando faltar realizado e deixa o mes corrente explicitamente como em andamento.
- Ajustado o minigráfico de Meta/Atingido dos KPIs no Dashboard: os meses agora aparecem no eixo horizontal. Adicionada importação de planilhas `.xlsx`, `.xls` e `.csv` no editor de KPIs; o navegador extrai a tabela, a IA de bastidores propõe indicador/mês/Meta/Atingido e a pessoa confirma a prévia antes de gravar.
- Corrigida a seleção de modelos de IA: Configurações agora exibe uma lista explícita de todos os modelos cadastrados para cada provedor, incluindo `grok-4.3` e `grok-4.5` na xAI, e mantém a opção de informar um id personalizado que será validado pelo provedor ao salvar.
- Executada a Onda 3c de polimento de UI: adicionados tokens de raio, sombra, movimento, superfícies, estados e tipografia; navegação e controles ganharam transições sutis, feedback de pressão, foco mais claro e respeito a redução de movimento. O Dashboard dos KPIs foi simplificado para remover a moldura redundante e unificar ritmo, métricas e camadas visuais.
- Executada a Onda 3b de tom/persona por empresa: criada `org_ai_tone` com RLS membro-le/owner-escreve, presets, eixos gentil↔ácido e direto↔motivador, preferência personalizada e aplicação segura no app, WhatsApp e condutores de planejamento.
- Executada a Onda 3a da importacao historica com IA: criada `suggest-historical-metadata`, usando a funcao `background` para sugerir tipo/area/periodo/titulo antes da gravacao, com fallback heuristico, confirmacao obrigatoria do usuario e periodo vazio quando nao houver data clara.
- Atualizado o catalogo de modelos de IA no frontend e no servidor com `gpt-5.5`, `claude-fable-5`, `claude-sonnet-5` e `grok-4.5`, preservando modelos legados para lookup de pricing.
- Executada a Fatia 4 da Onda 2 do Dashboard dos 4 KPIs: criada a Edge Function `set-member-role`, ligada a UI de Configuracoes para owner promover/rebaixar `admin`, com bloqueio de promocao a owner e protecao contra rebaixar o ultimo owner.
- Executadas as Fatias 0 a 3 da Onda 2 do Dashboard dos 4 KPIs: criada a fundacao de banco para `executive_kpis` e `kpi_monthly_values`, com papel `admin` limitado, RLS para leitura por membros e escrita por owner/admin, leitura no store, bloco de Resultado com quatro cards e editor de lancamentos em grade de 12 meses.
- Ajustado `whatsapp-webhook` para aceitar, alem do header secreto, um `evoGoToken` derivado via HMAC para Evo Go, cujo Manager nao persiste headers customizados; a URL ainda precisa manter `orgId`.
- Corrigido loop no WhatsApp: eventos enviados pela propria instancia (`fromMe`) agora sao ignorados antes de gerar resposta.

## 2026-07-08

- Executada a Onda 1 do pacote de melhorias: configuração de IA agora valida provider/modelo/chave ao salvar/testar, mostra status real por função/chave e grava erros de runtime; sidebar perdeu o placeholder Analytics; logo/lema ORÁCULO foram ajustados; importação histórica não sugere mais período silencioso.
- Executada a Fatia 2a da Memoria Estrategica: `_shared/plan-context.ts` injeta ate 3 documentos historicos truncados em contextos estrategicos/trimestrais, e os condutores passaram a usar esse passado como orientacao construtiva sem afirmar resultado nem criar tabela nova.
- Implementada a Fatia 1 da Revisao Estrategica sob demanda: owner pode iniciar o ritual no Plano Estrategico, confirmar microajustes em objetivos existentes e gravar um `plan_documents(strategic_review)` com antes/depois/porquê.

## 2026-07-07

- Iniciada a Memoria Estrategica: documentos historicos podem ser importados pelo Plano Estrategico, salvos em `plan_documents` com `origin = historical` e visualizados/filtrados em Documentos sem criar objetivos ativos nem chamar IA.
- Publicadas em produção as Edge Functions `whatsapp-webhook` e `month-turn` com as correções de segurança da revisão de 2026-07-05.
- Corrigido o Dashboard para remover rótulos fixos de demonstração na seção "Evolução"; agora os cards usam objetivos reais do tipo Evolução e mostram estado vazio quando não há dados.
- Decidido manter, por ora, as tabelas de segredo em `public.*_keys` com RLS/revokes até uma janela coordenada de migração para `private` ou Vault.
- Decidido tratar os erros silenciosos de mutação como refactor transversal futuro, a ser feito com propagação explícita de erro para a UI.
- Blindado o roteamento do `whatsapp-webhook`: quando o `orgId` da URL não resolve `whatsapp_settings` (ex.: org recriada com novo id e URL antiga na Evolution), a função agora cai de volta para o `instance_name` estável em vez de responder 404 silencioso e parar o WhatsApp. Recomendada também a remoção do `?orgId=` da URL na Evolution para depender só do `instance_name`.
- Concluída a limpeza da seção "Evolução" do Dashboard: removidos os últimos IDs de seed legados (`e1`, `e2`) do casamento de Faturamento/Margem, que passam a usar apenas indicador/título reais.

## 2026-07-05 (revisão de segurança + E2E)

- Auditoria completa de segurança (RLS/migrations, Edge Functions, frontend) e teste ponta a ponta com conta de teste nova.
- Corrigido fail-open em `month-turn`: sem `MONTH_TURN_SECRET` configurado a virada de mês era liberada; agora falha fechada e o segredo é comparado em tempo constante.
- Fechada SSRF em `whatsapp-webhook`: download de mídia por URL agora bloqueia hosts internos/loopback/link-local (inclui metadata `169.254.169.254`), impõe teto de tamanho e só envia a `apikey` da Evolution quando o host é o da própria instância (antes vazava a chave para hosts arbitrários).
- Segredo do webhook aceito apenas por header (removida aceitação via query string, que vaza em logs) e comparado em tempo constante.
- Corrigida divergência de período trimestral no frontend: telas usavam "Q3 2026" enquanto o servidor grava "T3 2026", fazendo objetivos sumirem de Planos Trimestrais. Centralizado em `src/lib/periods.ts` (`currentQuarterPeriod`, `currentMonthPeriod`, `currentYear`) e alinhado com `_shared/periods.ts`.
- Adicionado guard de duplo-submit na confirmação de proposta do Oráculo (`OraclePanel`), evitando gravação duplicada.
- Pendências registradas para decisão do dono: mover segredos (`ai_model_keys`, `whatsapp_instance_keys`) do schema `public` para `private`/Vault; cards da seção "Evolução" do Dashboard ainda são scaffolding legado (rótulos fixos, incluindo o nome do cliente de referência, e mapeamento por IDs de seed antigos); erros de mutação no store são silenciosos (UI pode mostrar sucesso falso).

## 2026-07-05

- Executada a Fase 7 da V3: removidos roteiros Markdown legados, guia de prompt separado e a Edge Function antiga de check-in mensal.
- Consolidada a calibragem de tom e guias por contexto em `_shared/conductors/persona.ts`, usado pelo chat web e pelos condutores da V3.
- Removidas referencias antigas de interface/prompt e alinhada a documentacao para a nomenclatura atual de Areas.
- Executada a Fase 6 da V3: propostas confirmadas de plano estratégico, trimestral, mensal e fechamentos agora geram `plan_documents` canônico.
- Criados `_shared/plan-documents.ts` e `_shared/plan-render.ts` para gerar documento determinístico e resumo nativo de WhatsApp sem nova chamada de IA.
- Adicionada tela `/documentos` com filtros por tipo, area e período, além da rota limpa `/documentos/:documentId/imprimir` para exportar PDF A4 pelo navegador.
- Atualizado o WhatsApp para responder perguntas sobre documentos buscando o plano/fechamento mais recente e enviando resumo formatado em blocos.
- Evoluída a importação de arquivos pelo WhatsApp: documentos estratégicos, trimestrais e mensais podem virar proposta estruturada, sempre com confirmação antes de gravar.
- Atualizada a documentação de arquitetura, segurança, decisões e runbook para explicar o fluxo, os limites e o diagnóstico de documentos padrão.

## 2026-07-04

- Iniciada a V3 com a Fase 0: fundacao de dados para conversas por pessoa/canal, sessoes de planejamento com estado, funcoes de IA por uso e documentos canonicos de plano.
- Preparada `public.ai_model_keys` para guardar chaves por provedor sem expor segredos ao frontend, preservando a configuracao OpenAI existente.
- Adicionadas policies RLS para `conversations`, `planning_sessions`, `ai_function_settings` e `plan_documents`.
- Habilitado realtime para `planning_sessions` e `plan_documents`, preparando a interface de sessoes das fases seguintes.
- Atualizada a documentacao de arquitetura, seguranca, acessos e decisoes para explicar a fundacao V3.
- Executada a Fase 1 da V3: adicionado provedor xAI/Grok, modelos recentes da Anthropic no catalogo de pricing e roteador de IA por funcao (`planning`, `daily`, `background`).
- Reformulada a tela Configuracoes > IA do Oraculo com chaves por provedor, funcoes de IA separadas e consumo exibindo a funcao usada.
- Atualizadas `oracle-chat` e `whatsapp-webhook` para usar a funcao `daily`; classificacao de documentos passa a usar `background`; transcricao de audio continua usando chave OpenAI cadastrada.
- Executada a Fase 2 da V3: criada a Edge Function `oracle-session`, com motor de sessao, estado persistido, condutores Estrategico/Trimestral/Mensal, envelope JSON e proposta pendente com confirmacao.
- Conectado o painel do Oraculo a sessoes ativas com fase, progresso e cartao "Pronto para gravar".
- Adicionados botoes "Planejar com o Oraculo" em Plano Estrategico e nas abas Trimestral/Mensal da Area.
- Liberada importacao de Plano Estrategico pronto mesmo com base zerada; PDF/PPTX/DOCX/TXT ou texto colado entram em uma acao dedicada de importacao estrategica, mantendo proposta e confirmacao antes de gravar.
- Corrigida a importacao de Plano Estrategico pronto para gerar proposta estruturada real (`save_strategic_plan`) pelo app, em vez de apenas revisar texto ou mandar o usuario para WhatsApp.
- Separadas as acoes "Só revisar texto" e "Gerar proposta e carregar no módulo", com suporte a arrastar/soltar arquivo na area de importacao.
- Ajustado WhatsApp para transformar documento classificado como Plano Estrategico em proposta pendente e permitir gravacao respondendo "confirmar".
- Blindada a busca de conversa/sessao ativa para usar a mais recente quando houver historico duplicado, evitando erro na importacao de plano pronto.
- Ajustado o painel do Oraculo para priorizar sessoes com proposta pendente, evitando que uma sessao antiga esconda o cartao "Pronto para gravar".
- Recalibrado o prompt de plano pronto para preservar o documento aprovado e deixar lacunas vazias, sem inventar KPI, meta, prazo, responsavel ou projeto.
- Adicionado "Descartar" no cartao de proposta pendente para abandonar testes ou propostas incorretas sem gravar dados.
- Ajustada a confirmação por WhatsApp para priorizar sessoes com proposta pendente quando a pessoa responder "confirmar".
- Aumentado o limite de importacao de plano pronto no app de 12 MB para 80 MB, com aviso para arquivos acima de 30 MB.
- Melhorado o cartao de aprovacao de plano pronto no app para mostrar a previa estruturada antes da gravacao, incluindo objetivos, projetos, lacunas e rastreabilidade basica.
- Separada a resposta de importacao por canal: o app continua no painel lateral com cartao visual; o WhatsApp recebe previa textual e confirma por mensagem.
- Adicionada edicao manual de objetivos nos cards, com meta, valor atual, tendencia, status, progresso, responsavel, prazo, evidencia e entregas.
- Liberada criacao de areas/departamentos diretamente na tela Areas e na tela Planos Trimestrais quando nao houver areas cadastradas.
- Liberada criacao manual de objetivos trimestrais pela tela Planos Trimestrais e de objetivos por nivel no detalhe da area.
- Renomeada a regua visual "Direcional" para "Direcao inicial" na UI, deixando claro que ela mede clareza do objetivo, nao progresso.
- Executada a Fase 3 da V3: adicionada memoria por conversa em `_shared/conversations.ts`, com conversa separada por pessoa/canal, resumo automatico via funcao `background` e gravacao de `user_id`/`conversation_id`.
- Adicionado `_shared/plan-context.ts`, que entrega contexto textual do plano para IA com objetivos, areas, trimestre vigente, mes vigente, acoes-chave, evidencias e pendencias.
- Atualizados `oracle-chat`, `oracle-session` e `whatsapp-webhook` para usar historico da conversa correta e contexto textual, reduzindo contaminacao entre usuarios/canais.
- Ajustado painel web do Oraculo para carregar mensagens web do usuario atual e deixar o servidor registrar a conversa principal com rastreabilidade.
- Executada a Fase 4 da V3: adicionado roteador de intencao do Oraculo com `_shared/intent-router.ts`, usando a funcao `background` e fallback deterministico.
- Atualizado `whatsapp-webhook` para iniciar sessoes de planejamento pelo WhatsApp quando a pessoa pedir plano estrategico, trimestral ou mensal.
- Atualizado `oracle-chat` para reconhecer pedidos de planejamento no app e iniciar a sessao correspondente sem jogar a pessoa para outro canal.
- Adicionadas atualizacoes rapidas por WhatsApp em `_shared/quick-updates.ts`, com registro de conclusao, progresso, status e evidencia curta em objetivos/acoes existentes, validando permissao antes de gravar.
- Melhorada a formatacao de respostas do WhatsApp com negrito nativo, conversao de tabelas simples e divisao de respostas longas em ate tres blocos.
- Documentado que fechamento guiado e documentos padronizados continuam como pendencia segura para fases seguintes, sem promessa de gravacao automatica.
- Adicionado limite de escopo no WhatsApp: curiosidades gerais fora do Oraculo recebem resposta curta, com humor leve, e sao conduzidas de volta para negocio, gestao, estrategia, planejamento e execucao.
- Ajustado o limite de escopo para gerar respostas contextuais por IA, evitando repeticao robotizada quando o usuario pergunta assuntos externos diferentes.
- Refinado o limite de escopo para usar leveza contextual por assunto e tratar temas sensiveis sem piada sobre sofrimento.
- Corrigido o tom fora de escopo para impedir que o Oraculo misture exemplos nao citados, como Copa, guerra e fofoca, e para evitar parafrases muito parecidas com respostas recentes.
- Executada a Fase 5 da V3: adicionados condutores de fechamento mensal e trimestral, propostas `month_close`/`quarter_close`, gravacao de check-ins/evidencias/status e rolagem de pendencias confirmadas.
- Adicionado cartao de fechamento pendente no Dashboard/Execucao e Edge Function `month-turn` para convite de virada por WhatsApp.
- Configurado `MONTH_TURN_SECRET` no Supabase e agendado o cron mensal `oraculo-month-turn` para rodar no dia 1 as 11:00 UTC.
- Adicionado anexo de PDF/PPTX/DOCX/TXT no chat lateral do app, enviando apenas texto extraido para a conversa ou sessao ativa.
- Adicionada importacao de Plano Trimestral pronto por departamento na tela Planos Trimestrais, com proposta `save_quarterly_plan`, previa no painel lateral e confirmacao antes de gravar.
- Renomeado o fechamento mensal na Execucao Viva para "Adicionar check-in", deixando claro que o check-in e salvo ao confirmar o fechamento guiado.

## 2026-07-02

- Adicionado formulário em Configurações para criar nova empresa e alternar a empresa ativa.
- Corrigido parsing de payloads da Evolution API/Evo Go no `whatsapp-webhook`, incluindo campos `Data/Info/Message` e filtros para ignorar remetentes `@lid`.
- Corrigido envio de WhatsApp para deixar a Evolution gerar ids unicos de mensagem e reduzir duplicidade/travamento de envio.
- Seedados dados reais de demonstracao da GAAM/Aize no Supabase de producao para painel, planos e objetivos.
- Melhorada a entrada do Oraculo pelo WhatsApp: identificacao por celular cadastrado, saudacao por horario de Sao Paulo, uso do primeiro nome e fallback contextual.
- Adicionado suporte de IA real com provedores `openai`, `anthropic` e `moonshot`, mantendo chaves fora do frontend.
- Adicionado tracking de uso de IA em `ai_usage_logs`, com tokens de entrada, tokens de saida, custo estimado, canal (`web` ou `whatsapp`) e realtime para a tela de Configuracoes.
- Adicionado catalogo de pricing automatico para Kimi/Moonshot e OpenAI GPT 5.4, incluindo fonte oficial de precos.
- Configurado o modelo ativo `openai` / `gpt-5.4` com chave cadastrada pelo owner e pricing salvo em `ai_settings`.
- Migradas chaves operacionais para tabelas acessiveis apenas por service role: `public.ai_model_keys` e `public.whatsapp_instance_keys`, com RLS habilitado e acesso revogado para `anon` e `authenticated`.
- Corrigido webhook do WhatsApp para salvar a mensagem recebida antes de chamar IA, aplicar timeout na chamada do modelo e registrar erro quando a IA falhar.
- Migrada chamada OpenAI para endpoint de Responses API em `_shared/model.ts`, mantendo Moonshot em Chat Completions.
- Corrigido empacotamento dos roteiros do Oraculo em Edge Functions com modulo TypeScript compartilhado, evitando falha por leitura de arquivos `.md` nao enviados no deploy.
- Calibrado tom do Oraculo para conversa mais natural: respostas curtas, amigaveis, sem despejar numeros quando a pergunta for ambigua, e pedindo esclarecimento quando necessario.
- Ajustado WhatsApp para enviar tambem saudacoes, testes e aberturas simples para a IA quando houver chave configurada; respostas programadas ficam apenas como fallback.
- Adicionado suporte inicial a áudio no WhatsApp: o webhook detecta áudio, tenta baixar a mídia pela Evolution, transcreve com OpenAI e envia o texto transcrito para o mesmo fluxo de IA.
- Corrigido suporte a áudio para Evo Go: o webhook passou a tentar a rota `/message/downloadimage`, aceitar retorno binário além de base64 e testar mais formatos de corpo antes de desistir da transcrição.
- Finalizada a correção de áudio no WhatsApp: normalizacao de MIME, fallback de transcrição OpenAI, diagnosticos seguros e descriptografia em memoria de mídia criptografada do WhatsApp com `mediaKey`.
- Adicionado recebimento de arquivos pelo WhatsApp: PDF, PPTX, DOCX e TXT sao baixados da Evo, descriptografados quando necessario, têm texto extraido e sao classificados por IA para direcionar para Plano Estratégico, Planos Trimestrais, Plano Mensal ou Evidência.

## 2026-06-30

- Evoluida a V2 com melhorias de conta, celular, administracao de membros, convites e seletor de empresa.
- Adicionada integracao real com Evolution API/Evo Go para convites e conversas via WhatsApp.
- Configurada VPS/Evo Go externa como infraestrutura do WhatsApp, com URL publica usada nas Configuracoes do app.
- Adicionadas Edge Functions `save-whatsapp-settings` e `whatsapp-webhook`, com segredo de webhook e chave da Evolution armazenados fora do frontend.
- Adicionada tela de recuperacao de senha e visualizacao temporaria de senha no login.
- Publicados ajustes no Netlify e Supabase conforme cada bloco ficou pronto.

## 2026-06-29

- Publicada a V2 do frontend no Netlify.
- Conectado frontend ao Supabase.
- Criadas migrations de schema, RLS, schema privado para chaves de IA e realtime.
- Publicadas Edge Functions iniciais `invite-member`, `save-ai-settings` e `oracle-chat`, depois substituidas pelos fluxos V3 de sessoes, virada mensal e WhatsApp.
- Adicionadas rotas de autenticacao, onboarding, configuracoes, execucao e planos.
- Configurado fallback SPA para rotas diretas no Netlify.
- Criada documentacao minima de manutencao: README, AGENTS, Architecture, Security, Decisions, Runbook e Changelog.
- Adicionado mapa de acessos e custodia de chaves em `docs/ACCESS.md`.
- Repositorio GitHub tornado publico para leitura.
- Corrigida nomenclatura da interface: Oraculo e Areas.
- Adicionada importacao de plano estrategico por PDF, PPTX, DOCX e TXT na aba de revisao do Oraculo.
- Adicionado celular unico ao perfil e rodape da sidebar com conta do usuario e seletor de empresa.
- Melhorada administracao de convites: email no perfil, celular opcional no convite, listagem de vinculos e remocao pelo dono.
- Transformado o painel real do Oraculo em interface estilo WhatsApp e removida a tela estatica de previa.
- Adicionada base do WhatsApp real com Evolution API: configuracao, segredos privados, webhook seguro e historico por canal.
- Adicionado convite operacional por WhatsApp quando Evolution API/Evo Go estiver ativo e o convidado tiver celular cadastrado.
- Adicionada visualizacao de senha no login e recuperacao de senha por email com tela de redefinicao.

## 2026-06-28

- Construida a V1 navegavel do Oraculo com dashboard, planejamento estrategico, areas, planos trimestrais e demonstracao WhatsApp.
- Ajustada sidebar redimensionavel e compacta conforme referencia visual.
- Gerado pacote local com o codigo da V1.
