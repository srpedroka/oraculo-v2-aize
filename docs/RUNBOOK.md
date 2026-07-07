# Runbook

Manual rapido para quando precisar rodar, diagnosticar ou recuperar o Oraculo V2.

Para saber onde ficam contas, chaves, secrets e URLs administrativas, leia tambem `docs/ACCESS.md`.

## Rodar localmente

1. Conferir `.env`.
2. Instalar dependencias:

```bash
pnpm install
```

3. Subir app:

```bash
pnpm run dev
```

4. Abrir a URL mostrada pelo Vite.

## Checar se esta saudavel

```bash
pnpm run lint
pnpm run build
```

Se ambos passarem, o frontend esta tipado e gera build de producao.

## Problema: tela "Supabase nao configurado"

Causa provavel: `.env` ausente ou variaveis vazias.

Verifique:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Depois reinicie o servidor local.

## Problema: login entra, mas nao carrega empresa

Possiveis causas:

- usuario sem membership;
- onboarding nao criou empresa;
- RLS bloqueando leitura;
- Supabase indisponivel.

Diagnostico:

1. abrir console do navegador;
2. conferir erros de rede;
3. verificar tabelas `organizations` e `memberships` no Supabase;
4. confirmar se o usuario tem linha em `profiles`.

## Convites por email

O app usa a Edge Function `invite-member`, que chama `inviteUserByEmail` no Supabase Auth. Para o email chegar de verdade, configure SMTP no painel do Supabase:

1. Acesse Supabase Auth > Emails/SMTP.
2. Conecte um provedor transacional, por exemplo Resend, Postmark ou SendGrid.
3. Configure remetente, host, porta, usuario e senha do SMTP.
4. Envie um convite pela tela Configuracoes > Pessoas.
5. Confira logs de Auth e da Edge Function `invite-member` se o email nao chegar.

Sem SMTP, o vinculo pode ser criado no banco, mas o email de convite pode nao ser entregue.

## Recuperacao de senha

A tela de entrada tem o link "Esqueci minha senha".

Fluxo esperado:

1. A pessoa informa o email.
2. O Supabase envia o link de redefinicao para o email.
3. O link abre `/redefinir-senha`.
4. A pessoa informa e confirma a nova senha.

Se o email nao chegar, verifique a configuracao SMTP do Supabase Auth. Sem SMTP transacional configurado, o pedido pode ser aceito pelo app, mas o email pode nao ser entregue.

Troca administrativa emergencial:

1. Confirme o email correto em `auth.users` e o papel em `memberships`.
2. Altere a senha no Supabase Auth ou por consulta administrativa controlada.
3. Nao registre a senha em arquivos, docs, Git, prints ou historico de runbook.
4. Oriente a pessoa a entrar e trocar para uma senha propria depois.

## Problema: acesso negado em escrita

Possiveis causas:

- usuario nao e `owner`;
- coordenador tentando alterar outra area;
- `area_id` nulo em uma acao que exige area;
- politica RLS inconsistente.

Verifique:

- `memberships.role`;
- `areas.coordinator_id`;
- funcoes RLS em `supabase/migrations/20260629150200_auth_rls.sql`.

## Problema: rota direta no Netlify nao abre

Causa provavel: fallback SPA ausente no deploy.

Arquivos obrigatorios:

- `netlify.toml`
- `public/_redirects`

Depois rode build e publique novamente.

## Problema: Oraculo nao responde com IA real

Possiveis causas:

- empresa sem chave configurada;
- chave invalida;
- provider/modelo incorreto na funcao usada (`daily`, `planning` ou `background`);
- erro em Edge Function;
- usuario sem membership.

Comportamento esperado: se nao houver chave, `oracle-chat` usa fallback deterministico.

Verifique:

- `public.ai_settings.has_key`;
- `public.ai_settings.key_preview`;
- existencia de linha em `public.ai_model_keys` para o provider da funcao;
- `public.ai_function_settings` para saber qual provider/modelo a funcao usa;
- `public.ai_provider_key_status` para conferir preview sem abrir a chave real;
- logs da Edge Function `oracle-chat`.

Para consumo:

1. Envie uma mensagem pequena para o Oraculo.
2. Confira `public.ai_usage_logs` filtrando por `org_id`.
3. Se houver resposta mas nao houver log, verifique `recordAiUsage` e o retorno de `usage` do provider.
4. Se nao houver resposta, consulte logs da Edge Function e veja se a chamada ao modelo falhou.

## Problema: Oraculo mistura assuntos ou esquece contexto recente

Fluxo esperado da Fase 3:

1. `oracle-chat` cria ou retoma uma conversa `web` para o usuario logado.
2. `whatsapp-webhook` cria ou retoma uma conversa `whatsapp` para o perfil identificado pelo celular.
3. Toda mensagem principal de chat recebe `user_id` e `conversation_id`.
4. A IA recebe somente o historico daquela conversa, mais `conversations.summary` quando a conversa ficou longa.

Verifique:

