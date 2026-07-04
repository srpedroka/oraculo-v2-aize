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

Na tela `src/pages/Strategic.tsx`, o Plano Estrategico pode nascer de duas entradas: condução do zero pelo Oraculo ou importacao de plano pronto. A importacao aceita PDF, PPTX, DOCX e TXT no navegador, extrai texto com `src/lib/fileImport.ts` e permite dois caminhos independentes: "Só revisar texto", que roda uma revisão local sem gravar, e "Gerar proposta e carregar no módulo", que chama `oracle-session` com `action = import_ready_plan`. O arquivo bruto nao e enviado ao banco; o texto extraido/colado vira insumo para uma proposta estruturada e a gravacao continua dependendo de confirmacao. Quando a importacao nasce no app, o painel lateral mostra uma previa estruturada do que sera gravado, com objetivos, projetos, vinculos e lacunas, sem mandar a pessoa para WhatsApp.

Depois que objetivos sao gravados, a operacao diaria nao depende apenas do Oraculo. `src/features/objective/ObjectiveEditDialog.tsx` permite editar tipo, resultado, indicador, meta, valor atual, tendencia, status, progresso, responsavel, prazo, evidencia e entregas. O mesmo editor aparece em Plano Estrategico, Dashboard e cards de planos por area. A tela de Areas tambem permite ao owner cadastrar areas e vincular coordenadores no proprio modulo, enquanto coordenadores e demais membros ficam em leitura quando nao tiverem permissao de escrita.

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

`profiles.email` guarda o email publico usado na administracao de convites. `profiles.phone` guarda o celular em formato internacional (`+5546999990000`). Ele e unico quando preenchido e sera usado como chave de identificacao para canais externos, como WhatsApp.

Tabelas de segredo com acesso apenas por service role:

- `public.ai_model_keys`: guarda chaves de provedores de IA. Tem RLS habilitado, acesso revogado para `anon` e `authenticated`, e grant para `service_role`.
- `public.whatsapp_instance_keys`: guarda chave da Evolution API e segredo do webhook. Tem o mesmo padrao de acesso exclusivo por `service_role`.

O schema `private` existiu como desenho inicial e pode aparecer em migrations antigas. O caminho operacional atual das Edge Functions usa as tabelas publicas bloqueadas por RLS/revokes.

Fundacao V3:

- `conversations`: separa o historico por pessoa e canal (`web` ou `whatsapp`) e guarda um resumo rolante para memoria futura.
- `planning_sessions`: guarda o estado das sessoes conduzidas pelo Oraculo, incluindo tipo, periodo, fase atual, dados coletados e proposta pendente de confirmacao.
- `ai_function_settings`: permite configurar modelos diferentes para planejamento, conversa do dia a dia e bastidores, sem duplicar chaves no frontend.
- `ai_provider_key_status`: guarda apenas `has_key` e `key_preview` por provedor para a tela de Configuracoes. A chave real continua em `public.ai_model_keys`, acessivel apenas por service role.
- `plan_documents`: guarda o conteudo estruturado dos documentos canonicos de plano e fechamento que serao renderizados em tela, PDF e WhatsApp nas fases seguintes.

Essas tabelas foram criadas na Fase 0 da V3. A partir da Fase 3, `conversations` passa a ser usada em runtime por `oracle-chat`, `oracle-session` e `whatsapp-webhook`: cada pessoa tem uma conversa ativa por canal (`web` ou `whatsapp`), `chat_messages` recebe `user_id` e `conversation_id`, e conversas longas ganham resumo em `conversations.summary`.

### Edge Functions

