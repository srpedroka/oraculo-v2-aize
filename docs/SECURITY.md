# Seguranca

## Principios

- O frontend nunca recebe segredos de servidor.
- Dados de empresa sao isolados por membership e RLS.
- Acoes sensiveis passam por Edge Functions com validacao de sessao.
- Documentacao pode citar nomes de variaveis, mas nunca valores secretos.
- O mapa operacional de onde cada acesso vive fica em `docs/ACCESS.md`.

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

## WhatsApp

O webhook `whatsapp-webhook` so aceita chamadas com o segredo configurado no cabecalho `x-oraculo-webhook-secret` ou `Authorization: Bearer`. Desde 2026-07-05 o segredo **nao** e mais aceito via query string (`?secret=`), porque vaza em logs de proxy/acesso, e a comparacao e feita em tempo constante. O numero recebido e normalizado e precisa existir em `profiles.phone`; numero sem cadastro recebe recusa educada e nao acessa contexto da empresa.

Download de midia (audio/documento) por URL vinda do payload passa por guarda anti-SSRF: apenas `http(s)`, com bloqueio de loopback, redes privadas, link-local (inclui o metadata `169.254.169.254` de cloud) e nomes internos; ha teto de tamanho por download; e a `apikey` da Evolution so e enviada quando o host da URL e o da propria instancia (`instance_url`), nunca para um CDN ou host arbitrario.

Convites por WhatsApp sao gerados dentro da Edge Function `invite-member`, usando service role no servidor. O frontend nunca recebe a chave da Evolution API e tambem nao monta a chamada direta para a VPS. O link de convite do Supabase e entregue ao celular informado no cadastro do convidado.

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

Arquivos importados pela tela de Plano Estrategico, pela tela de Planos Trimestrais ou anexados no chat lateral sao lidos no navegador apenas para extrair texto. O arquivo bruto nao e salvo no banco. Quando o usuario escolhe "Gerar proposta e carregar no módulo" no Plano Estrategico, o frontend envia somente o texto extraido/colado para `oracle-session` com `action = import_ready_plan`; quando importa um plano trimestral por departamento, envia somente o texto para `action = import_ready_quarterly_plan`. A gravacao estruturada ainda depende de proposta, confirmacao do usuario e validacao server-side. A opção "Só revisar texto" nao chama IA nem grava dados. Quando o usuario escolhe "Importar historico", o frontend envia apenas o texto extraido/colado para `save-historical-document`, que valida permissao e grava `plan_documents.origin = historical`; esse fluxo nao chama IA e nao cria objetivos, acoes ou planos ativos.

Documentos padronizados da Fase 6 e historicos importados ficam em `public.plan_documents` como JSON (`content`). Eles podem conter objetivos, metas, donos, prazos, aprendizados, decisoes e texto historico da empresa, portanto sao dados privados protegidos por RLS. Eles nunca devem conter arquivo bruto, audio bruto, URL temporaria de midia, `mediaKey`, chave de IA, chave da Evolution, senha ou segredo de webhook. A exportacao PDF usa a impressao do navegador a partir do documento renderizado; nenhum PDF gerado pelo usuario e salvo automaticamente no banco.

## RLS

Todas as tabelas publicas com dados do produto tem RLS habilitado.

Regras principais:

- membro da empresa le dados da empresa;
- owner escreve dados administrativos e configuracoes;
- coordenador escreve apenas na propria area;
- acoes e evidencias seguem permissao do objetivo ligado.

## Dados de conta

O email fica em `profiles.email` para administracao de convites. O celular fica em `profiles.phone`, com formato internacional e unicidade no banco. Ele e dado pessoal e deve ser tratado como identificador de acesso, especialmente para a futura integracao com WhatsApp. A interface edita apenas o celular da propria conta.

Ao criar nova tabela:

1. habilite RLS;
2. crie politicas de leitura e escrita;
3. adicione indices por `org_id` quando aplicavel;
4. documente a tabela em `ARCHITECTURE.md`;
5. rode build e teste manual do fluxo.

## Fundacao V3

As tabelas `conversations`, `planning_sessions`, `ai_function_settings` e `plan_documents` foram criadas para suportar memoria, condução estruturada e documentos padronizados.

Regras de seguranca:

- `conversations`: cada usuario autenticado le e atualiza apenas as proprias conversas; owners podem ler todas as conversas da empresa para supervisao. Edge Functions usam service role para gravacoes de canais externos.
- `planning_sessions`: cada usuario le e atualiza as proprias sessoes; owner tambem pode ler. Quando a sessao envolve uma area, escrita exige permissao pela mesma regra de coordenador da area.
- `ai_function_settings`: membros leem a configuracao de modelo; apenas owner altera.
- `plan_documents`: membros leem documentos da empresa; owner grava documentos gerais e coordenadores gravam documentos da propria area. Historicos importados usam a mesma regra de leitura/escrita, mas ficam marcados com `origin = historical`.

Essas tabelas nao guardam chaves reais de IA, senhas, arquivos brutos ou audios. Documentos estruturados ficam como dados privados da empresa e dependem de RLS para isolamento por organizacao.

Na Fase 3, `conversations.summary` guarda um resumo de conversa gerado por IA. Esse resumo pode conter decisoes, numeros e pendencias da empresa, portanto deve ser tratado como dado privado da organizacao. Ele nunca deve guardar chave de API, segredo de webhook, senha, URL temporaria de mídia, audio bruto ou arquivo bruto.

O contexto do plano enviado ao modelo e montado server-side por `_shared/plan-context.ts`. Ele inclui apenas dados de produto que o usuario ja poderia acessar pela empresa/area: objetivos, planos, acoes-chave, evidencias e check-ins. Na Memoria Estrategica Fatia 2a, contextos de planejamento estrategico/trimestral tambem podem incluir ate 3 documentos historicos truncados de `plan_documents.origin = historical`, no escopo da empresa e da area em foco. Segredos continuam fora desse contexto.

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

- `pnpm run lint`
- `pnpm run build`
- conferir se `.env` nao esta versionado;
- conferir se `SUPABASE_SERVICE_ROLE_KEY` nao aparece em `src/`;
- testar login/onboarding;
- testar rota direta no Netlify;
- testar uma acao protegida por permissao, quando possivel.
