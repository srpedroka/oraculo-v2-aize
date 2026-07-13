# Seguranca

## Principios

- O frontend nunca recebe segredos de servidor.
- Dados de empresa sao isolados por membership e RLS.
- Acoes sensiveis passam por Edge Functions com validacao de sessao.
- Documentacao pode citar nomes de variaveis, mas nunca valores secretos.
- O mapa operacional de onde cada acesso vive fica em `docs/ACCESS.md`.

## Headers do frontend

O Netlify aplica a política definida em `netlify.toml`:

- CSP com scripts/fontes no próprio app, conexão apenas com o Supabase do Oráculo e workers locais/`blob:`;
- `frame-ancestors 'none'`, `frame-src 'none'` e `X-Frame-Options: DENY` contra clickjacking;
- `object-src 'none'`, sem `unsafe-eval`;
- `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` bloqueando câmera, microfone, localização, pagamento e USB;
- HSTS por um ano com `includeSubDomains` e `preload`.

`style-src 'unsafe-inline'` permanece necessário para estilos dinâmicos de componentes React/Recharts; isso não libera script inline. Qualquer nova origem externa deve ser adicionada somente após revisão e teste em deploy de preview. `pnpm run verify:deploy` confere a política publicada, o cache revalidável do HTML e o cache imutável dos assets com hash.

## Variaveis e segredos

Pode existir no frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nao pode existir no frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- chaves de OpenAI, Anthropic ou outros provedores de IA;
- senhas de banco;
- tokens Netlify;
- dumps de banco.

Secrets das Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MONTH_TURN_SECRET` para proteger chamadas agendadas da funcao `month-turn`. **Obrigatorio**: desde 2026-07-05 a funcao falha fechada (retorna erro) se o segredo nao estiver configurado, e o segredo e comparado em tempo constante. Configurar o secret antes de habilitar o cron.
- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` e `BACKUP_S3_REGION` são opcionais e habilitam réplica automática fora do projeto principal. Nunca enviá-los ao frontend.

Segredos operacionais salvos pelo app:

- chaves de IA ficam em `public.ai_model_keys`, com RLS habilitado, acesso revogado para `anon`/`authenticated` e permissao apenas para `service_role`;
- chave da Evolution API e segredo do webhook ficam em `public.whatsapp_instance_keys`, com o mesmo modelo de acesso exclusivo por `service_role`.

A partir da fundacao V3, `public.ai_model_keys` passa a aceitar uma chave por provedor e empresa (`org_id`, `provider`). Isso prepara OpenAI, Anthropic, Moonshot/Kimi e xAI/Grok sem expor nenhum segredo novo ao navegador. A configuracao visivel de qual modelo usar por funcao fica em `public.ai_function_settings`, que nao guarda chave real e segue RLS de leitura para membros e escrita apenas para owner. O status visivel das chaves fica em `public.ai_provider_key_status`, com apenas `has_key`, `key_preview` e `updated_at`.

Historico: a V2 criou primeiro tabelas equivalentes no schema `private`. Em 2026-07-02 os segredos foram migrados para tabelas publicas bloqueadas por RLS/revokes porque as Edge Functions do ambiente atual acessam essas tabelas via service role com mais previsibilidade operacional. A regra de seguranca continua a mesma: o navegador nunca le esses valores.

## Chaves de IA

O usuario configura a chave pela tela de configuracoes. O frontend envia a chave para `save-ai-settings`, e a funcao:

1. valida sessao;
2. exige papel `owner`;
3. salva a chave real em `public.ai_model_keys`, acessivel apenas por service role;
4. salva apenas `has_key`, `key_preview` e provider em `public.ai_provider_key_status`;
5. quando o payload legado e usado, preserva `public.ai_settings` para compatibilidade.

A tabela de chave real tem RLS habilitado, acesso revogado para `anon` e `authenticated`, e permissao apenas para `service_role`.

Os modelos por funcao (`planning`, `daily`, `background`) ficam em `public.ai_function_settings`; essa tabela nao contem segredo e so owners podem alterar.