- `invite-member`: cria ou registra membros convidados. Se WhatsApp estiver ativo e houver celular, gera link de convite e envia pela Evolution API/Evo Go; caso contrario usa convite por email do Supabase.
- `save-ai-settings`: salva chaves por provedor, configura as funcoes de IA (`planning`, `daily`, `background`), preserva o modo legado de provider/modelo unico e grava a chave real em tabela acessivel apenas por service role.
- `save-whatsapp-settings`: salva configuracao publica do WhatsApp e segredos da Evolution API em tabela acessivel apenas por service role.
- `oracle-chat`: usa a conversa web da pessoa, grava pergunta e resposta com `user_id`/`conversation_id`, monta contexto legivel do plano e responde com fallback deterministico ou modelo configurado. Na Fase 4 da V3, tambem classifica a intencao da mensagem para iniciar planejamento anual/trimestral/mensal pelo app ou avisar que fechamento guiado pertence a fase seguinte.
- `oracle-session`: motor de condução da Fase 2 da V3. Inicia sessoes estruturadas, processa mensagens com a funcao de IA `planning`, importa plano estrategico pronto via `import_ready_plan`, persiste fase/estado/proposta pendente e grava planos apenas depois de confirmacao.
- `monthly-check-in`: gera check-in mensal e registra mensagem do Oraculo.
- `whatsapp-webhook`: recebe mensagem da Evolution API, valida segredo, identifica usuario por `profiles.phone`, usa a conversa WhatsApp da pessoa e grava historico com `user_id`/`conversation_id`. Para áudio, baixa a mídia da Evolution/Evo Go, descriptografa mídia de WhatsApp quando vier criptografada, transcreve com OpenAI e envia o texto transcrito para o mesmo fluxo de IA. Para documentos PDF/PPTX/DOCX/TXT, baixa e descriptografa quando necessario, extrai texto e classifica por IA. Documentos classificados como Plano Estrategico usam o mesmo importador server-side do app e geram proposta pendente; documentos trimestrais, mensais e evidencias ainda recebem direcionamento sem gravacao automatica. Na Fase 4 da V3, o webhook ganhou roteamento operacional: classifica intencao, inicia planejamento por WhatsApp quando a pessoa pedir, aplica atualizacoes rapidas em objetivos/acoes mensais quando houver alvo claro, formata respostas para WhatsApp e limita respostas longas a blocos curtos.

Funcoes compartilhadas:

- `_shared/auth.ts`: valida sessao, acesso a empresa, owner e escrita por area.
- `_shared/cors.ts`: respostas CORS e JSON.
- `_shared/model.ts`: chamada aos provedores de IA.
- `_shared/pricing.ts`: resolucao de pricing conhecido/automatico no servidor.
- `_shared/transcription.ts`: normalizacao de arquivo de áudio e chamada da API de transcrição da OpenAI, com fallback de modelo.
- `_shared/usage.ts`: calculo e gravacao de consumo de IA.
- `_shared/whatsapp.ts`: normaliza numero e envia texto pela Evolution API/Evo Go.
- `_shared/intent-router.ts`: classifica mensagens em `smalltalk`, `status`, `quick_update`, `start_planning`, `close_period`, `document_question` ou `other`, usando a funcao de IA `background` com fallback deterministico.
- `_shared/periods.ts`: normaliza texto e resolve ano, trimestre e mes vigentes ou citados na mensagem.
- `_shared/quick-updates.ts`: identifica atualizacoes curtas do WhatsApp, escolhe objetivo/acao mensal, pede esclarecimento em caso de ambiguidade, valida permissao e grava status, progresso ou evidencia.
- `_shared/prompt-guides.ts`: guias de comportamento, roteiro e tom do Oraculo empacotados junto das Edge Functions.
- `_shared/conversations.ts`: cria/retoma conversa por pessoa e canal, grava mensagens com dono, carrega historico da conversa e resume historico longo com a funcao `background`.
- `_shared/plan-context.ts`: monta contexto textual do plano, com empresa, objetivos estrategicos, area em foco, plano anual, trimestre vigente, mes vigente, acoes-chave, evidencias e pendencias.
- `_shared/session-engine.ts`: orquestra sessoes de planejamento, historico, prompts, estado e chamadas ao modelo.
- `_shared/proposals.ts`: aplica propostas confirmadas no banco com validacao server-side de permissao.
- `_shared/conductors/`: persona e condutores de Planejamento Estrategico, Plano Trimestral da Area e Plano Mensal.

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

