# Decisoes tecnicas

## 2026-07-04 - Escopo de conversa do WhatsApp

Decisao: limitar o WhatsApp do Oraculo a temas de negocio, gestao, administracao, estrategia, planejamento, objetivos, areas, execucao e funcionamento do proprio Oraculo.

Contexto: o WhatsApp pode ser usado como conversa livre, mas o produto nao deve virar assistente geral para Copa do Mundo, guerra, politica ampla, entretenimento ou curiosidades sem relacao com a empresa. Isso desviaria o uso e poderia gerar respostas longas fora do proposito do sistema.

Alternativas: deixar o modelo responder qualquer assunto, confiar apenas no prompt, ou bloquear tudo que mencione temas externos.

Motivo: uma trava deterministica antes da IA evita desvio de proposito. Ao mesmo tempo, a resposta nao pode soar padronizada: quando o assunto e claramente fora de escopo, o webhook usa a funcao `daily` para gerar uma recusa contextual, citando o tema sem responder o conteudo factual externo, e puxa a conversa de volta para gestao/planejamento. Para temas leves, o prompt exige uma piadinha curta ligada ao contexto do assunto; para temas sensiveis, como guerra, a resposta deve ser sobria e nunca fazer piada sobre sofrimento. A regra permite temas externos quando eles estao claramente conectados ao negocio, como risco de mercado, fornecedores, custos ou estrategia.

Consequencias: `whatsapp-webhook` passa a ter funcoes locais de escopo (`isBusinessOrOracleTopic`, `isClearlyGeneralTopic`, `outOfScopeKind`, `outOfScopeHumorGuide`, `buildOutOfScopeReply`, `fallbackOutOfScopeReply`) e o prompt diario tambem reforca a regra. Ajustes futuros de tom ou palavras-chave devem atualizar o runbook e redeployar o webhook.

## 2026-07-04 - WhatsApp operacional com intencao e atualizacoes rapidas

Decisao: executar a Fase 4 da V3 criando uma camada de roteamento de intencao antes da resposta diaria do Oraculo, com suporte a iniciar sessoes de planejamento pelo WhatsApp/app e aplicar atualizacoes operacionais pequenas pelo WhatsApp.

Contexto: depois da memoria por conversa e do contexto textual do plano, o Oraculo ainda respondia como chat. O usuario precisava operar o sistema no dia a dia: pedir para montar plano, avisar que uma acao foi concluida, atualizar progresso ou registrar evidencia sem navegar por telas.

Alternativas: deixar tudo como conversa livre, exigir sempre uso do app, ou permitir que o modelo gravasse qualquer coisa diretamente.

Motivo: classificar intencao antes da resposta deixa o WhatsApp virar canal operacional real sem perder seguranca. Criacao de plano continua passando por sessao e proposta confirmada. Atualizacoes rapidas ficam limitadas a alteracoes pequenas em objetivos/acoes existentes, com validacao server-side de alvo e permissao.

Consequencias: `whatsapp-webhook` e `oracle-chat` agora dependem de `_shared/intent-router.ts`; o WhatsApp tambem usa `_shared/quick-updates.ts` e `_shared/whatsapp.ts` para formatacao e envio em blocos. A funcao `background` passa a ser critica para classificacao e deve ter modelo/chave configurados. Fechamento guiado e documentos padronizados continuam como respostas seguras ate as fases seguintes.

## 2026-07-04 - Memoria por conversa e contexto textual do plano

Decisao: ligar a Fase 3 da V3 ao runtime, usando `conversations` como fio de historico por pessoa/canal e `_shared/plan-context.ts` como fonte textual do plano para a IA.

Contexto: o chat web e o WhatsApp ainda podiam buscar mensagens pelo `org_id`, misturando assuntos de pessoas e canais diferentes. O modelo tambem recebia JSON tecnico de objetivos e planos, sem uma leitura humana clara e com risco de ignorar `key_actions`.

Alternativas: manter historico por empresa, filtrar apenas por canal, guardar contexto todo no frontend, ou criar um prompt diferente por tela sem helper central.

Motivo: conversa por pessoa/canal evita contaminacao; resumo automatico reduz custo e preserva decisoes antigas; contexto textual deixa o modelo entender plano, area, trimestre, mes, donos, prazos, evidencias e acoes-chave sem depender de interpretar schema de banco.