O tom/persona por empresa fica em `public.org_ai_tone`. Não contém segredo: membros da empresa podem ler e apenas owners podem inserir, alterar ou excluir por RLS. Os eixos são limitados a `-2..2` e a preferência personalizada a 280 caracteres. A diretiva resultante altera somente a forma da resposta e inclui uma trava explícita para não substituir regras de conduta, segurança, contrato JSON ou confirmação de gravação.

Ao salvar ou testar IA, `save-ai-settings` valida a combinacao provider/modelo/chave com uma chamada minima server-side. O retorno para o frontend contem apenas status, modelo, provedor, horario e detalhe truncado do erro; a chave real nunca volta ao cliente. As colunas `last_status*` tambem recebem erros de runtime por funcao, permitindo diagnosticar modelo invalido ou chave recusada sem abrir logs nem expor segredo.

## Uso, pricing e custo de IA

O app registra consumo de IA em `public.ai_usage_logs`:

- provider e modelo;
- canal (`web`, `whatsapp` ou `system`);
- tokens de entrada e saida;
- preco salvo no momento da chamada;
- custo estimado em dolar;
- metadata operacional sem segredos.

A tela de Configuracoes mostra o consumo para membros da empresa. A insercao e feita por Edge Functions com service role depois da resposta do modelo.

Precos conhecidos ficam no codigo em:

- `src/lib/aiPricing.ts`, para preencher a UI;
- `supabase/functions/_shared/pricing.ts`, para resolver pricing no servidor ao salvar IA.

Ao trocar modelo/provedor, verificar fonte oficial de pricing e registrar a fonte em `pricing_source`. Nao inserir chave de API no codigo nem em migrations.

Na Fase 1 da V3, o catalogo foi atualizado com xAI/Grok e modelos recentes da Anthropic. O app nao pede preco manual para modelos conhecidos; a tela mostra o valor cadastrado no catalogo e as Edge Functions gravam o custo estimado no momento da chamada. Logs de uso incluem `metadata.aiFunction` para separar planejamento, dia a dia e bastidores.

## Senhas

Senhas nao sao salvas no frontend, na documentacao ou no banco em texto puro. A recuperacao usa o fluxo nativo do Supabase Auth: o app solicita o email de redefinicao e, depois do link, chama `updateUser` para gravar a nova senha.

## MFA opcional para owners

- TOTP usa o Supabase Auth; QR Code, segredo e códigos nunca são gravados nas tabelas do Oráculo, logs ou documentação.
- A política por empresa nasce desligada. Cadastrar um fator não muda o login nem ativa bloqueios automaticamente.
- Alterar a própria política exige sessão `aal2`; não é possível ativá-la sem fator confirmado.
- Quando ligada, chaves/configuração de IA, WhatsApp, papéis, download/restauração de backup e arquivamento/exclusão exigem `aal2` no servidor. Policies de memberships/IA/WhatsApp também usam `critical_action_aal_ok` para impedir atalho pela Data API.
- Coordenadores e admins não são obrigados a cadastrar MFA nesta versão.
- Supabase não fornece recovery codes. Recomenda-se cadastrar dois fatores. Sem fator utilizável, um administrador deve validar a identidade e remover o fator pelo Admin Auth; a remoção de fator verificado encerra as sessões ativas.

## Limites e orçamento de IA

- A política nasce ausente e resolve para `monitor`: 10 chamadas por pessoa/minuto, 60 por empresa/minuto e referência mensal de US$ 100. Nenhum desses valores bloqueia por padrão.
- Contadores ficam em tabela exclusiva de service role; incrementos concorrentes usam upsert atômico no PostgreSQL.
- Somente owner lê alertas e altera a política. Escrita passa por `save-ai-control-policy`; se a empresa exigir MFA em ações críticas, a mudança também exige `aal2`.
- Alertas de 70%, 90% e 100% são atualizados depois de cada custo registrado e deduplicados por empresa/mês/faixa.
- Em falha da telemetria, a chamada continua (fail-open) e o erro técnico é logado sem conteúdo privado. Dados estratégicos nunca são removidos por limite.
- Backups incluem política e alertas, mas restauração sempre força `enforcement_mode = monitor` para não bloquear o clone inesperadamente. Contadores efêmeros não entram no pacote.