```sql
select id, user_id, channel, summary is not null as has_summary, summary_upto, last_message_at
from public.conversations
where org_id = '<ORG_ID>'
order by last_message_at desc
limit 20;
```

```sql
select author, channel, user_id, conversation_id, left(text, 120) as text, created_at
from public.chat_messages
where org_id = '<ORG_ID>'
order by created_at desc
limit 40;
```

Se duas pessoas se contaminarem, confira se as mensagens estão com `user_id` diferente e `conversation_id` diferente. Se web e WhatsApp da mesma pessoa se misturarem, confira se `channel` está separado em `conversations`. Se a conversa passar de 40 mensagens novas e `summary` continuar vazio, confira `public.ai_function_settings` da função `background`, chave do provedor e logs de `ai_usage_logs.metadata.action = 'conversation_summary'`.

## Problema: Oraculo nao enxerga ações-chave do mês

Fluxo esperado da Fase 3:

1. `_shared/plan-context.ts` monta o contexto textual do plano.
2. Para foco mensal, o contexto inclui objetivos mensais do período vigente e suas `key_actions`.
3. Cada ação aparece com status, dono, prazo e critério de conclusão.

Verifique se existem objetivos mensais e ações no período vigente:

```sql
select id, title, period, area_id
from public.objectives
where org_id = '<ORG_ID>' and level = 'monthly'
order by created_at desc;
```

```sql
select objective_id, description, owner, deadline, status
from public.key_actions
where org_id = '<ORG_ID>'
order by created_at desc;
```

Se os dados existem mas a IA não cita ações, revisar `_shared/plan-context.ts`, o `areaId` enviado pelo canal e o foco usado: `monthly` para execução mensal, `quarterly` para trimestre e `org` para visão geral.

## Problema: WhatsApp nao inicia plano ou nao aplica atualizacao rapida

Fluxo esperado da Fase 4:

1. `whatsapp-webhook` salva a mensagem em `chat_messages`.
2. `_shared/intent-router.ts` usa a funcao de IA `background` para classificar a mensagem.
3. Se a intencao for `start_planning`, o webhook chama `startPlanningSession` e responde no proprio WhatsApp.
4. Se a intencao for `quick_update`, `_shared/quick-updates.ts` carrega objetivos/acoes do mes, identifica o alvo, valida permissao e grava a alteracao.
5. Se houver duvida, o Oraculo pede esclarecimento em vez de gravar.

Verifique se a classificacao esta rodando:

```sql
select metadata ->> 'action' as action, metadata ->> 'aiFunction' as ai_function,
       channel, total_tokens, total_cost_usd, created_at
from public.ai_usage_logs
where org_id = '<ORG_ID>'
order by created_at desc
limit 30;
```

Procure `intent_classification` e, para atualizacao rapida, `quick_update_extract`. Se nao aparecerem, confira a configuracao da funcao `background`, chave do provedor e logs do `whatsapp-webhook`.

Verifique se existe sessao de planejamento criada:

```sql
select type, period, phase, status, user_id, area_id, created_at
from public.planning_sessions
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

Verifique candidatos de execucao mensal:

```sql
select id, title, level, period, area_id, status, progress
from public.objectives
where org_id = '<ORG_ID>'
order by created_at desc;
```

```sql
select id, objective_id, description, status, owner, deadline
from public.key_actions
where org_id = '<ORG_ID>'
order by created_at desc;
```

Se a pessoa responder apenas "1" depois de uma pergunta de ambiguidade:

- para concluir, isso basta;
- para progresso, ela deve responder com percentual, por exemplo `1 60%`;
- para evidencia, ela deve responder com a evidencia, por exemplo `1 contrato assinado hoje`.

Se o sistema pedir percentual ou evidencia depois da escolha, isso e comportamento seguro: ele encontrou o alvo, mas faltou dado para gravar.

Limites atuais:

- perguntas sobre documentos buscam `public.plan_documents` e enviam o resumo nativo pelo WhatsApp; se nao houver documento salvo, o Oraculo orienta criar/importar o plano;
- atualizacao rapida grava apenas status/progresso/evidencia em objetivo/acao existente, nao cria plano novo.

## Problema: fechamento de mes ou trimestre nao inicia/grava

Fluxo esperado da Fase 5:

1. Pelo WhatsApp ou app, a pessoa pede "fechar o mes" ou "fechar o trimestre".
2. Se nao houver departamento em foco, o Oraculo pergunta qual departamento fechar.
3. `oracle-session` cria uma sessao `month_close` ou `quarter_close` com o periodo encerrado.
4. A IA conduz revisao, evidencias, aprendizados e decisoes de pendencia.
5. No resumo, a sessao cria `pending_proposal` do tipo `month_close` ou `quarter_close`.
6. Ao confirmar, `proposals.ts` valida permissao e grava objetivos/acoes/evidencias/check-in.
7. Depois de gravar, o Oraculo oferece abrir o proximo ciclo.

Verifique:

```sql
select type, period, phase, pending_proposal is not null as has_proposal, status, created_at
from public.planning_sessions
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

