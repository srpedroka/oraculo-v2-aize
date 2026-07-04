# Changelog

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
- Corrigido empacotamento dos roteiros do Oraculo em Edge Functions com `_shared/prompt-guides.ts`, evitando falha por leitura de arquivos `.md` nao enviados no deploy.
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
- Publicadas Edge Functions `invite-member`, `save-ai-settings`, `oracle-chat` e `monthly-check-in`.
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
