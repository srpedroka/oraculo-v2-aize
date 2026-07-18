# Runbook

## Validar privacidade e ciência versionada

1. Abra `/privacidade` sem sessão e confirme HTTP 200, versão visível e seções de Supabase, IA, WhatsApp/áudio, documentos, retenção/backups e direitos.
2. Entre como owner. O aviso discreto pode aparecer, mas deve permitir continuar usando o app ou ser dispensado sem bloquear nenhuma rota.
3. Abra `Configurações > Privacidade`, leia o aviso completo e registre ciência da versão. Recarregue: o status deve permanecer e o aviso não deve voltar.
4. Entre como coordenador/admin da mesma empresa: o status é legível, mas o botão de registro não aparece.
5. Em empresa descartável diferente, confirme que a ciência da primeira não é visível. Não teste RLS em empresa real.
6. Uma nova versão relevante exige nova linha em `data_notice_versions` e mudança de `DATA_NOTICE_VERSION`; não altere nem apague aceites antigos.

Rollback de UI: retire banner, aba e rota do frontend. A tabela pode permanecer inerte e imutável. Rollback de banco só deve ser considerado antes de existir aceite real; depois disso, preserve a auditoria.

## Validar conflito de edicao em duas abas

1. No staging, abra o mesmo objetivo em duas abas e altere ambas.
2. Salve a primeira. Na segunda, confirme o aviso de versao mais nova e que o rascunho continua visivel.
3. Clique `Recarregar versao atual`; os campos devem assumir a primeira gravacao e o aviso deve sumir.
4. Repita em Dashboard > Lancar KPIs. A primeira aba deve gravar definicao e os 12 meses juntos; a segunda nao pode alterar nenhum deles.
5. Repita em Configuracoes para modelo de IA, WhatsApp e tom. O uso normal nao pede confirmacao adicional.
6. Confira `operational_revisions`: somente a gravacao vencedora de objetivo/KPI deve gerar revisao. Nao use dados reais para esse teste.

Se a tela mostrar conflito depois do proprio salvamento, confira se o Realtime trouxe `updated_at` e se o marcador local de salvamento foi definido antes da mutacao. Se uma RPC devolver `ok=false`, nao repita automaticamente: invalide a consulta e mantenha o rascunho ate a pessoa recarregar.

## Smoke de bundle e rotas lazy

1. Rode `pnpm run build` e confirme a linha `Bundle inicial` abaixo de 200 KB gzip.
2. Abra a tela de acesso com Network limpa e confirme que nenhum asset de `pdfjs-dist`, `pdf.worker`, `xlsx`, `mammoth` ou `jszip` foi solicitado.
3. Entre no app em desktop e mobile e navegue por Dashboard, Estratégico, Trimestrais, Documentos, Áreas, Execução, Arquivo e Configurações; o shell deve permanecer estável durante a troca.
4. Abra os diálogos de objetivo, KPI e importação de histórico e confirme o estado breve de carregamento seguido da janela funcional.
5. Importe um PDF e uma planilha somente no ambiente descartável; confirme que os respectivos chunks aparecem na Network apenas depois da seleção do arquivo.
6. Se o orçamento falhar, inspecione `dist/.vite/manifest.json`; não aumente o limite sem registrar uma decisão e uma medição equivalente.

## Smoke da invalidacao seletiva

1. Com a aba Network aberta, limpe as requisicoes e registre uma evidencia em um objetivo.
2. Confirme que o app atualiza evidencias/impacto sem refazer configuracoes de IA, membros, areas, WhatsApp e KPIs.
3. Envie uma mensagem no chat web e confirme atualizacao de conversa, sessao quando iniciada e uso de IA, sem refetch geral.
4. Importe um KPI e confirme atualizacao de `kpi_monthly_values` e `plan_documents`.
5. Arquive/restaure um objetivo e confirme objetivos, acoes, evidencias, vinculos, auditoria e contagem coerentes.
6. Use o refresh manual e confirme que ele continua recarregando a empresa completa.

## Smoke da paginacao historica

1. Em Documentos, filtre por tipo, area e periodo e confirme que a primeira pagina respeita os filtros.
2. Com mais de 30 registros, use **Carregar mais** e confirme ausencia de repeticoes e ordenacao do mais novo para o mais antigo.
3. No Arquivo, repita para evidencias, check-ins, documentos e historico de alteracoes; abra um documento arquivado pela acao de visualizar.
4. Em Configuracoes > IA > Historico, carregue paginas adicionais e confirme que totais e lista crescem juntos.
5. Abra a edicao de um objetivo com mais de 30 evidencias e confirme a carga progressiva.
6. Arquive/restaure um registro e confirme que a lista reflete a mudanca apos a invalidacao da entidade.

## CI e bloqueio de merge

Todo pull request e push para `main` deve terminar com o check `CI required` verde. Ele cobre lockfile, segredos, audit, tipos, unitarios, fixtures, build, Supabase local, Edge Functions, RLS e E2E autenticado. Nao aprove nem publique um commit com esse check vermelho. Configuracao, artefatos sanitizados e verificacao de producao por SHA: `docs/CI.md`.

## Testes por risco

Antes de publicar, escolha as suítes pela superfície alterada. Unitários sempre rodam sem rede; integração, segurança e E2E autenticado exigem as variáveis de `.agents-private/agent-env` e recusam o projeto de produção.

```bash
pnpm run test:unit
pnpm run lint
pnpm run build
```

Para mudanças de banco, permissão, lifecycle, backup ou jornada de usuário, carregue o ambiente privado e rode também `pnpm run test:integration`, `pnpm run test:security` e `pnpm run test:e2e:staging`. A matriz, os limites e as regras de limpeza estão em `docs/TESTING.md`.

Manual rapido para quando precisar rodar, diagnosticar ou recuperar o Oraculo V2.

Para saber onde ficam contas, chaves, secrets e URLs administrativas, leia tambem `docs/ACCESS.md`.

## Testes automatizados (Etapa 0)

- `pnpm run check` = lint + testes + build (o gate de sempre). Precisa do `pnpm` no PATH; neste Mac, adicione o fallback do runtime: `export PATH="/Users/luisguilherme/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"`.
- `pnpm run test:unit` — Vitest (funções puras e componentes, jsdom). Não toca banco nem rede.
- `pnpm run test:integration` e `pnpm run test:security` — usam Supabase local no CI ou staging isolado. Antes: `set -a; source .agents-private/agent-env; set +a` (carrega `SUPABASE_STAGING_*`). Sem essas variáveis, os testes pulam (não falham). A trava `assertStaging` recusa rodar se a URL apontar para produção.
- `pnpm run test:e2e` — Playwright abre a tela de acesso em desktop e mobile (só leitura). Requer o Chromium: `node node_modules/@playwright/test/cli.js install chromium`.
- `pnpm run verify:deploy` — verificador SÓ LEITURA da produção (migrations, `verify_jwt`, frontend, CSP/headers, cache e segredos fora do Git). Sai com erro se achar problema. Precisa de `SUPABASE_ACCESS_TOKEN`. Para validar um draft antes de produção, use `VERIFY_FRONTEND_URL=https://<deploy>.netlify.app pnpm run verify:deploy`.
- `pnpm run production:verify` — caminho protegido para a mesma verificação: solicita ao Chaves do macOS a credencial de produção, injeta-a somente no processo filho e nunca a imprime.
- Fábrica de teste (`tests/helpers/factory.ts`): cria a org descartável "E2E Oraculo <timestamp>" e a remove ao final (falha visível se não limpar). Nunca usa empresa real.

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

## Convites e lista de Pessoas

Fluxo na tela **Configurações › Pessoas** (somente owner):

1. **Cadastrar sem avisar**: desmarque “Chamar no WhatsApp agora”. Cria acesso/membership sem enviar mensagem.
2. **Convidar pelo WhatsApp** (lista ou no cadastro com a opção ligada): exige celular no formato internacional **e** WhatsApp da empresa ativo com chave. A mensagem é natural (primeiro nome + empresa + link pessoal do app). Não há convite por email nem link copiável na UI.
3. Sem celular: “Cadastre o celular para convidar”. Sem WhatsApp da empresa: “Ative o WhatsApp da empresa para convidar”. Nunca mostrar sucesso se a mensagem não saiu.
4. **Editar**: owner pode editar nome e celular de outras pessoas. Campo de celular vazio **não apaga** o número já salvo.
5. **Área**: select na linha chama `set-member-area` (RPC `set_member_primary_area`). A troca é atômica: limpa as áreas antigas e vincula só a escolhida (ou nenhuma). A UI só confirma depois da resposta do servidor. Owner não recebe área de coordenação.
6. **Papel**: admin/coordenador (e dono só se já for dono).