```sql
select period, area_id, summary, created_at
from public.check_ins
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

Se nao grava, confira se a proposta tem IDs reais de objetivos/acoes. O contexto enviado por `_shared/plan-context.ts` precisa incluir IDs. Se o owner pedir fechamento sem area, use o cartao do Dashboard/Execucao ou informe o departamento.

## Problema: documento padrao nao aparece ou nao exporta PDF

Fluxo esperado da Fase 6:

1. Uma sessao de plano ou fechamento gera `pending_proposal`.
2. A pessoa confirma no app ou responde `confirmar` no WhatsApp.
3. `proposals.ts` valida permissao e grava os dados do plano/fechamento.
4. `proposals.ts` chama `_shared/plan-documents.ts`, que monta o `content` canonico e insere uma linha em `public.plan_documents`.
5. A tela `/documentos` lista o documento por tipo, departamento e periodo.
6. A rota `/documentos/<DOCUMENT_ID>/imprimir` renderiza apenas o documento e o botao "Imprimir ou salvar PDF" abre o dialogo do navegador.
7. No WhatsApp, perguntas como "me manda o plano do mês do Comercial" usam `_shared/plan-render.ts` para enviar o documento em blocos.

Verifique se o documento foi gerado:

```sql
select id, type, period, title, version, area_id, session_id, created_at
from public.plan_documents
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

Se nao houver linha:

- confira se a proposta foi realmente confirmada;
- confira logs de `oracle-session` e erro em `applyProposal`;
- confira se a proposta tem `type` suportado: `save_strategic_plan`, `save_quarterly_plan`, `save_monthly_plan`, `month_close` ou `quarter_close`;
- confira permissao: owner grava documento geral e coordenador grava documento da propria area.

Se houver linha mas nao aparece no app:

- confira RLS de `public.plan_documents`;
- confira se o usuario e membro da empresa;
- atualize a tela `/documentos`;
- confira se o realtime/invalidation chegou ou use logout/login para forcar reload.

Se o PDF sair com layout ruim:

- use a rota de impressao, nao a tela normal com sidebar;
- confira CSS de impressao em `src/index.css`;
- confira blocos em `src/components/PlanDocument.tsx`, especialmente classes `plan-document-section` e `plan-document-block`;
- planos mensais muito longos podem passar para segunda pagina; isso e aceitavel se a quebra estiver limpa.

## Problema: convite de virada de mes nao chega

Fluxo esperado:

1. A funcao `month-turn` roda no dia 1.
2. Ela busca o mes encerrado e areas com objetivos mensais sem check-in.
3. Se WhatsApp estiver ativo, envia convite para owners e coordenador da area.
4. Sem WhatsApp configurado, o Dashboard continua exibindo o cartao de fechamento pendente porque nao existe check-in daquele periodo.

Configurar agendamento no Supabase Cron, usando um segredo salvo em `MONTH_TURN_SECRET`:

```sql
select cron.schedule(
  'oraculo-month-turn',
  '0 11 1 * *',
  $$
  select net.http_post(
    url := 'https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/month-turn',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oraculo-cron-secret', '<MONTH_TURN_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Nao registrar o valor real do segredo no Git, docs ou chat.

Estado operacional em 2026-07-04: o segredo `MONTH_TURN_SECRET` foi salvo no Supabase e o cron `oraculo-month-turn` foi agendado para o dia 1 de cada mes, 11:00 UTC.

## Problema: WhatsApp responde ou nao responde assuntos fora do Oraculo

Comportamento esperado:

- Perguntas claramente fora do escopo, como Copa do Mundo, guerra sem relacao com a empresa, politica ampla, entretenimento ou noticias gerais, recebem uma resposta curta e contextual. O Oraculo deve reconhecer o assunto citado, mas nao responder o conteudo factual externo.
- A resposta deve variar conforme a mensagem e puxar a conversa de volta para planejamento, objetivos, areas, execucao, gestao ou estrategia. Em temas leves, como futebol, culinaria ou entretenimento, a IA deve usar uma piadinha curta ligada ao proprio assunto. Em temas sensiveis, como guerra, nao deve fazer piada sobre sofrimento; use apenas uma leveza discreta sobre o Oraculo nao ser o canal certo.
- O Oraculo nao deve misturar assuntos de exemplo do prompt. Se a pessoa falou de receita, a resposta nao pode citar Copa, guerra ou fofoca. Se a pessoa falou de Copa, a resposta nao pode puxar guerra ou entretenimento. A piada deve nascer do assunto atual e nao de uma frase padrao.
- Temas externos com relacao clara ao negocio continuam permitidos. Exemplo: "como a guerra impacta meus custos de fornecedor?" deve ser tratado como risco/estrategia, nao como curiosidade geral.

Onde revisar:

- `supabase/functions/whatsapp-webhook/index.ts`, funcoes `isBusinessOrOracleTopic`, `isClearlyGeneralTopic`, `outOfScopeKind`, `outOfScopeHumorGuide`, `buildOutOfScopeReply` e `fallbackOutOfScopeReply`.
- `WHATSAPP_DAILY_FORM_RULES`, que tambem orienta a IA diaria a manter o escopo.

Se bloquear demais, adicione termos de negocio em `isBusinessOrOracleTopic`. Se deixar passar curiosidade geral demais, adicione termos em `isClearlyGeneralTopic`. Se a resposta estiver repetitiva ou com humor fora de contexto, revise `detectedOutOfScopeCategories`, `outOfScopeKind`, `outOfScopeHumorGuide`, `answerMentionsUndetectedTopic` e o prompt de `buildOutOfScopeReply`; ela usa a funcao `daily`, grava uso em `ai_usage_logs.metadata.action = 'out_of_scope_redirect'` e tem fallback variado quando a IA falha. Depois publique `whatsapp-webhook` novamente.

## Configurar funcoes de IA da V3

1. Abra Configuracoes > IA do Oraculo.
2. Em Chaves por provedor, salve a chave do provedor desejado.
3. Em Funcoes de IA, escolha:
   - Planejamento e fechamentos: modelo mais forte.
   - Conversa do dia a dia: modelo rapido e com bom custo.
   - Bastidores: modelo economico para classificacao e resumos.
4. Salve cada funcao separadamente.
5. Envie uma mensagem curta no painel ou WhatsApp.
6. Confira `public.ai_usage_logs.metadata.aiFunction` ou o painel de consumo para confirmar qual funcao foi usada.

Observacoes:

- OpenAI/gpt-5.4 existente foi preservado como default das tres funcoes ao iniciar a V3.
- xAI/Grok usa endpoint compativel com Chat Completions.
- A transcricao de audio do WhatsApp continua usando chave OpenAI cadastrada, mesmo que a conversa diaria use outro provedor.

## Problema: sessao do Oraculo nao avanca ou nao grava

Fluxo esperado da Fase 2:

1. Usuario clica em "Planejar o ano/trimestre/mes com o Oraculo".
2. `oracle-session` cria uma linha em `public.planning_sessions` com `status = active`.
3. Cada resposta do usuario chama `oracle-session` com `action = message`.
4. O modelo retorna envelope JSON e o servidor atualiza `phase`, `state` e, quando houver, `pending_proposal`.
5. O painel mostra "Pronto para gravar".
6. Ao clicar em Confirmar, `action = confirm` chama `proposals.ts`, grava os dados e marca a sessao como `completed`.

Verifique:

```sql
select type, period, phase, status, pending_proposal is not null as has_proposal, created_at, completed_at
from public.planning_sessions
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

Se a conversa responde mas nao grava:

- conferir se `pending_proposal` existe;
- conferir se o usuario clicou em Confirmar e gravar;
- conferir permissao do usuario em `memberships`;
- para coordenador, conferir se `areas.coordinator_id` aponta para a membership correta;
- conferir `public.ai_usage_logs.metadata.sessionType` e `metadata.phase` para saber em que fase a IA parou.

Se a IA devolver texto solto em vez de JSON, o sistema mostra a resposta, mas nao avanca fase nem grava proposta. Nesse caso, revisar prompt/condutor da fase ou pedir ao usuario para responder de forma mais objetiva.

## Problema: plano existe, mas nao consigo operar objetivos, numeros ou areas

Fluxo esperado depois da importacao ou criacao de objetivos:

1. Em Dashboard, cards de Resultado/Evolucao que tenham objetivo ligado mostram "Editar".
2. Em Plano Estrategico, cada objetivo estrategico mostra "Editar"; owners tambem veem "Novo objetivo".
3. Em Planos Trimestrais, o owner ou coordenador da area pode criar objetivo trimestral diretamente no card da area.
4. Em Areas, o owner cria areas/departamentos e vincula coordenadores. Coordenadores e membros sem permissao veem a tela em modo leitura.
5. No detalhe da area, a aba aberta define o nivel do novo objetivo: Anual da Area, Trimestral ou Mensal.

Campos principais do editor:

- `Valor atual`: alimenta cards de Resultado, como faturamento ou margem.
- `Meta`: mostra o alvo do indicador.
- `Tendencia`: controla Alta, Estavel ou Queda.
- `Status`: controla No Prazo, Em Risco, Atrasado ou Concluido.
- `Progresso`: controla o percentual e a barra de avanço.
- `Evidencia`: descreve o que prova o avanço.

Observacao: "Direcao inicial" e uma regua de clareza/concretude do objetivo, nao o percentual de execucao. O percentual de execucao e o campo `Progresso`.

## Problema: importacao de plano pronto nao vira proposta

Fluxo esperado pela tela Plano Estrategico:

1. Usuario abre Plano Estrategico.
2. Mesmo sem plano cadastrado, a tela mostra "Importar plano pronto".
3. Usuario cola texto ou importa PDF, PPTX, DOCX ou TXT.
4. O navegador extrai texto e preenche o campo "Plano existente".
5. Usuario escolhe uma das duas rotas:
   - "Só revisar texto": revisa lacunas no navegador, sem gravar e sem chamar IA.
   - "Gerar proposta e carregar no módulo": envia o texto para o Oraculo estruturar.