Na Fase 2, `oracle-session` usa `planning` para conduzir sessoes. O modelo responde em envelope JSON com `reply`, `state_patch`, `next_phase`, `proposal` e `done`. O sistema persiste `state`, `phase` e `pending_proposal` em `planning_sessions`.

Na Fase 3, as chamadas de conversa deixam de usar historico geral da empresa. `oracle-chat` e `whatsapp-webhook` carregam apenas a conversa ativa daquele usuario e canal. Quando existem mais de 40 mensagens novas desde o ultimo resumo, `_shared/conversations.ts` usa a funcao `background` para gerar um resumo curto em `conversations.summary`; depois disso, o modelo recebe o resumo e as ultimas mensagens, reduzindo custo e evitando perda de contexto.

O contexto do plano tambem deixa de ser JSON cru. `_shared/plan-context.ts` devolve texto estruturado para a IA, incluindo objetivos, progresso, donos, prazos, entregas e acoes-chave. Isso permite que perguntas como "como está o mês da minha área?" enxerguem tambem as ações-chave, não só os objetivos.

Modo misto de gravacao:

- criar plano, objetivo e acao exige `proposal` + confirmacao;
- ao confirmar, `proposals.ts` valida permissao de owner/coordenador e grava em `strategic_plans`, `area_plans`, `objectives`, `key_actions` e `strategic_projects` conforme o tipo;
- a resposta final so diz que salvou depois da gravacao retornar sem erro.

Plano pronto importado pela tela ou por documento estrategico no WhatsApp segue a mesma regra. O texto extraido/colado entra em `prepareReadyStrategicPlanProposal`, que obriga o modelo a devolver `proposal.type = save_strategic_plan`. Sem clique em "Confirmar e gravar" no app, ou resposta "confirmar" no WhatsApp, nada e persistido como plano estruturado. Os canais permanecem independentes: no app a confirmacao acontece no cartao visual de aprovacao; no WhatsApp a previa vem em texto e a confirmacao acontece por mensagem.

Cada chamada bem-sucedida grava `ai_usage_logs`, com tokens, custo estimado, canal e metadata. A tela de Configuracoes agrega esses logs para acompanhamento de gasto.

Na Fase 4, a funcao `background` tambem virou o classificador operacional do Oraculo. Ela decide a rota da mensagem antes da resposta diaria:

- `start_planning`: cria ou retoma uma `planning_session` para plano estrategico, trimestral ou mensal, no canal em que a pessoa esta falando;
- `quick_update`: usa `_shared/quick-updates.ts` para gravar pequenas atualizacoes de execucao mensal, como conclusao de acao, percentual de objetivo ou evidencia curta;
- `close_period`: responde de forma segura avisando que o fechamento guiado entra na fase seguinte;
- `document_question`: direciona perguntas sobre documentos sem prometer geracao automatica ainda.

Essa camada nao substitui proposta e confirmacao para criar planos. Ela so permite gravacao direta para atualizacoes operacionais pequenas, depois de identificar alvo, tipo de alteracao e permissao do usuario.

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

O WhatsApp tem limite de escopo de produto. Antes de chamar sessoes ou IA diaria, o webhook detecta curiosidades gerais claramente fora do Oraculo, como esporte, guerra, politica ampla, entretenimento ou noticias sem relacao com a empresa. Nesses casos, salva a mensagem, usa a funcao `daily` para gerar uma resposta contextual que reconhece o assunto sem responder o conteudo factual externo, aplica um guia de leveza por categoria de assunto e conduz a pessoa de volta ao planejamento. Em temas sensiveis, como guerra, a resposta nao faz piada sobre sofrimento e usa apenas uma leveza discreta sobre o Oraculo nao ser o canal certo. Se a IA estiver indisponivel, usa fallback variado por tema. Se o tema externo estiver conectado ao negocio, por exemplo risco de mercado, custo, fornecedor ou estrategia da empresa, a conversa continua normalmente.

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
- `coordinator`: escreve apenas no escopo da propria area quando a politica permitir.

As politicas RLS seguem a regra:

- membros da empresa podem ler dados da empresa;
- owners podem escrever em dados administrativos;
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