`invite-member` é idempotente: gera link (invite→magiclink), faz upsert de membership/perfil, preserva `profiles.phone` se o request não trouxer celular novo, e só envia WhatsApp quando `notify = true` e os requisitos estão ok.

## Remover pessoa ou arquivar área

Remover pessoa:

1. Abra Configurações > Pessoas como owner.
2. Clique em `Remover` na pessoa desejada.
3. Se ela coordenar áreas, escolha um substituto em cada uma ou deixe sem coordenador.
4. Confirme `Remover acesso`. A membership é removida; perfil, Auth, conversas e registros permanecem.

O próprio acesso usa um fluxo separado e o último owner não pode ser removido. Se a operação falhar, confira logs de `remove-member`, a RPC `remove_organization_member` e se os substitutos continuam com papel `coordinator` na mesma empresa.

Arquivar área:

1. Abra Áreas ou Configurações > Áreas como owner.
2. Use o ícone de arquivo e confira o impacto apresentado.
3. Confirme. A área sai da operação, mas nenhum plano, objetivo, documento ou check-in é apagado.
4. Para reativar, use `Restaurar` em Áreas arquivadas.

Uma área arquivada não deve aparecer no Dashboard, em seletores operacionais, virada mensal, WhatsApp ou contexto ativo da IA. Documentos e backups continuam reconhecendo seu nome e conteúdo histórico.

## Retirar e restaurar registros operacionais

Fluxo esperado:

1. Em um card de objetivo, use o ícone de arquivo para retirar o objetivo. Seus desdobramentos, ações e evidências ativos entram no mesmo lote.
2. Ações-chave podem ser retiradas no próprio card; evidências, no editor do objetivo; projetos e check-ins, em Execução Viva; documentos, em Documentos.
3. Informe um motivo curto quando isso ajudar a auditoria.
4. Abra `Arquivo` na navegação lateral para restaurar um registro ou consultar o histórico de alterações.

Owners restauram registros gerais e da empresa. Coordenadores só restauram itens da própria área ativa. Se uma área também estiver arquivada, restaure primeiro a área. Itens retirados não devem aparecer nos fluxos ativos, no WhatsApp, na virada mensal nem no contexto da IA.

Diagnóstico:

```sql
select id, title, archived_at, archived_by, archive_reason, archive_batch_id
from public.objectives
where org_id = '<org_id>'
order by archived_at desc nulls last;

select entity_type, entity_id, action, changed_by, created_at
from public.operational_revisions
where org_id = '<org_id>'
order by created_at desc
limit 50;
```

Se a restauração de ação/evidência disser que depende do objetivo, restaure o objetivo raiz do lote. Se a função falhar, confira logs de `operational-lifecycle`, a RPC `set_operational_item_archived` e a membership do usuário.

## Sair, encerrar ou excluir uma empresa

Todas as ações ficam em Configurações › Zona de perigo e passam pela Edge Function `organization-lifecycle`.

1. **Sair da empresa**: qualquer pessoa retira o próprio acesso. Se você coordena áreas, elas ficam sem coordenador. O único owner não consegue sair — precisa transferir a titularidade (promover outro owner) ou encerrar a empresa.
2. **Encerrar (arquivar)**: só owner. Arquiva a empresa de forma reversível — ela sai da virada mensal e o WhatsApp é pausado (`enabled=false`), mas nada é apagado. Restaure quando quiser.
3. **Excluir definitivamente**: só owner e só com a empresa já arquivada. Exige um backup `completed` dos últimos 7 dias e digitar o nome exato da empresa. Apaga chaves de IA, credenciais de WhatsApp, os objetos de backup no storage e todos os dados; sobra apenas a linha em `organization_lifecycle_audit`.

Antes de excluir, gere e **baixe o pacote portátil cifrado** no cartão de Backups — é a única forma de recuperar depois (as linhas de `organization_backups` somem junto com a empresa). O webhook do Evo Go continua apontando para uma empresa inexistente após a exclusão; remova a instância/webhook no Evo Go Manager manualmente.

Diagnóstico:

```sql
select id, name, archived_at, archived_by, archive_reason from public.organizations where id = '<org_id>';
select action, actor_email, reason, created_at from public.organization_lifecycle_audit where org_id = '<org_id>' order by created_at desc;
```

Se a exclusão falhar, confira logs de `organization-lifecycle`, as RPCs `set_organization_archived`/`delete_organization_permanently` e se existe backup `completed` recente.

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

## MFA opcional do owner

1. Abra `Configurações > Segurança` como owner.
2. Use `Adicionar`, escaneie o QR Code e confirme o código de seis dígitos. O fator só fica ativo após a confirmação.
3. Cadastre um segundo autenticador para recuperação; o Supabase não fornece códigos de recuperação.
4. `Exigir segundo fator em ações críticas` nasce desligado. Para ligar ou desligar, confirme antes a identidade na mesma tela e alcance `aal2`.
5. Com a política ligada, uma sessão antiga `aal1` continua usando o app normalmente, mas ações protegidas orientam a confirmar o autenticador e tentar novamente.

Recuperação: use o segundo fator para elevar a sessão e remover o perdido. Se nenhum fator estiver acessível, valide a identidade fora do app e use Supabase Admin Auth `mfa.deleteFactor`; não registre QR, segredo TOTP ou código em chamados, docs ou logs.

## Limites e orçamento de IA

1. Abra `Configurações > IA > Limites` como owner.
2. `Tudo liberado`/`Só observar e registrar` significa que nenhuma chamada será bloqueada, mesmo acima dos valores.
3. Pessoa/minuto e empresa/minuto detectam rajadas; a referência mensal gera alertas em 70%, 90% e 100%.
4. Não ligue `Bloquear quando exceder` sem decisão explícita do dono e teste prévio no staging.
5. Se o modo block for ativado, uma conclusão já em andamento pode usar bypass; app e WhatsApp devem mostrar a mensagem de limite e preservar os dados.

Diagnóstico:

```sql
select * from public.ai_control_policies where org_id = '<ORG_ID>';
select kind, threshold_percent, observed_value, limit_value, blocked, created_at
from public.ai_limit_events where org_id = '<ORG_ID>' order by created_at desc limit 30;
select * from public.ai_monthly_usage where org_id = '<ORG_ID>' order by month_start desc;
```

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

## Perfil da empresa

O dono configura o perfil em **Configurações › Empresa**, no card **Perfil da empresa**.

Como usar:

1. (Opcional) Cole links oficiais da empresa no campo, um por linha (site, LinkedIn, etc.; máximo 5).
2. Clique em **Pesquisar na internet**. A função `company-research` só sugere; nada é gravado ainda.
3. Revise a prévia: edite o resumo e desmarque fontes que não quiser guardar (defesa contra homônimo).
4. **Confirmar perfil** grava um `plan_documents` com `type = company_profile`. **Descartar** limpa a prévia sem gravar.
5. Para atualizar, pesquise de novo e confirme outra versão; o contexto da IA usa a versão mais recente.

Erro comum: *"O perfil precisa de uma chave Anthropic ou OpenAI cadastrada na aba IA"*. Cadastre e salve uma chave Anthropic (preferida) ou OpenAI em **Configurações › IA**. Moonshot e xAI não fazem busca web neste fluxo.

Com perfil confirmado, o Oráculo recebe o bloco permanente "PERFIL DA EMPRESA" em painel, WhatsApp e sessões. Sem perfil, o bloco simplesmente não aparece.

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
- `public.ai_function_settings.last_status` e `last_status_detail` para saber se o ultimo teste/uso falhou por chave, modelo, limite ou timeout;
- `public.ai_provider_key_status.last_status` para saber se a chave/modelo testado no salvamento foi aceito pelo provedor;
- logs da Edge Function `oracle-chat`.

Consulta rapida de saude da IA:

```sql
select "function", provider, model, last_status, last_status_source, last_checked_at, left(last_status_detail, 180) as detail
from public.ai_function_settings
where org_id = '<ORG_ID>'
order by "function";
```

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
5. Depois de 4 horas sem mensagens, a conversa anterior fica `archived` e uma nova conversa ativa e criada. Seu resumo e memoria de fundo, nao uma ordem para continuar a ultima pergunta.
6. Sessoes de planejamento de outro episodio so voltam por confirmacao pendente ou pedido explicito, como "continuar o planejamento".