Consequencias: `oracle-chat`, `oracle-session` e `whatsapp-webhook` devem gravar mensagens com `user_id` e `conversation_id`; o painel web passa a carregar as mensagens web do usuario atual; `conversations.summary` e dados de plano devem ser tratados como dados privados da empresa. Quando novas chamadas de IA forem adicionadas, elas devem reutilizar `_shared/conversations.ts` e `_shared/plan-context.ts` em vez de buscar historico geral.

## 2026-07-04 - Fundacao de inteligencia da V3

Decisao: criar uma camada de dados para memoria por conversa, sessoes de planejamento com estado, funcoes de IA por uso e documentos canonicos de plano.

Contexto: a V2 respondia mensagens de forma isolada e usava um unico modelo para todos os usos. O plano da V3 exige que o Oraculo conduza planejamento fase a fase, preserve contexto por pessoa/canal e gere documentos consistentes sem depender de improviso do modelo.

Alternativas: manter historico unico por empresa, guardar estado apenas no frontend, ou criar tabelas separadas somente quando cada tela fosse implementada.

Motivo: preparar a base de forma testavel e sem mudar comportamento visivel. A separacao por conversas evita contaminacao de historico; sessoes persistidas permitem retomar planejamento; funcoes de IA separam modelo caro de planejamento e modelo leve de rotina; documentos canonicos garantem renderizacao deterministica depois.

Consequencias: novas tabelas publicas precisam de RLS e documentacao. As chaves seguem fora do frontend em `public.ai_model_keys`, agora por provedor, preservando a configuracao OpenAI existente.

## 2026-07-04 - Roteador de IA por funcao

Decisao: separar o uso de IA em tres funcoes configuraveis por empresa: `planning`, `daily` e `background`.

Contexto: a V2 usava um unico provider/modelo para conversas, classificacao de documentos e planejamento. Isso dificultava equilibrar qualidade e custo, porque planejamento pede um modelo mais forte e rotinas de bastidor podem usar modelos economicos.

Alternativas: manter um unico modelo global, criar uma configuracao por tela, ou amarrar cada funcao a um provedor fixo.

Motivo: funcoes explicitas deixam o owner escolher custo e qualidade por tipo de trabalho sem expor chaves no frontend. O roteador preserva fallback para `ai_settings`, entao a configuracao OpenAI/gpt-5.4 existente continua funcionando.

Consequencias: `save-ai-settings` aceita payloads de chave por provedor e modelo por funcao; chamadas de IA gravam `metadata.aiFunction`; a tela de Configuracoes passa a exibir quatro provedores e tres funcoes. Ao adicionar provedor novo, e preciso atualizar checks de banco, catalogos de pricing no frontend/servidor e documentacao.

## 2026-07-04 - Motor de sessao com proposta confirmada

Decisao: implementar `oracle-session` como motor server-side para conduzir planejamento estrategico, trimestral e mensal com fase, estado persistido e proposta pendente.

Contexto: a V2 tinha chat livre e criadores manuais. A V3 precisa que o Oraculo conduza fase a fase, lembre o que ja coletou e tenha "maos" para gravar, mas sem gravar automaticamente por interpretacao solta do modelo.

Alternativas: deixar o frontend controlar as fases, usar function calling nativo de cada provedor, ou manter criadores manuais enquanto o chat apenas orienta.

Motivo: estado server-side permite retomar sessoes e cruzar canais no futuro; envelope JSON uniforme funciona com todos os provedores; proposal + confirmacao reduz risco de gravacao indevida.

Consequencias: `planning_sessions` vira tabela critica; prompts de condutores ficam empacotados em TypeScript; `proposals.ts` deve manter validacao server-side de permissao sempre que um novo tipo de proposta for criado.

## 2026-07-04 - Plano pronto entra pela sessao do Oraculo

Decisao: permitir importar ou colar um Plano Estrategico pronto mesmo quando a empresa ainda nao tem plano cadastrado, mas rotear esse conteudo para `oracle-session` em uma acao dedicada (`import_ready_plan`) em vez de gravar direto ou tratar como chat comum.