## WhatsApp

O webhook `whatsapp-webhook` aceita chamadas com o segredo configurado no cabecalho `x-oraculo-webhook-secret` ou `Authorization: Bearer`. Desde 2026-07-05 o segredo **nao** e mais aceito via query string (`?secret=`), porque vaza em logs de proxy/acesso, e a comparacao e feita em tempo constante. Excecao operacional: o Evo Go Manager nao expoe header customizado; nesse provedor, a URL pode usar `evoGoToken`, um HMAC-SHA-256 derivado do `webhook_secret` e do `orgId`, sem expor o segredo bruto. O numero recebido e normalizado e precisa existir em `profiles.phone`; numero sem cadastro recebe recusa educada e nao acessa contexto da empresa.

Download de midia (audio/documento) por URL vinda do payload passa por guarda anti-SSRF: apenas `http(s)`, com bloqueio de loopback, redes privadas, link-local (inclui o metadata `169.254.169.254` de cloud) e nomes internos; ha teto de tamanho por download; e a `apikey` da Evolution so e enviada quando o host da URL e o da propria instancia (`instance_url`), nunca para um CDN ou host arbitrario.

Convites por WhatsApp sao gerados dentro da Edge Function `invite-member`, usando service role no servidor. O frontend nunca recebe a chave da Evolution API e tambem nao monta a chamada direta para a VPS. O link de acesso (invite ou magiclink) e entregue **somente** ao celular informado, via WhatsApp. Nao ha convite por email na UI.

Mensagens recebidas pelo WhatsApp sao gravadas em `chat_messages` antes da chamada de IA, com `user_id` e `conversation_id`. Isso facilita diagnostico quando a IA falha: se houver mensagem `user` sem resposta `oracle` na mesma conversa, investigar logs da Edge Function, provider/modelo, chave de IA e envio pela Evolution.

Áudios recebidos pelo WhatsApp sao processados pela Edge Function: o arquivo e baixado da Evolution quando possivel, descriptografado em memoria quando vier como mídia criptografada do WhatsApp, transcrito pela OpenAI e salvo no historico apenas como texto transcrito. O áudio bruto, a mídia criptografada, URLs temporarias e `mediaKey` nao devem ser salvos no banco, impressos em logs, enviados ao frontend ou versionados no repositorio.

Quando a transcrição falhar, o sistema pode exibir um codigo tecnico seguro com etapa, status HTTP, tipo de arquivo, tamanho e assinatura curta dos primeiros bytes. Esse codigo existe para diagnostico sem abrir logs brutos de producao. Ele nao deve incluir conteudo da fala, chave da Evolution, chave OpenAI, segredo de webhook, URL temporaria completa ou payload completo.

Arquivos enviados pelo WhatsApp sao processados em memoria para extração de texto e classificação do plano correto. O arquivo bruto nao deve ser salvo no banco, versionado no repositorio nem enviado ao frontend. O historico pode guardar um resumo curto do arquivo e parte limitada do texto extraido para rastreabilidade da conversa; documentos sensiveis devem ser tratados como dados privados da empresa. Quando o documento for classificado como Plano Estrategico, Trimestral ou Mensal, o texto extraido gera uma proposta pendente em `planning_sessions`; a escrita real no banco continua exigindo confirmação explicita do usuario e validação server-side.

Na Fase 4 da V3, o WhatsApp ganhou roteamento de intencao e atualizacoes rapidas de execucao. Esse e o unico fluxo em que o Oraculo pode gravar sem proposta formal, e somente para pequenas alteracoes operacionais: marcar acao como concluida, atualizar percentual de objetivo mensal, alterar status quando a intencao estiver clara ou registrar evidencia curta. Antes de escrever, `_shared/quick-updates.ts` valida membership, papel e escopo da area: owner pode atualizar a empresa; coordenador so atualiza objetivo/acao da propria area. Se houver ambiguidade de alvo ou falta de percentual/evidencia, o Oraculo deve perguntar antes de gravar.