Verifique:

```sql
select id, user_id, channel, status, summary is not null as has_summary, summary_upto, last_message_at
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

Se duas pessoas se contaminarem, confira se as mensagens estão com `user_id` diferente e `conversation_id` diferente. Se web e WhatsApp da mesma pessoa se misturarem, confira se `channel` está separado em `conversations`. Depois de uma pausa maior que 4 horas, confirme que o episodio anterior ficou `archived` e existe somente um `active` no canal. Se um "Ola" retomar formulario antigo, confira se a `planning_session.conversation_id` pertence ao episodio atual e se as functions publicadas incluem `_shared/conversation-policy.ts`. Se a conversa passar de 40 mensagens novas e `summary` continuar vazio, confira `public.ai_function_settings` da função `background`, chave do provedor e logs de `ai_usage_logs.metadata.action = 'conversation_summary'`.

Se a fase da sessao avancar mas a mensagem nova nao aparecer no painel, compare `planning_sessions.conversation_id` com a conversa `active` da mesma empresa, pessoa e canal. `oracle-session` deve religar automaticamente um vinculo arquivado, ocioso ou fora de escopo antes de inserir a mensagem. Nao copie mensagens nem altere o estado da sessao manualmente; publique a Function com o compartilhado atual e confirme a regressao `planning-session-conversation-rebind.test.ts` no staging.

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

## Diagnóstico: arquivo importado altera regras ou falha por segurança

Os imports estratégico, trimestral e mensal devem passar por `_shared/untrusted-content.ts`. O texto do arquivo aparece para o modelo entre `<oraculo_untrusted_document>` e `</oraculo_untrusted_document>` e não deve ser salvo integralmente no histórico da conversa.

1. Confirme que `oracle-chat`, `oracle-session` e `whatsapp-webhook` foram publicadas no mesmo deploy.
2. Teste um arquivo com “ignore as regras”, URL, base64 e JSON; ele pode aparecer como dado na proposta, mas não pode mudar `proposal.type`, revelar contexto nem gravar sem confirmação.
3. Se a IA devolver estrutura excessiva ou outro tipo de proposta, o fluxo deve parar com erro claro e manter a sessão sem confirmação.
4. Se um plano trimestral trouxer ID que não é objetivo estratégico ativo da empresa, a preparação ou confirmação deve responder que o vínculo está fora da empresa e não criar objetivo/documento parcial.
5. Rode `pnpm run test:unit` e `pnpm run test:integration`; as fixtures ficam em `_shared/untrusted-content.test.ts` e `proposal-atomicity.test.ts`.

## Problema: WhatsApp nao inicia plano ou nao aplica atualizacao rapida

Fluxo esperado da Fase 4:

1. `whatsapp-webhook` salva a mensagem em `chat_messages`.
2. `_shared/intent-router.ts` usa a funcao de IA `background` para classificar a mensagem.
3. Um pedido explícito de plano é reconhecido deterministicamente antes da IA. Para plano mensal/trimestral, o webhook resolve a área pela frase; se faltar, grava `pending_context.type = planning_start` e pergunta o departamento antes de criar a sessão.
4. `startPlanningSession` retoma somente uma sessão com o mesmo tipo, período **e área**. Não aceite `area_id = null` em sessão mensal/trimestral.
5. Se a intencao for `quick_update`, `_shared/quick-updates.ts` carrega objetivos/acoes do mes, identifica o alvo, valida permissao e grava a alteracao.
6. Se houver duvida, o Oraculo pede esclarecimento em vez de gravar.

Se o Oráculo entregar documento de outra área/período:

1. Confira a sessão mais recente da conversa e seu `area_id`, `type` e `period`.
2. A busca em `plan_documents` deve usar os três campos exatos e nunca repetir sem filtros.
3. Se não houver correspondência, a resposta correta é informar que o documento específico ainda não existe.
4. Pedido de `arquivo`, `PDF` ou `documento pronto` usa `POST /send/media` no Evo Go; fallback Node usa `/message/sendMedia/{instance}`.
5. O PDF é gerado em memória por `_shared/plan-pdf.ts`; não salve base64, URL temporária ou bytes.

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

## Problema: confirmacao fica em `Gravando...` ou retorna erro

1. Nao clique novamente enquanto a chamada estiver em voo.
2. Confira `oracle-session` em Functions > Invocations e Logs; diferencie timeout de uma resposta HTTP 400 rapida.
3. Recarregue a tela e confirme se `pending_proposal` continua presente e se nenhum objetivo/documento novo foi criado.
4. O painel deve exibir a mensagem devolvida pela Function e liberar o botao apos a rejeicao. Se continuar preso, o frontend publicado ainda nao possui a recuperacao de erro.
5. Corrija a proposta pela conversa quando a mensagem indicar validacao de negocio. Retry da mesma proposta e protegido pela chave idempotente da sessao.
6. Nunca repita a conducao completa nem altere o banco manualmente para contornar a validacao.

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

### Fila de entrada da Etapa 3

A fila depende de `whatsapp_settings.inbound_queue_enabled`, da outbox da mesma empresa e de `whatsapp_worker_secrets.endpoint_url`. Desde a Fatia 3E, integrações ativas nascem com fila/outbox ligadas e texto não possui fallback síncrono. Se qualquer parte estiver indisponível, o webhook devolve `503` antes de gravar ou chamar IA; a Evolution deve reentregar o evento.

Para um teste descartável no staging, envie o mesmo evento várias vezes e confira um único registro em `whatsapp_inbound_jobs` por `(org_id, event_key)`. Nunca coloque base64, mídia, URL temporária, `mediaKey` ou segredo no payload da RPC. Restaurações continuam com WhatsApp e flags desligados porque não restauram credenciais; ao reativar a integração por `save-whatsapp-settings`, fila e outbox são ligadas juntas.

Desde o piloto de 2026-07-13, a fila inbound aceita o caminho real apenas de texto. Áudio e documento passam pelo handler síncrono mesmo com a flag ligada, pois a rota de download da Evo Go exige a mensagem original e o Oráculo não persiste seu descritor criptográfico. Não altere essa regra adicionando `mediaKey`, `directPath`, URL ou arquivo ao job.

Com o worker ativo, acompanhe `status`, `attempt_count`, `next_retry_at`, `locked_at`, `last_error_code` e `correlation_id`. `processing` com lock antigo é recuperado no próximo claim; falha transitória usa 10s, 30s, 2min e 10min; a quinta tentativa ou falha permanente vira `dead`. Mensagens posteriores da mesma conversa aguardam a anterior. Desligar uma flag é um kill switch e produz retry/`503`, não modo síncrono.

O cron `oraculo-whatsapp-worker` roda a cada minuto, mas retorna sem chamada quando `endpoint_url` é nulo. A função é pública no gateway e autenticada internamente por `x-oraculo-worker-secret`; nunca copie esse valor para frontend, logs ou documentação.

### Outbox de saída da Etapa 3

A outbox depende de `whatsapp_settings.outbound_outbox_enabled` e `whatsapp_sender_secrets.endpoint_url`. Resposta textual normal e seus blocos formatados entram em `chat_messages`/`whatsapp_outbox` na mesma transação; não existe fallback de envio direto. O worker verifica a outbox antes de qualquer mutação para que uma falha de entrega não refaça IA nem grave resposta sem envio. Recusas anteriores à conversa e anexos de mídia são exceções diretas explícitas.

O sender mantém ordem por empresa+destino e por bloco, recupera lock abandonado, tenta imediatamente e depois em 10s, 30s, 2min e 10min; a quinta tentativa ou erro permanente vira `dead`. `sent` exige HTTP 2xx da Evolution. O cron `oraculo-whatsapp-sender` roda a cada minuto, mas não chama nada com endpoint nulo. Para rollback, pare novas entregas, drene `queued|processing|retry|sending`, republique a versão anterior e somente então desligue flags/endpoints. Não desligue endpoints com itens pendentes.

O endpoint é público no gateway para permitir `pg_net`, porém exige `x-oraculo-sender-secret`. Nunca exponha esse segredo. A API de texto da Evolution devolve ID/status após aceitar, mas não recebe chave de idempotência do cliente; uma queda após o aceite e antes do registro local continua sendo um intervalo raro de duplicidade possível.

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
2. O webhook tenta obter o arquivo por base64 no payload, URL direta ou `POST /message/downloadmedia` da Evolution/Evo Go; rotas antigas ficam apenas como fallback.
3. Se a mídia vier criptografada pelo WhatsApp, o webhook usa a `mediaKey` do `audioMessage` para descriptografar.
4. O arquivo e normalizado para um MIME real de áudio, por exemplo `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/wav` ou `audio/webm`.
5. O áudio e enviado para OpenAI `gpt-4o-mini-transcribe`; se o modelo recusar por formato/modelo, tenta `whisper-1` como fallback.
6. O texto final e salvo em `chat_messages` como `[Áudio transcrito] ...`.
7. O texto transcrito entra no mesmo fluxo de resposta do Oraculo.

Historico da correcao de 2026-07-02:

- Sintoma inicial: o usuario recebia "Recebi seu áudio, mas ainda não consegui transcrever por aqui".
- Primeiro diagnostico: o áudio chegava no webhook, mas a mídia nao era baixada da Evolution.
- Ajuste inicial: o webhook passou a aceitar retorno como JSON, base64, URL ou binario. Em 2026-07-13, a rota atual da Evo Go foi confirmada como `/message/downloadmedia`; `/message/downloadimage` ficou apenas como compatibilidade legada.
- Segundo diagnostico: a OpenAI recusava o arquivo com `invalid_request_error`.
- Codigo tecnico observado: `file:application/octet-stream>audio/ogg:...`.
- Ajuste feito: o arquivo baixado passou a ser normalizado por assinatura de bytes, pois o Evo pode devolver `application/octet-stream`.
- Terceiro diagnostico: a assinatura vinha como `62f2c82b...`, nao como `OggS`. Isso indicava mídia criptografada do WhatsApp, nao áudio pronto.
- Ajuste final: o webhook passou a descriptografar mídia de áudio usando HKDF/SHA-256 com info `WhatsApp Audio Keys`, AES-CBC, `mediaKey` do payload e remoção do MAC final de 10 bytes. Depois disso, o arquivo descriptografado segue para a OpenAI.

Codigos tecnicos de falha:

- `no-audio-info`: o payload nao foi reconhecido como áudio.
- `url:<status>`: a URL direta de mídia nao baixou.
- `/message/downloadmedia:<status>:<content-type>`: a rota atual do Evo Go nao retornou mídia.
- `/message/downloadimage:<status>:<content-type>`: fallback legado do Evo Go nao retornou mídia.
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
- se a instancia da Evolution permite baixar mídia/base64 pela rota `/message/downloadmedia`;
- se o payload de áudio traz `mediaKey`, `mimetype` e dados de mídia suficientes;
- se o codigo tecnico mostra `decrypt:ok` antes da chamada OpenAI;
- se a pessoa consegue reenviar o áudio ou mandar em texto quando aparecer a resposta de falha.

Evite consultar logs brutos de producao quando houver alternativa. Logs crus podem conter conteudo privado de mensagens ou URLs temporarias. Prefira usar os codigos tecnicos seguros exibidos na resposta de falha.

Observacao: o custo da resposta textual entra em `ai_usage_logs`. O custo específico da transcrição de áudio ainda não entra no cálculo tokenizado, porque o provedor precifica áudio por duração/modelo, não pelos mesmos campos de tokens de texto.

## Problema: conversa trimestral muda sozinha para plano anual ou pede confirmacao repetida

Fluxo esperado:

1. Planejamento trimestral ou mensal existe somente quando há `planning_sessions` ativa com `type`, `period` e `area_id` corretos.
2. Uma ação como "Planejar o calendário de migração" continua sendo resposta da sessão atual; isoladamente, não abre Plano Estratégico.
3. Pedido explícito como "quero iniciar um plano trimestral para Comercial" pode abrir ou trocar a sessão.
4. Na síntese, o Oráculo mostra resumo e conteúdo a gravar na mesma resposta e pede uma única confirmação.
5. Depois da confirmação, o documento gerado precisa manter tipo, área e período da sessão e o PDF deve ter cabeçalho, seções, objetivos e ações, não apenas texto corrido.

Diagnóstico:

- Consulte `planning_sessions` pelo usuário e horário. Se a conversa parece trimestral mas não existe sessão trimestral persistida, a IA diária conduziu um fluxo informal e os dados não devem ser confirmados até reconstruir a sessão correta.
- Consulte `operation_commands`, `operational_revisions`, objetivos e `plan_documents` antes de corrigir dados. Use o snapshot `before_data` para restaurar um plano sobrescrito; não reconstrua o anual por memória.
- Arquive registros incorretos e preserve o comando/revisão para auditoria. Faça a correção em transação única e valide os IDs da organização, área e plano afetados.
- Teste `isExplicitPlanningRequest` com texto de ação e pedido real, e `isConfirmationMessage` com confirmações puras e frases que apenas citam a palavra confirmação.
- Renderize o PDF de teste para PNG e inspecione visualmente antes do deploy. Verifique também nome do arquivo e paginação.

Incidente de 2026-07-13: a frase "Planejar o calendário de migração" abriu uma sessão `strategic/2026`, sobrescreveu o plano anual e gerou documento anual com conteúdo Comercial/T3. A revisão operacional permitiu restaurar o anual exatamente; o conteúdo foi reconstruído como Comercial/T3 e os registros errados foram arquivados.

## Problema: arquivo enviado pelo WhatsApp nao direciona o plano

Fluxo esperado:

1. Evolution envia uma mensagem com `documentMessage` para `whatsapp-webhook`.
2. O webhook baixa o arquivo por base64, URL direta ou rota `/message/downloadmedia`.
3. Se o arquivo vier como mídia criptografada do WhatsApp, o webhook descriptografa em memoria com `mediaKey` e info `WhatsApp Document Keys`.
4. O webhook extrai texto de `TXT`, `PPTX`, `DOCX` ou `PDF` com texto selecionavel. PDF usa `unpdf`/PDF.js; nao faça parsing por regex dos bytes.
5. A IA classifica o documento como `strategic`, `quarterly`, `monthly`, `evidence` ou `unknown` e devolve natureza literal, resumo, pontos principais e uso sugerido com base no conteúdo.
6. Se for `strategic`, o webhook chama `prepareReadyStrategicPlanProposal`, cria/atualiza uma sessao estrategica ativa e responde com previa textual dos objetivos, projetos e lacunas. A pessoa confirma respondendo `confirmar`.
7. Se for `quarterly`, o webhook tenta identificar o departamento, chama `prepareReadyQuarterlyPlanProposal` e responde com previa textual dos objetivos trimestrais. A pessoa confirma respondendo `confirmar`.
8. Se for `monthly`, o webhook tenta identificar o departamento, chama `prepareReadyMonthlyPlanProposal` e responde com previa textual dos objetivos mensais e acoes-chave. A pessoa confirma respondendo `confirmar`.
9. Se faltar departamento, o Oraculo pergunta qual departamento usar antes de montar a proposta.
10. Se for `evidence` ou `unknown`, o Oraculo mostra o que identificou no conteúdo e pergunta o direcionamento, sem gravar automaticamente. `unknown` significa material fora das categorias operacionais, nao falha de leitura.
11. Para perguntas seguintes, a conversa guarda somente o insight automático limitado e marcado como não confiável; nome, arquivo e texto bruto continuam omitidos.

Limite atual:

- O WhatsApp cria proposta estruturada para Plano Estrategico, Trimestral e Mensal.
- Evidencias por arquivo ainda nao criam dados estruturados automaticamente.
- Nenhum arquivo grava plano sem confirmação explícita do usuario e validação server-side.
- PDF escaneado sem camada de texto continua sem conteúdo extraível; nesse caso, orientar a enviar versão com texto selecionável ou convertida por OCR. PDF textual comprimido deve ser lido normalmente.

Verifique:

- se a mensagem aparece em `chat_messages` como `[Arquivo recebido]`;
- se a resposta identifica a natureza real do material, resume o conteúdo e lista pontos concretos, inclusive quando a categoria for `unknown`;
- numa mensagem seguinte como "leia e me responda", se o Oráculo usa o resumo persistido em vez de inferir pelo nome;
- se existe registro em `ai_usage_logs` com `metadata.action = document_classification`;
- para Plano Estratégico, se existe registro em `ai_usage_logs` com `metadata.action = ready_plan_import`;
- para Plano Estratégico, se `public.planning_sessions.pending_proposal` foi preenchido;
- se o arquivo tem extensao e MIME compatíveis: PDF, PPTX, DOCX ou TXT;
- se a rota `POST /message/downloadmedia` da Evo Go continua baixando documentos; rotas antigas são apenas fallback.

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

## Saúde e recuperação do WhatsApp

Em `Configurações > WhatsApp`, somente owners veem o painel de saúde. Ele consulta a Evolution sem revelar chave/segredo e mostra conexão, webhook, último evento recebido, último envio confirmado, fila pendente, taxa de falha e dead-letters recentes. A URL esperada pode ser copiada e contém apenas `orgId`; tokens adicionais do Evo Go não são exibidos.

Compatibilidade do diagnóstico: Evolution Node expõe rotas próprias de estado/webhook; a Evo Go atual expõe o estado em `GET /instance/status`, com `data.Connected` e `data.LoggedIn`. A Evo Go não oferece uma rota equivalente de leitura da configuração do webhook no Swagger atual. Nesse caso, `whatsapp-health` mostra o webhook como confirmado quando houve tráfego autenticado recente; sem tráfego, pede uma mensagem real em vez de declarar configuração incorreta.

Alertas significam:

- **Instância desconectada:** reconectar o WhatsApp na Evolution antes de testar.
- **Webhook fora do padrão:** conferir URL, flag habilitada e evento `MESSAGES_UPSERT` na Evolution.
- **Sem eventos recentes:** com instância conectada e integração ativa, enviar uma mensagem real e conferir se o horário muda.
- **Fila acumulando:** investigar worker/sender e endpoints antes de reprocessar.
- **Falhas que exigem atenção:** abrir a lista, corrigir a causa e reprocessar somente depois que a fila correspondente estiver ativa.

`Enviar teste` manda uma única mensagem para o celular internacional cadastrado no perfil do owner. Não usar repetidamente em produção. `Reprocessar` pode reenviar uma resposta e pede confirmação; com MFA crítico ligado, exige sessão `aal2`. O painel nunca ativa `inbound_queue_enabled`, `outbound_outbox_enabled`, endpoint do worker ou endpoint do sender. A retenção da telemetria é de 30 dias e não substitui logs do Supabase/Evolution.

Piloto concluído em 2026-07-13: texto percorreu Evo Go -> webhook -> fila -> worker -> outbox -> Evo Go; áudio e documento reais também foram validados, além de deduplicação 10x, ordem e recuperação. A Fatia 3E removeu o fallback síncrono de texto. Confirmações curtas (`ok`, `sim`, `piloto ok`, `recebido`) nunca alteram dados fora de uma confirmação pendente explícita; alvo inferido precisa ser mostrado e confirmado. Não injete evento sintético numa conversa real de produção. Deduplicação, ordem e mutação devem ser exercitadas somente com organização descartável no staging.

Configuracao atual de producao:

```text
URL Evolution/Evo Go: https://143-95-217-64.sslip.io
Instancia: oraculo
Numero conectado: +554691228197
Webhook (o que FUNCIONA): https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/whatsapp-webhook?orgId=3a680b48-1ded-4bac-986f-b6e3a76297b7
```

Nao registrar aqui chave da Evolution nem segredo do webhook. Eles ficam salvos pelo app e aparecem apenas mascarados.

Roteamento por org — MANTER o `?orgId=` na URL. O `whatsapp-webhook` tenta primeiro o `orgId` da URL e, so se faltar, o `instance_name` do payload. O provedor atual (Evo Go) aparentemente NAO envia um `instance` reconhecivel no payload, entao o caminho sem orgId NAO funciona com ele. Incidente 2026-07-07: removeu-se o `?orgId=` da URL "para robustez" e o recebimento parou (ultima mensagem no banco 13:36 UTC; mensagens seguintes nao chegaram); confirmado consultando `chat_messages` (nenhum registro apos a troca) com config de banco intacta (`instance_name=oraculo`, `enabled=true`). Correcao: usar a URL da Evolution/Evo Go COM `orgId`.

Segredo no Evo Go — o Manager da Evo Go nao expoe campo de header customizado. O caminho preferencial continua sendo `x-oraculo-webhook-secret`; quando o painel nao permitir header, configure a URL com `&evoGoToken=<token-derivado>`. Esse token e HMAC-SHA-256 do texto `evo-go:<orgId>` usando o `webhook_secret` salvo no banco; ele nao e o segredo bruto. Diagnostico do sintoma: se mensagens param de chegar, primeiro confirme no banco se ha `user`/`whatsapp` recente em `chat_messages`; se nao houver, o webhook rejeitou antes de salvar (roteamento/secret) ou a Evo nao chamou — comece revisando `orgId`, `evoGoToken` e eventos no Manager. So tentar remover o `orgId` novamente depois de capturar um payload real do Evo Go e ajustar `extractInstanceName`.

Loop de resposta — se o Oraculo responder repetidamente sem parar, corte primeiro o webhook no Manager/Evo Go (`webhookUrl` vazio e `subscribe` vazio) e confirme que eventos `fromMe` estao sendo ignorados no `whatsapp-webhook` antes de religar.

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

## Importar histórico (Documentos)

1. Abra **Documentos** e clique **Importar histórico** (owner, ou coordenador com ao menos uma área ativa). O Plano Estratégico **não** tem mais esta entrada.
2. Ao selecionar PDF/PPTX/DOCX/TXT ou imagem, aguarde a leitura e a organização automática. Tipo, escopo, período e título devem ser preenchidos sem um segundo clique; ano, trimestre, responsável e versão aparecem como metadados quando identificados.
3. Nomes equivalentes de área podem ser associados automaticamente quando houver um único destino seguro, como `Industrial` para a área cadastrada `Produção`. Se duas áreas forem igualmente plausíveis, escolha manualmente; o Oráculo não decide o empate.
4. Cole texto **ou** use **Importar arquivo** / arraste: PDF, PPTX, DOCX, TXT, JPG, PNG ou WEBP. Nada é gravado só por escolher o arquivo.
5. Imagem: o navegador redimensiona e envia à leitura do Oráculo; o texto transcrito preenche o campo e a sugestão de tipo/área/período/título aparece para conferência.
6. **Tabelas multi-ano** (ex. colunas TOTAL 2025 e TOTAL 2026): ao **Interpretar** (ou ao importar imagem), o texto canônico é **expandido** para uma linha por mês+ano (`Janeiro 2025 | R$ …`), e o período do documento vira faixa `2025–2026`. Confira a prévia antes de salvar.
7. Ajuste os campos e **Salvar histórico**. Nada vira objetivo ativo; entra em Documentos como histórico. A mídia da imagem **não** é guardada. Após salvar, o novo documento fica selecionado.
8. Se houver conflitos (ex.: duas tabelas do mesmo período com valores diferentes), o diálogo pede escolha e **bloqueia Salvar** até decidir. As alternativas ficam em `content.import_backup` (sem base64/arquivo bruto).
9. Em um documento com backup, use **Reabrir importação** para trocar a leitura e salvar **nova versão**; a anterior permanece.
10. Período multi-ano só aparece quando a tabela foi expandida; menção a `2025` e `2030` numa visão não vira faixa sozinha.
11. Se a leitura da imagem falhar: use foto mais nítida, PDF com texto, ou cole o texto.
12. Se o objetivo for alimentar os cards de Resultado (KPI), use o import de planilha/imagem no Dashboard; o histórico não grava `kpi_monthly_values`.

## Numeros do Dashboard (Resultado)

Os cards de Resultado mostram valores compactos em pt-BR:

- moeda: `R$ 850 mil`, `R$ 1,23 mi`, `R$ 2,45 bi`;
- contagens: `18,55 mil` (sem `R$`);
- percentual: `12,46%` (nunca abrevia);
- nulo: `—`.

Os cards mostram ate 2 casas decimais. Ao passar sobre uma coluna do grafico, o tooltip mantem `mil`/`mi`/`bi` e mostra ate 4 casas; o `title` dos numeros continua oferecendo o valor integral. Campos de edicao permanecem sem abreviacao. A regra vive em `src/lib/kpi.ts`; valide com `pnpm run test:kpi-format`.

## Resgatar KPIs a partir do histórico

1. Importe documentos com números (ex. faturamento mensal multi-ano) em **Documentos › Importar histórico** e salve.
2. No **Dashboard › Resultado**, owner/admin clica **Resgatar do histórico** (ou em Lançar KPIs › mesmo botão).
3. O servidor lê até 30 históricos com texto, a IA de bastidores extrai linhas de KPI e **omite o que já tem Meta/Atingido** no Dashboard.
4. Confira a prévia (anos, indicadores, valores) e **Aplique**. Nada grava sem confirmação.
5. Se não achar nada: confira se o histórico tem texto expandido (`Janeiro 2025 | R$ …`) e se o KPI correspondente existe (Faturamento, Margem, Produção, Caixa).

## Importar planilha de KPIs

O editor do Dashboard permite que `owner` e `admin` importem `.xlsx`, `.xls`, `.csv`, JPG, PNG ou WEBP com dados de Meta e Atingido.

1. Abra Dashboard > Lançar KPIs > Importar planilha.
2. Escolha uma planilha de até 20 MB ou imagem de até 8 MB. O navegador lê as primeiras abas e linhas da planilha, ou reduz a imagem em memória; nenhum arquivo bruto é salvo no Supabase.
3. A função `suggest-kpi-spreadsheet` envia a tabela textual ou a imagem temporária para a IA configurada em `background` e retorna a proposta de indicador, ano, mês, Meta e Atingido.
4. Revise a prévia. Avisos indicam dados ambíguos ou leitura limitada.
5. Clique em `Aplicar lançamentos` para gravar. Sem essa confirmação, nada é alterado. A confirmação também cria um documento `Histórico de KPIs` em Documentos, sem guardar a imagem ou arquivo original.

Se não surgir uma prévia, confira se há uma IA válida configurada para a função `background` em Configurações e se as colunas da planilha ou a imagem deixam claros indicador, ano, mês, Meta e Atingido. Para imagem, use OpenAI, Anthropic ou xAI como modelo de bastidores. A importação preserva valores existentes quando uma célula não foi identificada com segurança.

## Backups e restauração por empresa

Fluxo normal para owner:

1. Abra Configurações > Segurança e backups.
2. Confirme que `Backup diário` e `Snapshot após marcos importantes` estão ativos.
3. Use `Criar backup agora` antes de uma operação sensível.
4. Informe uma senha de arquivo com pelo menos 10 caracteres e use o ícone de download para gerar o pacote portátil criptografado.
5. Para recuperar, use o ícone de restauração de um snapshot interno ou `Importar pacote`. O sistema cria uma nova empresa e nunca sobrescreve a atual. Se a conta ficou sem nenhuma empresa, importe o pacote diretamente no onboarding.

Diagnóstico no banco:

```sql
select kind, status, record_count, size_bytes, external_status, error_message, created_at, completed_at
from public.organization_backups
where org_id = '<ORG_ID>'
order by created_at desc
limit 30;
```

```sql
select automatic_enabled, event_snapshots_enabled, last_success_at, last_failure_at, last_failure_message
from public.organization_backup_policies
where org_id = '<ORG_ID>';
```

```sql
select jobname, schedule, active
from cron.job
where jobname = 'oraculo-organization-backups';
```

Se não houver backup válido há mais de 26 horas:

- confira `organization_backup_policies.last_failure_message`;
- confira logs da Edge Function `organization-backup`;
- confirme que o cron está ativo;
- execute um backup manual pela tela;
- confira o bucket privado `organization-backups` no Storage.

Para réplica externa, configure todos os secrets `BACKUP_S3_*` descritos em `docs/ACCESS.md` e publique `organization-backup` novamente. A coluna `external_status` deve passar a `completed`. O bucket precisa ser privado, dedicado ao Oráculo e ter lock de 90 dias. A credencial da Function deve ser limitada ao bucket; o código não emite exclusão externa. Sem S3, gere periodicamente o pacote portátil e guarde-o fora do projeto Supabase.

No Cloudflare R2, a interface pode exibir a URL S3 com `/<bucket>` no final. A Function normaliza esse sufixo antes de montar a URL assinada, pois o bucket também é informado em `BACKUP_S3_BUCKET`. Upload e download usam `aws4fetch`, recomendado pelo R2 para o runtime web, com duas tentativas de até 30 segundos cada. O objeto gzip deve usar `Content-Type: application/gzip`, sem `Content-Encoding: gzip`: clientes `fetch` podem descompactar automaticamente esse encoding. O restaurador detecta os bytes mágicos de gzip e também aceita objetos legados já descompactados pelo transporte; checksum do envelope e do registro continuam obrigatórios. Falha externa deve produzir `external_status = failed`, sem prender o worker nem invalidar o arquivo interno concluído.

Meta inicial de recuperação: RPO de 30 minutos para os dados de empresa incluídos no snapshot e RTO de 4 horas para restaurar uma cópia operacional. A réplica não contém chaves de IA, segredos do WhatsApp, mídia bruta nem credenciais do Supabase Auth. Em desastre total, usuários precisam ser recriados/convidados e integrações precisam ter seus segredos reconfigurados e rotacionados antes da reativação.

O disparo via `pg_net` usa timeout de 300 segundos. Um registro `pending` por mais de 5 minutos deve ser tratado como falha operacional: consulte os logs de `organization-backup`, não apague a cópia externa e só refile a solicitação depois de confirmar que não há execução ativa.

Teste de recuperação obrigatório: mensalmente, o owner abre `Configurações > Backups` e usa `Testar recuperação`. O botão escolhe o snapshot interno no ciclo mensal e, quando o exercício trimestral estiver vencido e o R2 configurado, obriga a leitura da cópia externa. A Function cria um clone, mede a duração, confere checksum, contagens críticas, ausência de segredos e WhatsApp/fila/outbox desligados. Abra o clone e confira Dashboard/KPIs, Plano Estratégico, Documentos e Arquivo; depois volte à empresa de origem e use `Concluir teste`. A conclusão remove somente o clone e atualiza imediatamente a lista de empresas; se uma aba aberta antes da conclusão ainda mostrar o nome antigo, recarregue-a e confirme que a organização responde sem acesso. O painel Saúde operacional avisa depois de 35 dias sem restauração e 100 dias sem exercício externo; ele informa, mas não bloqueia a rotina.

### Incidente e recuperação completa

- Responsável inicial: um owner da organização. Se o owner principal estiver indisponível, outro owner assume; coordenadores informam impacto, mas não restauram nem reativam integrações.
- Canal: use telefone/WhatsApp direto entre os responsáveis, fora do Oráculo quando houver suspeita de indisponibilidade ou comprometimento. O registro técnico do app é estruturado e não substitui a avaliação jurídica sobre comunicação a clientes, titulares ou ANPD.
- Registro: em `Configurações > Segurança > Saúde operacional`, use o ícone `Registrar incidente`, escolhendo ocorrência, severidade e serviço. Não há texto livre; não coloque segredo, mensagem, documento ou dado pessoal em logs/tickets técnicos.

Sequência de recuperação:

1. Marque o horário percebido, abra o incidente e suspenda mudanças sensíveis. Se o app ainda estiver acessível e o WhatsApp puder duplicar ou vazar resposta, desative a integração até a investigação terminar.
2. Confirme o escopo: Supabase/Auth, frontend Netlify, WhatsApp/Evolution, provedores de IA, backup interno e R2. Preserve logs sanitizados e não apague cópias externas.
3. Recupere Supabase primeiro: valide projeto, migrations e Functions. Se o projeto de origem estiver íntegro, use `Testar recuperação`; em perda total, restabeleça o frontend/Function a partir do commit aprovado e restaure a última cópia externa como clone.
4. Exija `verification.passed = true`: checksum, tabelas críticas, segredos ausentes e WhatsApp inerte. Faça login e abra Dashboard/KPIs, Plano Estratégico, Documentos e Arquivo antes de aceitar o clone.
5. Recupere o frontend Netlify a partir do mesmo SHA aprovado e execute smoke desktop/mobile. Não aponte usuários para um deploy não verificado.
6. Rotacione credenciais potencialmente expostas: Supabase/service role quando aplicável, R2, Evolution/webhook, IA e tokens de deploy. Cadastre os novos valores somente nos cofres/painéis corretos.
7. Reconfigure Evolution e provedores no clone. Mantenha WhatsApp, fila e outbox desligados até conexão, URL com `orgId`, segredo do webhook e envio controlado passarem.
8. Meça o resultado: `pendingSince` até o último snapshot aceito representa a perda potencial observável; `duration_ms` mede o pacote; o RTO completo termina somente quando app, dados e integrações críticas voltarem e forem testados.
9. Marque o incidente como resolvido, registre a decisão no changelog/runbook sem conteúdo sensível e conclua/remova clones que não viraram a nova operação.

Metas: RPO de até 30 minutos e RTO completo de até 4 horas. Ultrapassar qualquer meta mantém o status em atenção, exige investigação da causa e novo exercício após a correção.

Alertas adicionais da S4:

- réplica externa ausente, falha ou sem conclusão há mais de 26 horas;
- 20 ou mais arquivamentos operacionais em 15 minutos;
- migration destrutiva aprovada e auditada nas últimas 24 horas;
- teste mensal ou exercício trimestral vencido.

Uma migration destrutiva continua recusada por padrão. Quando a exceção for deliberadamente autorizada, o próprio arquivo precisa chamar `public.record_destructive_schema_change(...)`; sem esse marcador o workflow recusa o pacote mesmo com a opção destrutiva ligada. Os alertas permanecem informativos. PITR está desligado por decisão formal enquanto a réplica R2 append-only com lock de 90 dias cumprir a camada independente; qualquer troca dessa estratégia exige atualizar o monitor e repetir o exercício trimestral.

Prova de recuperação de 2026-07-14:

- backup de produção `8560d405-ac16-4287-a2e4-251604234065`, com 643 registros, 114.985 bytes e SHA-256 registrado;
- Storage interno e réplica R2 concluíram em aproximadamente 2 segundos, e o objeto foi conferido no bucket privado com o mesmo tamanho;
- o pacote foi restaurado no staging como empresa descartável em 22,7 segundos;
- 619 registros operacionais foram conferidos tabela a tabela; os 24 não recriados correspondem exatamente a 7 perfis de Auth, 6 memberships adicionais, 5 conversas e 6 sessões dependentes desses usuários;
- planos, objetivos, documentos, KPIs e 39 revisões operacionais bateram com o manifesto; chaves de IA e WhatsApp ficaram ausentes e a integração permaneceu inerte;
- o clone e o usuário técnico foram removidos após a validação.

Durante a primeira execução, updates necessários para reconstruir relações pai/filho geraram duas revisões de auditoria adicionais. A restauração agora remove somente essas revisões transitórias do clone antes de inserir o histórico original do snapshot. Nunca remova revisões da empresa de origem.

O dump lógico geral via `supabase db dump` é uma camada separada e, no ambiente local atual, exige Docker Desktop ou um `pg_dump` compatível. O backup por empresa não depende de Docker.

## Acesso protegido e emergência de produção

O ambiente padrão dos agentes não deve conter `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` ou `SUPABASE_SERVICE_ROLE_KEY` de produção. Para verificar o deploy:

```bash
pnpm run production:verify
```

Para publicar somente Edge Functions explicitamente autorizadas:

```bash
pnpm run production:functions -- oracle-chat whatsapp-worker
```

O macOS pedirá autorização para o item `com.oraculo.supabase.production`. Recusar a janela encerra o comando sem alterar produção. O wrapper recusa token já carregado, worktree sujo, nome inválido e qualquer ação fora da allowlist.

Emergência quando o GitHub estiver indisponível:

1. Confirme o commit e deixe o worktree limpo.
2. Autorize no Chaves somente as Functions necessárias.
3. Rode `pnpm run production:verify` ao terminar.
4. Registre commit, horário, motivo e resultado no handoff/changelog.
5. Se houver suspeita de exposição, revogue o token no Supabase, gere outro e atualize o item do Chaves sem registrar o valor.

Migrations e SQL administrativos não usam esse wrapper. O caminho rotineiro e exclusivamente **Actions > Production release > Run workflow**:

1. informe o SHA completo que ja passou em `CI required`;
2. escolha `verify`, `functions` ou `migrations`;
3. para Functions, informe apenas os nomes separados por espaco;
4. para um pacote de mais de um commit, informe o `base_sha` anterior;
5. deixe `allow_destructive_migration` desligado, salvo mudanca destrutiva deliberada e revisada;
6. antes de disparar, registre a autorização explícita do owner na conversa; depois acompanhe o workflow até o resultado final, sem uma segunda aprovação no GitHub.

O workflow revalida o estado publicado ao final. Migration pendente fora do intervalo aprovado, nome de Function invalido, SHA sem CI verde ou operacao destrutiva sem sinalizacao encerram o job antes da escrita. O deploy de frontend sem schema continua pelo fluxo Netlify abaixo.

A autorização na conversa é uma regra operacional e deve ocorrer imediatamente antes do `workflow_dispatch`. Ela não é validada criptograficamente pelo GitHub; a proteção técnica complementar vem do disparo manual autenticado, do SHA exato, do CI obrigatório, do preflight sem segredos, do escopo explícito e do Environment restrito à `main`. Push comum não publica Supabase em produção.

## Deploy frontend

Build local:

```bash
pnpm run build
```

Publicacao Netlify:

```bash
netlify deploy --prod --dir=dist --no-build
```

Os headers de segurança e cache vivem em `netlify.toml`. Antes de mudar CSP, publique com `netlify deploy --dir=dist --no-build`, rode `VERIFY_FRONTEND_URL=<draft> pnpm run verify:deploy` e confira o console do navegador. Novas origens externas devem ser liberadas de forma explícita; não use curingas para contornar bloqueios.

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

### Limite de créditos e `usage_exceeded`

No plano Netlify baseado em créditos, cada deploy de produção consome cota mesmo quando o conteúdo do build é igual. Portanto:

- não publique frontend para alteração apenas em documentação, testes, scripts ou Edge Functions;
- agrupe correções de runtime relacionadas em um único deploy;
- confira `Usage & billing > Credit usage breakdown` antes de uma sequência de publicações;
- compra de crédito, upgrade, assinatura e recarga automática exigem autorização explícita do owner imediatamente antes da confirmação.

Se o frontend responder `HTTP 503` com corpo público `usage_exceeded`:

1. pause piloto e novas publicações;
2. confirme que Supabase/Functions continuam íntegros com a parte administrativa do preflight;
3. abra o painel Netlify e confira saldo, consumo por deploy e data do próximo ciclo;
4. apresente ao owner preço, quantidade e forma de restauração, sem expor dados de pagamento;
5. não compre nada sem autorização explícita;
6. depois da restauração, confirme `HTTP 200` e rode `pnpm run production:verify`;
7. registre o incidente e ajuste a disciplina de deploy.

Em 2026-07-16, 67 deploys consumiram 1.005 créditos e pausaram o site. Uma compra única autorizada de 500 créditos por US$ 5 restaurou o acesso; a recarga automática permaneceu desligada. Esse histórico não autoriza compras futuras.

## Deploy Supabase

Migrations rotineiras sao aplicadas somente pelo workflow `Production release`. O comando abaixo fica reservado ao staging/local e a recuperacao de emergencia documentada:

```bash
supabase db push
```

Edge Functions:

`supabase/config.toml` e a fonte de verdade de `verify_jwt` para todas as funcoes. Nao dependa de flags manuais para definir a politica: depois do deploy, rode `pnpm run verify:deploy`. As funcoes publicas permitidas sao `whatsapp-webhook`, `month-turn`, `weekly-pulse`, `deadline-nudges`, `organization-backup`, `operational-health`, `whatsapp-sender` e `whatsapp-worker`; todas validam segredo ou autorizacao dentro da funcao.

## Retenção técnica automática

O cron `oraculo-data-retention` roda diariamente às 04:20 UTC. Ele não exige ação do usuário e não apaga planos, objetivos, documentos, conversas, sessões, KPIs, usuários, backups manuais ou auditorias críticas. Antes de investigar ou alterar a política, consulte a prévia somente-leitura com credencial administrativa no staging:

```sql
select public.preview_expired_technical_data();
```

Diagnóstico do agendamento e das últimas execuções:

```sql
select jobname, schedule, active
from cron.job
where jobname = 'oraculo-data-retention';

