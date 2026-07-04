# Decisoes tecnicas

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