O classificador de intencao usa a funcao de IA `background`, mas a decisao de escrita nao confia apenas no texto do modelo. O servidor cruza a resposta da IA com candidatos reais do banco, calcula similaridade, valida permissao e aplica somente operacoes conhecidas. Criacao de plano, objetivo e acao continua exigindo `proposal` + confirmacao pela sessao de planejamento.

## Revisao de seguranca 2026-07-05

Auditoria completa (RLS/migrations, Edge Functions, frontend) mais teste ponta a ponta com conta de teste nova. Corrigido no mesmo ciclo: fail-open do `month-turn`, SSRF + vazamento da `apikey` no download de midia do webhook, aceitacao do segredo do webhook por query string e comparacoes de segredo sem tempo constante. Verificado OK: isolamento de tenant por RLS (`is_org_member`/`is_owner`/`can_write_area`/`can_write_objective`), funcoes `SECURITY DEFINER` com `search_path` fixo, mascaramento de chaves na UI (`has_key`/`key_preview`), ausencia de `dangerouslySetInnerHTML` e de `console.*` com segredo no frontend, e gravacao por proposta usando dados do banco (nao do modelo).

Recomendacoes pendentes (decisao do dono, ainda nao aplicadas):

- **Segredos no schema `public`**: `public.ai_model_keys` e `public.whatsapp_instance_keys` guardam chave/segredo em texto puro e dependem so de RLS + revokes. Uma futura migration de rotina com `grant ... on all tables in schema public` pode reabrir acesso. Avaliar mover para `private`/Supabase Vault (exige redeploy coordenado das Edge Functions).
- **Erros de mutacao silenciosos no frontend**: `src/state/store.tsx` usa inserts/updates fire-and-forget sem `.catch`; a UI pode exibir sucesso falso (ex.: "Chave salva") quando a operacao falhou. Recomendado propagar erro para a UI.
- **Confirmacao de identidade no webhook**: o segredo do webhook e um shared secret estatico por org; se vazar, permite spoof de `profiles.phone` da org. Considerar validacao de assinatura HMAC do provedor, se suportada.
- **Dashboard "Evolucao"**: resolvido em 2026-07-07. A seção deixou de usar rótulos fixos de demonstração e passou a renderizar objetivos reais do tipo Evolução, com estado vazio quando não houver dados.

Na Fase 5, fechamentos de mes e trimestre tambem seguem `proposal` + confirmacao. O modelo monta `month_close` ou `quarter_close`, mas a escrita so acontece em `proposals.ts` depois de validar membership, area e permissao. A gravacao permitida e limitada a atualizar status/progresso, registrar evidencias, criar check-in, rolar pendencias para o proximo periodo e atualizar foco de aprendizado do trimestre.

Arquivos importados pela tela de Plano Estrategico, pela tela de Planos Trimestrais ou anexados no chat lateral sao lidos no navegador apenas para extrair texto. O arquivo bruto nao e salvo no banco. Quando o usuario escolhe "Gerar proposta e carregar no módulo" no Plano Estrategico, o frontend envia somente o texto extraido/colado para `oracle-session` com `action = import_ready_plan`; quando importa um plano trimestral por departamento, envia somente o texto para `action = import_ready_quarterly_plan`. A gravacao estruturada ainda depende de proposta, confirmacao do usuario e validacao server-side. A opção "Só revisar texto" nao chama IA nem grava dados. Quando o usuario escolhe "Importar historico", pode chamar `suggest-historical-metadata` para sugerir tipo, area, periodo e titulo com a funcao de IA `background`; essa funcao nao grava dados, restringe areas candidatas conforme permissao e deixa o periodo vazio quando nao ha data clara. A gravacao final chama `save-historical-document`, que valida permissao, exige periodo informado e grava `plan_documents.origin = historical`; esse fluxo nao cria objetivos, acoes ou planos ativos.