select policy_version, deleted_counts, executed_at
from public.data_retention_runs
order by executed_at desc
limit 10;
```

`anon`, membros e owners não executam a prévia/limpeza nem leem `data_retention_runs`. Não rode `cleanup_expired_technical_data` manualmente em produção para “testar”; valide no staging e deixe o cron executar. Para pausar em incidente, desative apenas o job no banco e preserve a tabela/funções para diagnóstico. Qualquer novo `DELETE` exige atualizar `docs/DATA_INVENTORY.md`, teste com registro vencido/recente e prova de que a memória correspondente permanece.

Prazos: filas concluídas 24h, dead 7d, deduplicação/saúde 30d, erros e alertas resolvidos 90d, pulsos/lembretes 180d, comandos finalizados 365d e uso/limites de IA 730d. Itens pendentes e alertas abertos não expiram nessa rotina.

## Monitor operacional

O cron `oraculo-operational-health` roda a cada cinco minutos. A Function `operational-health` mede frontend, migrations, webhook, p95 do WhatsApp, fila/outbox, backup, custo/falhas de IA e restauração. O endpoint e o segredo ficam em `operational_monitor_secrets`; nunca copie o segredo para frontend ou logs.

```sql
select status, checked_at, metrics
from public.operational_health_snapshots
where org_id = '<ORG_ID>'
order by checked_at desc limit 5;