Contexto: o usuario quer testar o sistema do zero e tambem aproveitar planos existentes em PDF, PPTX, DOCX, TXT ou texto colado. O primeiro desenho enviava o plano como mensagem inicial da sessao, o que deixava a IA livre para apenas revisar o texto e mandar o usuario para outro canal, sem criar objetivos reais no módulo.

Alternativas: manter a importacao escondida ate existir um plano, criar gravacao direta a partir do arquivo, tratar o plano pronto apenas como revisao local sem persistencia, ou manter como mensagem inicial do condutor.

Motivo: reaproveita o motor seguro da Fase 2, mas com um prompt especifico que obriga a saida estruturada `save_strategic_plan`. O arquivo/texto vira insumo da proposta; o Oraculo monta objetivos/projetos rastreaveis e o usuario confirma antes de qualquer escrita estruturada.

Consequencias: o frontend precisa manter a aba "Colar plano pronto" visivel na base zerada e separar "Só revisar texto" de "Gerar proposta e carregar no módulo". Arquivos brutos continuam fora do banco; apenas texto extraido/colado entra na conversa da sessao. O WhatsApp usa o mesmo importador quando o documento for classificado como Plano Estrategico.

## 2026-06-29 - Supabase como backend da V2

Decisao: usar Supabase para autenticacao, banco PostgreSQL, RLS, realtime e Edge Functions.

Contexto: a V2 precisava sair do prototipo frontend puro e ganhar persistencia, contas, permissoes e IA configuravel sem construir um backend completo do zero.

Alternativas: backend Node proprio, Firebase, manter frontend puro.

Motivo: Supabase entrega PostgreSQL, Auth, RLS e funcoes server-side com pouco atrito, mantendo rastreabilidade e seguranca por empresa.

Consequencias: migrations e RLS viram parte critica da manutencao; secrets de servidor precisam ficar nas Edge Functions.

## 2026-06-29 - Netlify para deploy do frontend

Decisao: publicar o frontend no Netlify em `https://oraculo-v2-aize.netlify.app`.

Contexto: o usuario pediu criacao/autenticacao no Netlify com Google e deploy do frontend.

Alternativas: Vercel, Supabase Hosting, servidor proprio.

Motivo: Netlify resolve build estatico do Vite e permite configurar variaveis publicas de ambiente com simplicidade.

Consequencias: rotas internas precisam de fallback SPA em `netlify.toml` e `public/_redirects`.

## 2026-06-29 - Chaves de IA no schema privado

Decisao: salvar chaves de IA em `private.ai_model_keys` e expor publicamente apenas `has_key` e `key_preview`.

Contexto: a V2 permite configurar provider/modelo de IA, mas o frontend nao pode armazenar segredos.

Alternativas: salvar chave em `localStorage`, salvar em tabela publica com RLS, exigir env fixa por projeto.

Motivo: o schema privado acessado somente por Edge Function reduz risco de exposicao pelo cliente.

Consequencias: chamadas ao modelo precisam passar por Edge Functions e usar validacao server-side.

Nota de evolucao: em 2026-07-02 o caminho operacional foi ajustado para `public.ai_model_keys` com RLS/revokes e acesso apenas por `service_role`. A decisao de seguranca permaneceu a mesma: segredo nunca chega ao frontend.

## 2026-07-02 - Tabelas de segredo acessiveis apenas por service role

Decisao: migrar o caminho operacional das chaves para `public.ai_model_keys` e `public.whatsapp_instance_keys`, mantendo RLS habilitado, acesso revogado para `anon` e `authenticated`, e grants apenas para `service_role`.

Contexto: as Edge Functions precisavam acessar chaves de IA e Evolution API de forma previsivel no ambiente hospedado. O desenho inicial usava schema `private`, mas o caminho com tabelas publicas bloqueadas por RLS/revokes ficou mais simples de operar com service role.

Alternativas: manter apenas schema `private`, salvar secrets como environment variables fixas, ou salvar no frontend.

Motivo: preservar a regra de seguranca principal, sem expor segredo ao navegador, e facilitar operacao por Edge Functions.

Consequencias: documentacao e runbook devem citar `public.*_keys` como estado atual. Migrations antigas ainda podem mencionar `private.*_keys` por historico.

## 2026-07-02 - Consumo e pricing de IA rastreaveis

Decisao: adicionar `ai_usage_logs` e pricing por provider/modelo em `ai_settings`.