Planilhas de KPI (`.xlsx`, `.xls` e `.csv`) tambem sao lidas somente no navegador. O arquivo bruto nao e enviado nem guardado: `src/lib/kpiSpreadsheet.ts` extrai uma tabela textual limitada, e `suggest-kpi-spreadsheet` recebe apenas esse texto depois de validar sessao e papel `owner`/`admin`. A IA de bastidores devolve uma proposta sanitizada, restrita aos quatro indicadores e aos meses 1-12; ela nunca grava `kpi_monthly_values`. O usuario revisa a previa e confirma a aplicacao, que continua sujeita a RLS `is_admin(org_id)`. Campos que a planilha nao informou preservam o valor existente em vez de serem apagados por uma inferencia vazia.

O mesmo fluxo de KPI aceita JPG, PNG e WEBP. A imagem e reduzida no navegador e enviada em memoria somente para a chamada de visao do provedor configurado em `background` (OpenAI, Anthropic ou xAI); o Oraculo, Supabase e `plan_documents` nao guardam a imagem nem seu base64. A proposta pode conter anos passados, mas e limitada aos quatro KPIs, meses 1-12 e numeros que o modelo identificou com clareza. Depois da confirmacao, `apply-kpi-import` revalida a proposta no servidor, grava os valores e salva apenas o registro estruturado em `plan_documents.type = kpi_history`, com fonte, resumo, avisos e linhas aplicadas. O documento nao entra na memoria de planejamento estrategico.

Documentos padronizados da Fase 6 e historicos importados ficam em `public.plan_documents` como JSON (`content`). Eles podem conter objetivos, metas, donos, prazos, aprendizados, decisoes, texto historico da empresa e a classificacao revisada pelo usuario em `content.classification`, portanto sao dados privados protegidos por RLS. Eles nunca devem conter arquivo bruto, audio bruto, URL temporaria de midia, `mediaKey`, chave de IA, chave da Evolution, senha ou segredo de webhook. A exportacao PDF usa a impressao do navegador a partir do documento renderizado; nenhum PDF gerado pelo usuario e salvo automaticamente no banco.

## RLS

Todas as tabelas publicas com dados do produto tem RLS habilitado.

Regras principais:

- membro da empresa le dados da empresa;
- owner escreve dados administrativos e configuracoes;
- admin escreve definicoes e lancamentos dos KPIs executivos do Dashboard;
- owner escreve o tom/persona da empresa em `org_ai_tone`; demais membros têm somente leitura;
- coordenador escreve apenas na propria area;
- acoes e evidencias seguem permissao do objetivo ligado.

Os KPIs executivos usam duas tabelas publicas: `executive_kpis` e `kpi_monthly_values`. Membros da empresa podem ler os quatro indicadores; escrita exige `is_admin(org_id)`, que retorna verdadeiro apenas para membership `owner` ou `admin`. O papel `admin` nao deve ser usado como substituto de `owner` em configuracoes, membros, areas, IA, WhatsApp ou fluxos de planejamento.

`objective_kpi_links` permite leitura a membros da empresa e escrita somente quando `can_write_objective(org_id, objective_id)` autoriza o mesmo objetivo. A policy tambem verifica que o KPI pertence a mesma empresa. `suggest-objective-kpis` nunca grava: valida sessao/area, limita a IA aos KPIs reais e devolve no maximo dois candidatos para confirmacao humana.

O pulso semanal usa `weekly_pulse_log`, sem acesso para `anon`/`authenticated`, e o mesmo segredo protegido do cron de prazos. `conversations.pending_context` expira e serve apenas para reconhecer a resposta ao convite; nenhuma atualizacao e aplicada antes de uma confirmacao explicita.

A mudanca de papel operacional passa pela Edge Function `set-member-role`, usando service role depois de validar que o usuario autenticado e owner. Esse fluxo permite alternar membros entre `admin` e `coordinator`, e rebaixar owner somente quando nao for o ultimo owner da empresa. Ele nao promove novos owners.