6. O frontend chama `oracle-session` com `action = import_ready_plan`, enviando `orgId`, `period`, `planText`, `fileName` e `channel = web`.
7. A Edge Function usa a funcao de IA `planning`, monta uma proposta `save_strategic_plan` e salva em `public.planning_sessions.pending_proposal`.
8. O painel lateral mostra o cartao "Pronto para gravar" com previa estruturada: ano, tema, direcionadores, objetivos, projetos, contagem de SWOT/rituais e campos que ficaram em branco por nao estarem explicitos.
9. Somente "Confirmar e gravar" aplica a proposta no banco. "Descartar" abandona a sessao sem gravar; "Ajustar" deixa a pessoa pedir mudanças por conversa.

Verifique:

- se o arquivo tem formato suportado: PDF com texto selecionavel, PPTX, DOCX ou TXT;
- se o texto aparece no campo antes de enviar ao Oraculo;
- se existe uma sessao ativa em `public.planning_sessions` com `type = 'strategic'`;
- se `public.chat_messages` recebeu a mensagem grande do usuario com `conversation_id`;
- se `public.ai_usage_logs.metadata.aiFunction = 'planning'` e `metadata.action = 'ready_plan_import'` apareceram depois do envio;
- se `pending_proposal` fica preenchido antes de confirmar.
- se um teste gerou proposta ficticia, use "Descartar" no cartao antes de encerrar.
- se o fluxo nasceu no app, ele deve continuar no app. Qualquer resposta mandando a pessoa para WhatsApp ou para outra tela indica regressao em `prepareReadyStrategicPlanProposal` ou no prompt de importacao.

Consulta util:

```sql
select type, period, phase, pending_proposal is not null as has_proposal, status, created_at
from public.planning_sessions
where org_id = '<ORG_ID>'
order by created_at desc
limit 10;
```

Limites atuais:

- arquivo escaneado ou imagem dentro de PDF pode nao ter texto extraivel;
- a importacao pelo app aceita PDF, PPTX, DOCX e TXT ate 80 MB; arquivos maiores devem ser compactados ou convertidos para texto antes de importar;
- arquivos acima de 30 MB podem demorar porque a extracao roda no navegador da pessoa;
- textos muito longos sao cortados pelo frontend e pela Edge Function antes de entrar no modelo para proteger o contexto da IA;
- o fluxo estrategico importa Plano Estrategico. Plano Trimestral tambem pode ser importado pela tela Planos Trimestrais, escolhendo antes o departamento. Pelo WhatsApp, documentos classificados como Estrategico, Trimestral ou Mensal geram proposta estruturada e continuam exigindo `confirmar`.
- plano pronto aprovado deve ser preservado. O Oraculo pode estruturar trechos implicitos como objetivos, mas nao deve inventar KPI, meta, prazo, responsavel, diagnostico ou projeto que o documento nao trouxe.

## Problema: arquivo anexado no chat do app nao funciona

Fluxo esperado:

1. Usuario abre o painel lateral do Oraculo.
2. Clica no icone de anexo ao lado do campo de mensagem.
3. Seleciona PDF, PPTX, DOCX ou TXT.
4. O navegador extrai o texto com `src/lib/fileImport.ts`.
5. Se houver sessao ativa, o texto entra como mensagem da sessao via `oracle-session`.
6. Se nao houver sessao ativa, o texto entra como mensagem do chat via `oracle-chat`.

Verifique:

- se o arquivo tem formato suportado e texto selecionavel;
- se o painel mostra erro de formato, tamanho ou falta de texto extraivel;
- se `chat_messages` recebeu mensagem começando por `Arquivo anexado no chat do app`;
- se a chamada de IA aparece em `ai_usage_logs` para `daily` ou `planning`, conforme havia ou nao sessao ativa;
- se nenhum arquivo bruto foi salvo no banco. O esperado e salvar apenas texto extraido na conversa.

## Problema: importacao de Plano Trimestral nao vira proposta

Fluxo esperado pela tela Planos Trimestrais:

1. Usuario abre Planos Trimestrais.
2. Escolhe o departamento correto.
3. Clica em "Importar plano".
4. Seleciona PDF, PPTX, DOCX ou TXT.
5. O frontend extrai texto e chama `oracle-session` com `action = import_ready_quarterly_plan`, enviando `orgId`, `areaId`, `period`, `planText`, `fileName` e `channel = web`.
6. A Edge Function usa a funcao de IA `planning`, monta uma proposta `save_quarterly_plan` e salva em `planning_sessions.pending_proposal`.
7. O painel lateral mostra o cartao "Pronto para gravar" com previa de papel da area, diagnostico, objetivos anuais, objetivos trimestrais, entregas e lacunas.
8. Somente "Confirmar e gravar" aplica a proposta no banco.

Verifique:

- se existe area/departamento cadastrado e se o usuario tem permissao de owner ou coordenador daquela area;
- se o arquivo tem texto extraivel;
- se existe sessao ativa em `public.planning_sessions` com `type = 'quarterly'`, `area_id` do departamento e `period = 'Q3 2026'`;
- se `pending_proposal` tem `type = 'save_quarterly_plan'`;
- se `public.ai_usage_logs.metadata.action = 'ready_quarterly_plan_import'` apareceu depois do envio;
- se o cartao de aprovacao aparece no painel lateral. Se nao aparecer, confira se outra sessao ativa antiga esta prendendo o painel e use "Descartar" nela.

Consulta util:

```sql
select type, period, area_id, phase, pending_proposal ->> 'type' as proposal_type, status, created_at
from public.planning_sessions
where org_id = '<ORG_ID>'
order by created_at desc
limit 10;
```

## Como adicionar check-in na Execucao Viva

Na Fase 5, check-in nao e mais um registro solto. Ele nasce do fechamento mensal guiado:

1. Abra Execucao Viva.
2. No bloco "Check-in e fechamento mensal", escolha a area.
3. Clique em "Adicionar check-in".
4. O Oraculo abre uma sessao `month_close` para o mes encerrado.
5. Responda a revisao de objetivos, evidencias, aprendizados e pendencias.
6. Quando aparecer o cartao "Pronto para gravar", clique em "Confirmar e gravar".
7. `proposals.ts` cria o registro em `check_ins`, atualiza objetivos/acoes e registra evidencias permitidas.

Se nao aparecer check-in:

- confira se existem objetivos mensais para o periodo indicado;
- confira se a sessao `month_close` tem `pending_proposal`;
- confira se o usuario confirmou a proposta;
- consulte `public.check_ins` filtrando por `area_id` e `period`.

## Problema: WhatsApp recebeu mensagem mas nao respondeu

Diagnostico rapido:

1. Verifique `public.chat_messages` filtrando por `channel = 'whatsapp'`.
2. Se a mensagem `user` apareceu e nao existe resposta `oracle` logo depois, a falha ocorreu dentro do `whatsapp-webhook` antes do envio da resposta.
3. Confira `public.ai_usage_logs` para saber se a chamada de IA chegou a acontecer.
4. Se nao houver uso de IA, verifique provider/modelo, chave em `public.ai_model_keys` e logs da Edge Function.
5. Se houver resposta `oracle` no banco mas ela nao chegou no celular, verifique Evolution API/Evo Go, instancia conectada, endpoint de envio e chave da Evolution.
6. Se a mensagem nem apareceu em `chat_messages`, verifique webhook configurado na Evolution, segredo `x-oraculo-webhook-secret`, URL publica e instancia conectada.

## Problema: áudio do WhatsApp nao transcreve

Fluxo esperado:

1. Evolution envia mensagem com `audioMessage` para `whatsapp-webhook`.
2. O webhook tenta obter o arquivo por base64 no payload, URL direta ou endpoint de mídia da Evolution/Evo Go.
3. Se a mídia vier criptografada pelo WhatsApp, o webhook usa a `mediaKey` do `audioMessage` para descriptografar.
4. O arquivo e normalizado para um MIME real de áudio, por exemplo `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/wav` ou `audio/webm`.
5. O áudio e enviado para OpenAI `gpt-4o-mini-transcribe`; se o modelo recusar por formato/modelo, tenta `whisper-1` como fallback.
6. O texto final e salvo em `chat_messages` como `[Áudio transcrito] ...`.
7. O texto transcrito entra no mesmo fluxo de resposta do Oraculo.

Historico da correcao de 2026-07-02:

- Sintoma inicial: o usuario recebia "Recebi seu áudio, mas ainda não consegui transcrever por aqui".
- Primeiro diagnostico: o áudio chegava no webhook, mas a mídia nao era baixada da Evolution.
- Ajuste feito: o webhook passou a tentar a rota real do Evo Go `/message/downloadimage` e a aceitar retorno como JSON, base64, URL ou binario.
- Segundo diagnostico: a OpenAI recusava o arquivo com `invalid_request_error`.
- Codigo tecnico observado: `file:application/octet-stream>audio/ogg:...`.
- Ajuste feito: o arquivo baixado passou a ser normalizado por assinatura de bytes, pois o Evo pode devolver `application/octet-stream`.
- Terceiro diagnostico: a assinatura vinha como `62f2c82b...`, nao como `OggS`. Isso indicava mídia criptografada do WhatsApp, nao áudio pronto.
- Ajuste final: o webhook passou a descriptografar mídia de áudio usando HKDF/SHA-256 com info `WhatsApp Audio Keys`, AES-CBC, `mediaKey` do payload e remoção do MAC final de 10 bytes. Depois disso, o arquivo descriptografado segue para a OpenAI.

Codigos tecnicos de falha:

- `no-audio-info`: o payload nao foi reconhecido como áudio.
- `url:<status>`: a URL direta de mídia nao baixou.
- `/message/downloadimage:<status>:<content-type>`: a rota do Evo Go nao retornou mídia.
- `json:<shape>` ou `binary-json:<shape>`: o Evo retornou JSON sem campo reconhecido de arquivo, base64 ou URL.
- `binary-base64`: o webhook detectou base64 disfarçado de binario e tentou decodificar.
- `decrypt:no-media-key`: a mídia parecia criptografada, mas o payload nao trouxe `mediaKey`.
- `decrypt:error:<tipo>`: falha ao descriptografar a mídia do WhatsApp.
- `decrypt:ok:<ascii>:<hex>`: descriptografia funcionou; o começo esperado para OGG e `OggS` / `4f676753`.
- `file:<tipo_original>><tipo_normalizado>:<bytes>:sig:<ascii>:<hex>`: mostra o tipo antes/depois da normalizacao e a assinatura curta do arquivo. Nao contem conteúdo do áudio.
- `openai:<status>:<code>`: a OpenAI recusou a transcrição.
- `transcription-error`: falha final na etapa de transcrição.

Verifique:

- se a mensagem aparece como `[Áudio transcrito]` em `chat_messages`;
- se existe chave OpenAI ativa em `public.ai_model_keys`;
- se a instancia da Evolution permite baixar mídia/base64 pela rota `/message/downloadimage`;
- se o payload de áudio traz `mediaKey`, `mimetype` e dados de mídia suficientes;
- se o codigo tecnico mostra `decrypt:ok` antes da chamada OpenAI;
- se a pessoa consegue reenviar o áudio ou mandar em texto quando aparecer a resposta de falha.

Evite consultar logs brutos de producao quando houver alternativa. Logs crus podem conter conteudo privado de mensagens ou URLs temporarias. Prefira usar os codigos tecnicos seguros exibidos na resposta de falha.

Observacao: o custo da resposta textual entra em `ai_usage_logs`. O custo específico da transcrição de áudio ainda não entra no cálculo tokenizado, porque o provedor precifica áudio por duração/modelo, não pelos mesmos campos de tokens de texto.

## Problema: arquivo enviado pelo WhatsApp nao direciona o plano

Fluxo esperado:

1. Evolution envia uma mensagem com `documentMessage` para `whatsapp-webhook`.
2. O webhook baixa o arquivo por base64, URL direta ou rota `/message/downloadimage`.
3. Se o arquivo vier como mídia criptografada do WhatsApp, o webhook descriptografa em memoria com `mediaKey` e info `WhatsApp Document Keys`.
4. O webhook extrai texto de `TXT`, `PPTX`, `DOCX` ou `PDF` com texto selecionavel.
5. A IA classifica o documento como `strategic`, `quarterly`, `monthly`, `evidence` ou `unknown`.
6. Se for `strategic`, o webhook chama `prepareReadyStrategicPlanProposal`, cria/atualiza uma sessao estrategica ativa e responde com previa textual dos objetivos, projetos e lacunas. A pessoa confirma respondendo `confirmar`.
7. Se for `quarterly`, o webhook tenta identificar o departamento, chama `prepareReadyQuarterlyPlanProposal` e responde com previa textual dos objetivos trimestrais. A pessoa confirma respondendo `confirmar`.
8. Se for `monthly`, o webhook tenta identificar o departamento, chama `prepareReadyMonthlyPlanProposal` e responde com previa textual dos objetivos mensais e acoes-chave. A pessoa confirma respondendo `confirmar`.
9. Se faltar departamento, o Oraculo pergunta qual departamento usar antes de montar a proposta.
10. Se for `evidence` ou `unknown`, o Oraculo ainda responde com pergunta de direcionamento, sem gravar automaticamente.

Limite atual:

- O WhatsApp cria proposta estruturada para Plano Estrategico, Trimestral e Mensal.
- Evidencias por arquivo ainda nao criam dados estruturados automaticamente.
- Nenhum arquivo grava plano sem confirmação explícita do usuario e validação server-side.
- PDF escaneado ou PDF muito comprimido pode nao ter texto extraível; nesse caso, orientar a enviar uma versao com texto selecionavel ou importar pela tela do Plano Estratégico.

Verifique:

- se a mensagem aparece em `chat_messages` como `[Arquivo recebido]`;
- se a resposta informa `Plano Estratégico`, `Planos Trimestrais`, `Plano Mensal` ou `Evidência`;
- se existe registro em `ai_usage_logs` com `metadata.action = document_classification`;
- para Plano Estratégico, se existe registro em `ai_usage_logs` com `metadata.action = ready_plan_import`;
- para Plano Estratégico, se `public.planning_sessions.pending_proposal` foi preenchido;
- se o arquivo tem extensao e MIME compatíveis: PDF, PPTX, DOCX ou TXT;
- se a rota `/message/downloadimage` da Evo continua baixando documentos.

Consultas uteis no Supabase SQL editor:

```sql
select author, channel, left(text, 300) as text, created_at
from public.chat_messages
where org_id = '<ORG_ID>'
  and channel = 'whatsapp'
order by created_at desc
limit 20;
```