Contexto: o usuario pediu que o sistema calculasse tokens e valor gasto automaticamente sempre que um modelo fosse usado.

Alternativas: estimar manualmente, deixar custo fora do produto, ou depender apenas do painel do provedor de IA.

Motivo: o dono da empresa precisa ver consumo no proprio Oraculo e entender o impacto financeiro do uso por WhatsApp e web.

Consequencias: toda chamada de IA bem-sucedida deve registrar tokens, custo estimado, canal e modelo. Mudancas de provider/modelo precisam atualizar catalogo de pricing no frontend e na Edge Function.

## 2026-07-02 - WhatsApp salva mensagem antes de chamar IA

Decisao: no `whatsapp-webhook`, salvar a mensagem recebida em `chat_messages` antes da chamada ao modelo.

Contexto: em testes reais, mensagens chegavam mas nao havia resposta quando a funcao quebrava antes de gravar a resposta do Oraculo.

Alternativas: salvar somente depois da resposta, ou confiar apenas nos logs da Evolution/Supabase.

Motivo: diagnostico operacional fica claro: mensagem `user` sem mensagem `oracle` logo depois indica falha em IA, fallback ou envio.

Consequencias: o runbook deve orientar a comparar `chat_messages` e `ai_usage_logs` quando o WhatsApp nao responder.

## 2026-07-02 - Áudio do WhatsApp descriptografado no webhook

Decisao: descriptografar mídia de áudio do WhatsApp dentro do `whatsapp-webhook` quando o Evo Go entregar bytes criptografados em vez de áudio pronto.

Contexto: em teste real, o áudio chegava ao webhook, mas a OpenAI recusava a transcrição com `invalid_request_error`. O codigo tecnico mostrava `application/octet-stream` e assinatura inicial `62f2c82b...`, nao `OggS`, indicando que o arquivo baixado era mídia criptografada do WhatsApp.

Alternativas: exigir que a Evolution devolvesse base64 ja descriptografado, salvar o arquivo para analise manual, consultar logs brutos, ou pedir ao usuario sempre mandar texto.

Motivo: descriptografar em memoria com `mediaKey` evita salvar áudio bruto, reduz dependencia de logs privados e permite que a experiência por WhatsApp aceite áudio de forma natural.

Consequencias: o webhook precisa manter a logica de download da mídia, normalizacao de MIME, descriptografia por HKDF/SHA-256 com info `WhatsApp Audio Keys`, AES-CBC e fallback de transcrição OpenAI. Diagnosticos devem continuar seguros e sem conteudo do áudio.

## 2026-07-02 - Guias do Oraculo empacotados em codigo

Decisao: usar `supabase/functions/_shared/prompt-guides.ts` como fonte empacotada dos guias e do tom do Oraculo nas Edge Functions.

Contexto: a funcao tentava ler arquivos `.md` em runtime, mas esses arquivos nao eram enviados no bundle do deploy.

Alternativas: configurar empacotamento dos `.md`, duplicar prompts em cada funcao, ou manter guias no banco.

Motivo: modulo TypeScript compartilhado e enviado automaticamente no deploy das funcoes, reduzindo risco de quebra.

Consequencias: ajustes de personalidade, roteiro e calibragem da IA devem ser feitos em `prompt-guides.ts` e publicados nas Edge Functions.

## 2026-06-29 - React Query com Context para estado

Decisao: usar React Query para dados remotos e Context/reducer para UI local.

Contexto: o projeto V1 usava estado em memoria. A V2 passou a carregar dados remotos e precisava de refresh consistente.

Alternativas: Redux, Zustand, apenas Context.

Motivo: React Query simplifica cache/refetch de dados Supabase sem adicionar arquitetura pesada.

Consequencias: mutacoes devem invalidar queries ou chamar `refresh` para manter telas coerentes.

## 2026-06-29 - Documentacao minima de manutencao

Decisao: manter README, AGENTS, docs de arquitetura, seguranca, runbook, decisoes e changelog.

Contexto: o projeto passou de prototipo para V2 publicada e precisa ser recuperavel por IA ou humano.

Alternativas: documentar apenas no chat.

Motivo: chats se perdem; arquivos versionaveis mantem contexto operacional.

Consequencias: mudancas de arquitetura, ambiente, deploy e seguranca devem atualizar docs no mesmo ciclo.