A remoção de acesso passa pela Edge Function `remove-member`. O navegador não possui mais privilégio/policy de `DELETE` em `memberships`; a função valida owner e chama `remove_organization_member`, RPC disponível somente para `service_role`. A transação bloqueia as memberships da empresa, impede remover o último owner, valida coordenadores substitutos, reatribui ou limpa `areas.coordinator_id` e só então remove a membership. O registro de `profiles` e o usuário de Auth permanecem porque podem ter histórico ou acesso a outra empresa.

Áreas usam arquivamento reversível por `archived_at`/`archived_by`. O arquivamento não apaga relações em cascata. Helpers RLS de coordenador, Edge Functions, WhatsApp e contexto da IA aceitam apenas áreas ativas; owners podem restaurar a área. Backups exportam também áreas arquivadas e remapeiam `archived_by` na restauração.

O ciclo operacional segue a mesma regra de preservação. `objectives`, `key_actions`, `strategic_projects`, `evidences`, `check_ins` e `plan_documents` não podem mais receber `DELETE` do papel `authenticated`; a retirada passa por `operational-lifecycle`, que autentica o usuário, valida owner/coordenador e usa a RPC `set_operational_item_archived` exclusiva de `service_role`. Arquivar um objetivo usa um lote transacional para retirar seus descendentes, ações e evidências ativos. A restauração usa o mesmo lote e não reativa registros que já estavam arquivados antes.

`operational_revisions` é somente leitura para membros da empresa e não aceita escrita do navegador. Triggers `SECURITY DEFINER` com `search_path` fixo registram estado anterior/posterior de planos, objetivos, ações, projetos, evidências, check-ins, documentos e KPIs. O histórico entra no backup por empresa; `changed_by` e os IDs de entidade são remapeados na restauração. Nenhum segredo é incluído nos snapshots porque as tabelas de chaves não participam desse mecanismo.

O ciclo de vida da própria empresa segue a mesma trava. `authenticated` não pode mais dar `DELETE` em `public.organizations` (a policy `organizations_delete_owner` foi removida e o privilégio revogado); sair, arquivar, restaurar e excluir passam pela Edge Function `organization-lifecycle`. Sair usa `remove_organization_member` para a própria membership (o único owner é bloqueado). Arquivar/restaurar usa `set_organization_archived` (reversível; arquivar pausa o WhatsApp sem apagar segredo). A exclusão definitiva (`delete_organization_permanently`, exclusiva de `service_role`) só roda com a empresa arquivada, um backup `completed` recente e o nome digitado conferindo; ela revoga chaves de IA, apaga `whatsapp_instance_keys`, limpa os objetos do bucket de backup e então remove a empresa em cascata. `organization_lifecycle_audit` registra quem/quando/por quê e é intencionalmente sem FK para `organizations`, então a linha de `permanent_delete` sobrevive à exclusão; a leitura é restrita ao owner enquanto a empresa existir.

## Dados de conta

Importacao historica: o navegador nao envia arquivo/imagem bruto para gravacao; `save-historical-document` revalida e limita texto, metadados, evidencias e backup, rejeita base64/data-URL e grava apenas texto/tabelas/decisoes. `source_metadata` e orientativo e nunca concede permissao. Lotes sao validados integralmente antes de uma unica insercao. Admin nao importa historico.

O email fica em `profiles.email` para administracao. O celular fica em `profiles.phone`, com formato internacional e unicidade no banco. Ele e dado pessoal e identificador de acesso ao WhatsApp. A propria conta edita seu celular; o **owner** tambem pode editar nome e celular de outros membros (via `invite-member` com `notify=false`/upsert de perfil service_role), porque o celular e o canal do convite.

Ao criar nova tabela:

1. habilite RLS;
2. crie politicas de leitura e escrita;
3. adicione indices por `org_id` quando aplicavel;
4. documente a tabela em `ARCHITECTURE.md`;
5. rode build e teste manual do fluxo.

## Backups por empresa