```sql
select provider, model, channel, prompt_tokens, completion_tokens, total_tokens, total_cost_usd, created_at
from public.ai_usage_logs
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

Para incluir a funcao de IA:

```sql
select provider, model, metadata ->> 'aiFunction' as ai_function, channel, total_tokens, total_cost_usd, created_at
from public.ai_usage_logs
where org_id = '<ORG_ID>'
order by created_at desc
limit 20;
```

## Configurar WhatsApp real

O app envia e recebe WhatsApp pela Evolution API/Evo Go hospedada fora do Oraculo. A hospedagem e o pareamento do numero sao manuais.

1. Hospede a Evolution API em ambiente proprio.
2. Crie uma instancia e escaneie o QR Code com o aparelho que sera usado.
3. No Oraculo, abra Configuracoes > WhatsApp.
4. Preencha URL da Evolution API, nome da instancia, numero conectado, chave da Evolution API e um segredo forte de webhook.
5. Copie a URL do webhook exibida na tela.
6. Configure a Evolution API para enviar mensagens recebidas para essa URL.
7. Envie no webhook o cabecalho `x-oraculo-webhook-secret` com o mesmo segredo salvo.
8. Cadastre o celular da pessoa na conta dela ou no convite.

Convites seguem esta regra:

- se WhatsApp estiver ativo e o convite tiver celular, o Oraculo gera um link de convite do Supabase e envia pelo WhatsApp;
- se WhatsApp nao estiver ativo ou o convite nao tiver celular, o Oraculo usa o convite por email do Supabase.

Sem a Evolution API hospedada e sem QR pareado, o painel do sistema continua funcionando, mas o WhatsApp real nao recebe mensagens.

Configuracao atual de producao:

```text
URL Evolution/Evo Go: https://143-95-217-64.sslip.io
Instancia: oraculo
Numero conectado: +554691228197
Webhook: https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/whatsapp-webhook?orgId=3a680b48-1ded-4bac-986f-b6e3a76297b7
```

Nao registrar aqui chave da Evolution nem segredo do webhook. Eles ficam salvos pelo app e aparecem apenas mascarados.

## Problema: convite por WhatsApp nao chega

Verifique:

1. Configuracoes > WhatsApp esta ativo.
2. URL da VPS/Evo Go esta publica e acessivel por HTTPS ou HTTP.
3. Instancia esta conectada no QR Code.
4. Chave da Evolution API foi salva novamente se tiver sido trocada.
5. Celular do convidado esta em formato internacional, exemplo `+5546999990000`.
6. Logs da Edge Function `invite-member`.
7. Logs da Evolution API/Evo Go.

O envio tenta o endpoint padrao da Evolution API e, se a instalacao responder 404 ou 405, tenta tambem o caminho curto usado por algumas distribuicoes Evo Go.

## Problema: salvar chave de IA falha

Possiveis causas:

- usuario nao e `owner`;
- secrets das Edge Functions ausentes;
- tabela `public.ai_model_keys` nao existe ou esta sem grant para `service_role`;
- service role invalida.

Verifique secrets no Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Nunca copie esses valores para o frontend.

## Deploy frontend

Build local:

```bash
pnpm run build
```

Publicacao Netlify:

```bash
netlify deploy --prod --dir=dist
```

URL de producao:

```text
https://oraculo-v2-aize.netlify.app
```

Depois do deploy, valide:

- `/`
- `/configuracoes`
- login;
- onboarding;
- dashboard;
- uma rota interna direta.

## Deploy Supabase

Migrations:

```bash
supabase db push
```

Edge Functions:

```bash
supabase functions deploy invite-member
supabase functions deploy save-ai-settings
supabase functions deploy oracle-chat
supabase functions deploy month-turn --no-verify-jwt
supabase functions deploy save-whatsapp-settings
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

Se a CLI pedir login ou link do projeto, conecte ao projeto correto antes de publicar.

Observacao operacional: no ambiente atual, o deploy via CLI nova aceitou o formato:

```bash
supabase functions deploy whatsapp-webhook oracle-chat --project-ref bkswkfazkjilwfzwzthz --use-api
```

Use `--use-api` quando Docker local nao estiver disponivel.

## Calibrar tom do Oraculo

O tom e o roteiro empacotado das Edge Functions ficam em:

```text
supabase/functions/_shared/conductors/persona.ts
```

Para deixar a IA mais natural:

1. Ajuste `CONVERSATION_STYLE`.
2. Evite instrucoes contraditorias, como "seja curto" e "explique tudo".
3. Lembre que saudacoes simples tambem passam pela IA quando houver chave configurada; respostas fixas devem ficar apenas como fallback.
4. Publique `whatsapp-webhook`, `oracle-chat` e `oracle-session`.
5. Teste pelo WhatsApp com pergunta ambigua, por exemplo "Como esta o sistema?".
6. Confira se ela pede esclarecimento antes de despejar numeros.

## Recuperacao de segredo exposto

1. Remova o valor do arquivo.
2. Rotacione a chave no provedor.
3. Se o segredo foi para Git, considere exposto.
4. Atualize `.gitignore` se necessario.
5. Documente o incidente sem registrar o valor vazado.

## Encerramento de sessao

Antes de parar:

```bash
pnpm run lint
pnpm run build
git status
```

Se Git estiver configurado e a etapa estiver consistente:

```bash
git add .
git commit -m "Update maintenance documentation"
git push
```