select code, tone, title, first_seen_at, last_seen_at, resolved_at
from public.operational_alerts
where org_id = '<ORG_ID>'
order by last_seen_at desc;
```

Um alerta é resolvido automaticamente quando o sinal normaliza. O monitor não bloqueia funções e não envia WhatsApp. Para pausar chamadas automáticas sem apagar histórico, defina `endpoint_url = null`; o painel owner continua podendo executar uma leitura autenticada.

### Código de ocorrência do frontend

Quando o usuário informar um código `ORC-XXXXXXXXXX`, consulte somente a linha sanitizada:

```sql
select occurrence_id, error_code, path, created_at
from public.frontend_error_events
where org_id = '<ORG_ID>' and occurrence_id = 'ORC-XXXXXXXXXX';
```

O código ajuda a localizar momento e tela, mas não contém diagnóstico completo. Nunca peça stack, token ou conteúdo empresarial ao usuário. Se a ocorrência se repetir, reproduza com os mesmos passos e use os logs estruturados do horário correspondente.

```bash
supabase functions deploy apply-kpi-import
supabase functions deploy company-research
supabase functions deploy create-organization
supabase functions deploy deadline-nudges
supabase functions deploy invite-member
supabase functions deploy operational-lifecycle
supabase functions deploy organization-backup
supabase functions deploy organization-lifecycle
supabase functions deploy remove-member
supabase functions deploy save-ai-settings
supabase functions deploy save-historical-document
supabase functions deploy save-objective
supabase functions deploy save-whatsapp-settings
supabase functions deploy set-member-area
supabase functions deploy set-member-role
supabase functions deploy set-objective-kpi-links
supabase functions deploy oracle-chat
supabase functions deploy oracle-session
supabase functions deploy month-turn
supabase functions deploy suggest-historical-metadata
supabase functions deploy suggest-kpi-spreadsheet
supabase functions deploy suggest-objective-kpis
supabase functions deploy weekly-pulse
supabase functions deploy whatsapp-webhook
```

Se a CLI pedir login ou link do projeto, conecte ao projeto correto antes de publicar.

Observacao operacional: no ambiente atual, o deploy via CLI nova aceitou o formato:

```bash
supabase functions deploy whatsapp-webhook oracle-chat --project-ref bkswkfazkjilwfzwzthz --use-api
```

Use `--use-api` quando Docker local nao estiver disponivel.

## Pulso semanal do WhatsApp

O owner ativa em `Configuracoes > WhatsApp`, escolhe dia util e horario de Sao Paulo. O cron `oraculo-weekly-pulse` roda a cada hora no minuto 5; a function so envia quando dia/hora combinam, o coordenador tem plano trimestral ou mensal ativo e nao existe sessao de planejamento em andamento.

Diagnostico:

```sql
select * from cron.job where jobname = 'oraculo-weekly-pulse';
select * from public.weekly_pulse_log order by sent_at desc limit 20;
```

Para simular sem enviar, invoque `weekly-pulse` com o segredo do cron e `{"dryRun":true}`. O pulso e deduplicado por empresa, pessoa e semana. Sem resposta, nao ha segundo envio. Uma resposta concreta recebe uma pergunta natural de confirmacao antes de usar o fluxo de atualizacao rapida.

## Configurar ou calibrar o tom do Oraculo

O owner pode ajustar o tom em Configuracoes > Tom do Oráculo. Os presets disponíveis são Equilibrado, Gentil, Ácido/franco, Direto, Motivador e Personalizado. O personalizado libera os eixos e uma preferência da casa de até 280 caracteres. Coordenadores e admins enxergam a configuração em modo somente leitura.

O valor fica em `public.org_ai_tone`. Sem linha para a empresa, o comportamento é Equilibrado e nenhuma diretiva adicional entra no prompt.

Consulta de diagnóstico:

```sql
select org_id, preset, axis_acidity, axis_drive, custom_note, updated_at
from public.org_ai_tone
where org_id = '<ORG_ID>';
```

Se o valor foi salvo mas a resposta não mudou, publique novamente `oracle-chat`, `oracle-session` e `whatsapp-webhook`. Se a tela não permitir salvar, confirme que a membership é `owner`; a RLS bloqueia escrita por `admin` e `coordinator`.

Para calibrar o comportamento-base de todas as empresas, a persona e os roteiros empacotados continuam em:

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
## Conta pessoal e desligamento (Fatia 6D)

Fluxo normal no app:

1. abra `Configurações > Minha conta` ou **Gerenciar** no menu da conta;
2. nome, email e celular podem ser corrigidos no mesmo formulário; troca de email pode exigir confirmação do novo endereço pelo Supabase Auth;
3. **Baixar** gera um JSON local com escopo pessoal, sem criar arquivo no Storage;
4. **Excluir minha conta** pede o email atual uma única vez;
5. se a pessoa for último owner, promova outro owner ou encerre a empresa e tente novamente;
6. depois do sucesso, a sessão é encerrada e o telefone deixa de identificar a pessoa no WhatsApp.

Verificação técnica em staging:

```bash
set -a
source .agents-private/agent-env
set +a
node node_modules/vitest/vitest.mjs --config vitest.integration.config.ts run tests/integration/personal-account-lifecycle.test.ts --passWithNoTests=false
```

O teste deve provar três fatos: Admin Auth não apaga o último owner; uma exclusão permitida mantém registros empresariais com autoria nula; e o telefone só é removido após o último vínculo. Não teste exclusão com uma conta real nem em produção. Para diagnóstico, consulte somente status/contagens de `personal_data_requests`; não grave email, nome, telefone ou conteúdo em `result_summary`.

Publicação exige a migration `20260715170000_personal_account_lifecycle.sql`, a Function `personal-account` e o frontend. A migration substitui FKs por `SET NULL`; no workflow protegido ela deve ser tratada como alteração destrutiva de schema autorizada, embora não apague linhas nem conteúdo.

## Auditoria administrativa (Fatia 6E)

O registro é automático. O owner consulta `Configurações > Auditoria`, filtra por Pessoas, IA, WhatsApp, Segurança, Backups ou Dados e expande um item para ver estado anterior/posterior e request ID. Admin e coordenador não enxergam a aba nem recebem linhas pela RLS.

Diagnóstico somente no staging ou com acesso administrativo autorizado:

```sql
select category, action, actor_name, target_type, request_id, created_at
from public.administrative_audit_events
where org_id = '<org_id>'
order by created_at desc, id desc
limit 50;
```

Nunca coloque chave, token, senha, email, telefone, prompt, mensagem ou conteúdo em `before`, `after`, `metadata`, `target_label` ou `request_id`. Use somente estado operacional mínimo e booleans como `has_api_key`. Toda nova Function administrativa deve chamar `_shared/administrative-audit.ts`, reutilizar o request ID recebido e ganhar teste de sanitização/RLS. A exclusão de conta anonimiza ator e alvo; não remova eventos manualmente.

Validação de staging:

```bash
pnpm exec vitest --config vitest.config.ts run src/test/administrative-audit.test.ts
pnpm exec vitest --config vitest.integration.config.ts run tests/integration/administrative-audit.test.ts
pnpm exec vitest --config vitest.security.config.ts run tests/security/risk-coverage.test.ts
pnpm run test:e2e:staging
```

Publicação exige a migration `20260715193000_administrative_audit.sql`, as Functions `invite-member`, `remove-member`, `set-member-role`, `set-member-area`, `save-ai-settings`, `save-whatsapp-settings`, `save-security-settings`, `save-ai-control-policy`, `organization-backup` e `personal-account`, além do frontend. Depois do deploy, faça uma alteração administrativa reversível em empresa descartável, confirme um único evento sem dados sensíveis e reverta a alteração.