- Somente owner pode listar, criar, baixar, remover ou restaurar backups da empresa.
- `organization_backup_secrets` e `organization_backup_requests` têm RLS, grants revogados para `anon`/`authenticated` e acesso operacional apenas por `service_role`/Postgres.
- O cron chama `organization-backup` sem JWT apenas porque valida `x-oraculo-backup-cron-secret` em tempo constante contra um segredo aleatório gerado no banco.
- O bucket `organization-backups` é privado e não possui policies para o navegador; acesso ao objeto passa pela Edge Function depois de validar owner.
- Pacotes excluem `auth.users`, hashes de senha, `ai_model_keys`, `ai_provider_key_status`, `whatsapp_instance_keys`, eventos técnicos do WhatsApp e mídia temporária.
- O pacote portátil é cifrado no navegador com PBKDF2/SHA-256 e AES-256-GCM. A senha não é transmitida nem armazenada; perdê-la torna o arquivo portátil irrecuperável.
- A restauração usa modo `clone`: cria outro `org_id`, remapeia FKs, desativa WhatsApp, zera status de chaves de IA e exige reinformar credenciais. Qualquer falha remove a empresa parcial por cascata.
- Importação sem `org_id` só é aceita para usuário autenticado sem nenhuma membership, permitindo recuperação após perda da única empresa sem abrir uma rota geral de criação em massa.
- O Storage interno não substitui uma cópia externa. Quando S3 não está configurado, a tela sinaliza a pendência e o owner deve guardar o pacote portátil em local independente.

## Fundacao V3

As tabelas `conversations`, `planning_sessions`, `ai_function_settings` e `plan_documents` foram criadas para suportar memoria, condução estruturada e documentos padronizados.

Regras de seguranca:

- `conversations`: cada usuario autenticado le e atualiza apenas as proprias conversas; owners podem ler todas as conversas da empresa para supervisao. Edge Functions usam service role para gravacoes de canais externos. Episodios encerrados por 4 horas de inatividade ficam arquivados, nao apagados, e continuam sob a mesma RLS.
- `planning_sessions`: cada usuario le e atualiza as proprias sessoes; owner tambem pode ler. Quando a sessao envolve uma area, escrita exige permissao pela mesma regra de coordenador da area.
- `ai_function_settings`: membros leem a configuracao de modelo; apenas owner altera.
- `plan_documents`: membros leem documentos da empresa; owner grava documentos gerais e coordenadores gravam documentos da propria area. Historicos importados usam a mesma regra de leitura/escrita, mas ficam marcados com `origin = historical`.

Essas tabelas nao guardam chaves reais de IA, senhas, arquivos brutos ou audios. Documentos estruturados ficam como dados privados da empresa e dependem de RLS para isolamento por organizacao.

Na Fase 3, `conversations.summary` guarda um resumo de conversa gerado por IA. Esse resumo pode conter decisoes, numeros e pendencias da empresa, portanto deve ser tratado como dado privado da organizacao. Ele nunca deve guardar chave de API, segredo de webhook, senha, URL temporaria de mídia, audio bruto ou arquivo bruto.

O contexto do plano enviado ao modelo e montado server-side por `_shared/plan-context.ts`. Ele inclui apenas dados de produto que o usuario ja poderia acessar pela empresa/area: objetivos, planos, acoes-chave, evidencias e check-ins. A Memoria Estrategica pode incluir ate 5 documentos historicos truncados de `plan_documents.origin = historical` nos planejamentos estrategico, trimestral, mensal e por area. A selecao prioriza o escopo da empresa e a area em foco; historicos de outras areas nao entram quando uma area especifica foi escolhida. Segredos continuam fora desse contexto.

## Sessoes e propostas da V3

`oracle-session` usa service role para conduzir sessoes, mas valida o usuario autenticado antes de qualquer acao:

- `start`: exige membership na empresa; se houver area e o usuario for coordenador, exige que a area seja dele.
- `message`: exige que a sessao pertença ao usuario autenticado.
- `confirm`: exige proposta pendente e valida permissao novamente em `proposals.ts` antes de gravar.
- `abandon`: so altera sessoes do proprio usuario.

Criacao de planos, objetivos e acoes nunca acontece apenas porque o modelo pediu. O modelo gera uma `proposal`; o usuario precisa confirmar; o servidor valida permissao; so entao o banco e alterado. Essa separacao evita que prompt injection ou erro de interpretacao grave dados sem confirmacao explicita.

No fluxo de plano pronto, seja estrategico, trimestral ou mensal, texto de arquivo deve ser tratado como conteudo nao confiavel. Ele pode orientar a proposta, mas nao pode substituir as regras do sistema, exigir exposicao de segredo ou pular a confirmacao.

Atualizacoes rapidas por WhatsApp sao deliberadamente menores que uma proposta. Elas nao podem criar planejamento novo, trocar dono da empresa, alterar configuracao, salvar chave, convidar membro ou apagar dados. Se uma mensagem pedir algo fora desse escopo, o fluxo deve responder com orientacao ou iniciar sessao de planejamento, nao gravar direto.

Revisao Estrategica (`strategic_review`) e um ritual owner-only no escopo da empresa. O backend bloqueia inicio com `area_id` ou por usuario que nao seja `owner`, e a confirmacao passa novamente por `assertProposalPermission`. A proposta `apply_strategic_review` nao pode criar, excluir, renomear ou trocar objetivos em massa: ela so atualiza objetivos estrategicos existentes da mesma organizacao e sem area, nos campos `metric`, `target`, `current`, `deadline` e `status`. Cada ajuste precisa de justificativa; ao confirmar, o servidor grava snapshot antes/depois em `plan_documents.type = strategic_review`.

## Arquivos que nao devem ser versionados

Ja cobertos no `.gitignore`:

- `.env`
- `.env.*`
- `.supabase-private/`
- `.netlify/`
- `dist/`
- `node_modules/`
- `*.zip`
- `*.dump`
- `*.sql.gz`
- `*.log`

## Se um segredo vazar

1. Remova o segredo do arquivo.
2. Nao publique o valor em docs ou mensagens.
3. Rotacione a credencial no provedor correspondente.
4. Se ja foi commitado, trate como exposto mesmo que o repositorio seja privado.
5. Registre no `RUNBOOK.md` apenas a orientacao de recuperacao, nunca o segredo.

## Checklist antes de deploy

- `pnpm run check` (lint + testes + build);
- `pnpm run verify:deploy` (migrations, `verify_jwt`, frontend, segredos versionados);
- `pnpm run lint`
- `pnpm run build`
- conferir se `.env` nao esta versionado;
- conferir se `SUPABASE_SERVICE_ROLE_KEY` nao aparece em `src/`;
- testar login/onboarding;
- testar rota direta no Netlify;
- testar uma acao protegida por permissao, quando possivel.

## Achados de hardening a corrigir (registrados na Etapa 0, 2026-07-12)

O verificador de deploy e os testes de staging levantaram pendências para as próximas etapas. O estado de cada uma é mantido abaixo:

- **Resolvido em 2026-07-12 — JWT no gateway:** `invite-member`, `save-ai-settings` e `save-whatsapp-settings` foram republicadas com `verify_jwt=true`, mantendo também `getUser` e autorização de owner dentro da função. Todas as 24 funções estão declaradas no `supabase/config.toml`; somente `whatsapp-webhook`, `month-turn`, `weekly-pulse`, `deadline-nudges` e `organization-backup` usam `verify_jwt=false` com proteção interna. Testes confirmam `401` sem JWT, passagem com JWT válido e preflight CORS.
- **Resolvido em 2026-07-12 — gatilho `queue_organization_backup`:** a migration `20260712150000_fix_backup_queue_on_org_delete.sql` mantém a fila em alterações normais e pula a inserção quando a organização já está sendo removida por cascade. A correção foi validada no staging com exclusão de organização descartável populada e confirmada em produção por smoke check somente de leitura.
- **Resolvido em 2026-07-12 — dependências de produção:** SheetJS atualizado do `xlsx 0.18.5` vulnerável para o pacote oficial `0.20.3`, fixado por URL e integridade no lockfile; override de `lodash` atualizado de `4.17.21` para `4.18.1`. Fixtures reais preservam `.xlsx`, `.xls` e `.csv`, e cobrem arquivos inválidos. `pnpm audit --prod` retorna zero vulnerabilidades conhecidas.
