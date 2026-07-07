# Acessos e custodia de chaves

Este documento explica onde ficam os acessos do Oraculo V2, onde as chaves sao guardadas e por que cada coisa fica nesse lugar.

Regra principal: documentamos o caminho de recuperacao, nunca o valor real de uma chave.

## Resumo dos ambientes

| Sistema | Uso | Conta/projeto | Onde acessar |
| --- | --- | --- | --- |
| GitHub | Codigo-fonte e historico | `srpedroka/oraculo-v2-aize` | `https://github.com/srpedroka/oraculo-v2-aize` |
| Netlify | Deploy do frontend | `oraculo-v2-aize` | `https://app.netlify.com/projects/oraculo-v2-aize` |
| Supabase | Auth, banco, RLS, Edge Functions e secrets server-side | projeto `bkswkfazkjilwfzwzthz` | `https://supabase.com/dashboard/project/bkswkfazkjilwfzwzthz` |
| App em producao | Produto publicado | `oraculo-v2-aize` | `https://oraculo-v2-aize.netlify.app` |
| Evolution API/Evo Go | Envio e recebimento de WhatsApp | instancia `oraculo` | URL publica configurada em Configuracoes > WhatsApp |

## GitHub

Repositorio:

```text
git@github.com:srpedroka/oraculo-v2-aize.git
```

O repositorio esta publico para leitura e clonar, mas escrita e configuracoes continuam restritas a quem tiver permissao no GitHub.

### Como o computador envia codigo

Este Mac usa SSH para enviar commits ao GitHub.

Configuracao local esperada:

```text
~/.ssh/config
~/.ssh/id_ed25519_github_codex
~/.ssh/id_ed25519_github_codex.pub
```

A chave privada fica apenas no computador. A chave publica foi autorizada no GitHub.

Por que assim: evita token de GitHub dentro do projeto e permite `git push` sem gravar senha ou chave no repositorio.

### Como validar acesso

```bash
ssh -T git@github.com
git remote -v
git status
```

Resultado esperado do SSH: GitHub confirma autenticacao e informa que nao oferece shell.

## Netlify

Site:

```text
oraculo-v2-aize
```

URL publica:

```text
https://oraculo-v2-aize.netlify.app
```

Conta usada:

```text
srpedroka@gmail.com via Google
```

### Variaveis salvas no Netlify

Variaveis publicas do frontend:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Essas variaveis sao publicaveis porque fazem parte do cliente Supabase do navegador. A seguranca dos dados nao depende delas serem secretas; depende de Auth e RLS no Supabase.

Nao salvar no Netlify para o frontend:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

Por que assim: tudo que esta no frontend pode ser visto pelo navegador. Secrets reais precisam ficar em ambiente server-side.

### Arquivos que controlam deploy

```text
netlify.toml
public/_redirects
```

Por que existem: o app e uma SPA. Sem fallback para `index.html`, rotas diretas como `/configuracoes` podem dar erro ao abrir pelo link.

## Supabase

Projeto:

```text
bkswkfazkjilwfzwzthz
https://bkswkfazkjilwfzwzthz.supabase.co
```

O Supabase guarda:

- usuarios e sessoes;
- banco PostgreSQL;
- politicas RLS;
- Edge Functions;
- secrets de servidor das Edge Functions;
- chaves de IA e WhatsApp em tabelas bloqueadas para leitura do navegador.
- sessoes de planejamento da V3 em `public.planning_sessions`.

### Secrets das Edge Functions

Secrets esperados no Supabase:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MONTH_TURN_SECRET
```

Esses valores ficam no painel/CLI do Supabase, nao no repositorio.

Por que assim: Edge Functions rodam no servidor e podem usar service role com seguranca. O navegador nao pode receber service role. `MONTH_TURN_SECRET` protege a chamada agendada da virada de mes quando a funcao `month-turn` for exposta sem JWT.

`oracle-session` usa esses mesmos secrets server-side para conduzir planejamento e aplicar propostas confirmadas. Ela nao cria novo segredo; apenas grava estado em `planning_sessions` e dados confirmados nas tabelas de plano.

Estado operacional em 2026-07-04: `MONTH_TURN_SECRET` foi configurado no Supabase para a funcao `month-turn`. O valor real nao fica neste repositorio.

### Banco de dados

Migrations versionadas:

```text
supabase/migrations/
```

Pontos de seguranca:

- RLS habilitado nas tabelas publicas.
- Funcoes auxiliares validam membership, owner e permissao por area.
- Tabelas de segredo `public.ai_model_keys` e `public.whatsapp_instance_keys` tem RLS habilitado, acesso revogado para `anon` e `authenticated`, e acesso apenas por `service_role`.

Por que assim: mesmo que alguem veja a anon key do frontend, a leitura e a escrita continuam bloqueadas pelas politicas do banco.

### Senha de banco local

Arquivo local privado:

```text
.supabase-private/db-password
```

Esse arquivo fica ignorado pelo Git.

Se a senha for perdida: redefinir no painel do Supabase e atualizar o arquivo local privado se necessario.

## Chaves de IA

Fluxo:

1. Usuario owner abre Configuracoes.
2. Informa provider, modelo e chave.
3. Frontend envia para a Edge Function `save-ai-settings`.
4. A funcao valida sessao e exige papel `owner`.
5. A chave real e salva em `public.ai_model_keys`, acessivel apenas por service role.
6. A tabela publica `ai_settings` guarda apenas `has_key`, `key_preview`, provider, modelo, pricing e fonte do pricing.

Estado atual: a chave real fica em `public.ai_model_keys`, protegida por RLS/revokes e acessivel apenas por service role. Na V3, a chave passa a ser guardada por empresa e provedor (`org_id`, `provider`), permitindo usar modelos diferentes para planejamento, conversa do dia a dia e bastidores sem expor credenciais ao frontend. O desenho inicial usava `private.ai_model_keys`; migrations antigas podem citar esse caminho por historico.

Por que assim: a chave de IA nunca fica exposta no cliente ou no GitHub. O app mostra apenas que existe uma chave e os ultimos caracteres para conferencia.

### Funcoes de IA da V3

Tabela operacional:

```text
public.ai_function_settings
public.ai_provider_key_status
```

Ela guarda qual provider/modelo cada funcao usa:

- `planning`: planejamento e fechamentos;
- `daily`: conversa do dia a dia;
- `background`: bastidores, classificacoes e resumos.

`public.ai_function_settings` nao guarda chave. `public.ai_provider_key_status` guarda apenas se existe chave e os ultimos caracteres mascarados. As chaves reais continuam em `public.ai_model_keys` e so a service role acessa o valor real.

Provedores suportados:

- OpenAI;
- Anthropic / Claude;
- Moonshot / Kimi;
- xAI / Grok.

Como trocar um modelo por funcao:

1. Abrir Configuracoes > IA do Oraculo.
2. Salvar a chave do provedor, se ainda nao estiver guardada.
3. Em Funcoes de IA, escolher provider e modelo para Planejamento, Dia a dia ou Bastidores.
4. Salvar a funcao.
5. Fazer uma chamada pequena e conferir o consumo com a funcao indicada.

## Evolution API / WhatsApp

Configuracao operacional atual:

```text
Instancia: oraculo
URL publica: https://143-95-217-64.sslip.io
Numero conectado: +554691228197
Webhook Supabase (atual): https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/whatsapp-webhook?orgId=3a680b48-1ded-4bac-986f-b6e3a76297b7
Webhook Supabase (recomendado): https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/whatsapp-webhook
```

Desde 2026-07-07 o `whatsapp-webhook` resolve a empresa pelo `orgId` da URL e, se nao encontrar, cai de volta para o `instance_name` (estavel). Por isso o `?orgId=` na URL virou opcional e fragil: se a org for recriada com novo id, a URL antiga para de casar e o WhatsApp para calado (foi o incidente de 2026-07-07, orgId `66fee...` -> `3a680...`). **Acao pendente na Evolution**: trocar o webhook da instancia `oraculo` para a URL recomendada (sem `?orgId=`), que passa a depender so do `instance_name`. Requer chamar a API da Evolution com a apikey (em `whatsapp_instance_keys`, service role); fazer pelo painel/CLI da Evolution ou pelo agente que tiver esse acesso.

Valores secretos:

- chave da Evolution API;
- segredo do webhook.

Onde ficam: `public.whatsapp_instance_keys`, com RLS/revokes e acesso apenas por service role. O app mostra apenas previews mascarados.

Por que assim: o frontend precisa saber a URL publica e o nome da instancia, mas nao pode receber chave da Evolution nem segredo de webhook. A Edge Function `save-whatsapp-settings` grava os segredos com service role.

Se precisar recuperar:

1. Entrar na VPS/painel Evolution.
2. Conferir se a instancia `oraculo` esta conectada.
3. Gerar nova chave/segredo se houver suspeita de vazamento.
4. Abrir Configuracoes > WhatsApp no app e salvar novamente.
5. Atualizar o webhook da Evolution com a URL e o mesmo segredo salvo no app.

## Pricing e consumo de IA

O pricing fica em:

- `public.ai_settings`: precos salvos do modelo ativo;
- `public.ai_usage_logs`: snapshot do preco e custo em cada chamada.

No codigo:

- `src/lib/aiPricing.ts`: catalogo usado pela tela;
- `supabase/functions/_shared/pricing.ts`: catalogo usado pela funcao de salvar IA.

Ao trocar modelo:

1. Conferir pricing oficial do provedor.
2. Atualizar catalogo no frontend e no servidor quando necessario.
3. Salvar modelo em Configuracoes.
4. Verificar se `ai_settings.pricing_source` aponta para a fonte correta.
5. Fazer uma chamada pequena e conferir `ai_usage_logs`.

## Credenciais de operacao dos agentes (Claude Code / Codex)

Para os agentes operarem sem depender um do outro (deploy de Edge Functions, deploy Netlify, config da Evolution), as credenciais de operacao ficam num arquivo local fora do Git:

- Arquivo real: `.agents-private/agent-env` (gitignored, `chmod 600`, nunca commitar).
- Template versionado do formato: `.agents-private/agent-env.example`.
- Uso: `set -a; source .agents-private/agent-env; set +a` antes dos comandos.

Variaveis (apenas nomes; valores so no arquivo local):

- `SUPABASE_ACCESS_TOKEN` — essencial; destrava `supabase functions deploy` e `supabase secrets`. Token pessoal revogavel (app.supabase.com > Account > Access Tokens).
- `NETLIFY_AUTH_TOKEN` — opcional; a CLI ja costuma estar logada em `~/Library/Preferences/netlify/config.json`.
- `EVOLUTION_API_URL` / `EVOLUTION_INSTANCE` / `EVOLUTION_API_KEY` — opcional; so se o agente for configurar o webhook do WhatsApp direto na Evolution.

Nao duplicar aqui: `SUPABASE_SERVICE_ROLE_KEY` (ja e secret do projeto), chaves de IA (`public.ai_model_keys`), senha do banco (`.supabase-private/db-password`). Principio: guardar o minimo, cada segredo na sua fonte, nunca ecoar valores em log/chat/PR.

## Arquivos locais sensiveis

Nao entram no Git:

```text
.env
.env.*
.supabase-private/
.netlify/
node_modules/
dist/
*.zip
*.dump
*.sql.gz
*.log
```

Por que assim: esses arquivos podem conter credenciais, builds gerados, dados exportados ou tokens locais.

## Em caso de problema

### Perdi acesso ao GitHub

1. Entrar em `https://github.com`.
2. Confirmar acesso ao usuario `srpedroka`.
3. Validar a chave SSH em Settings > SSH and GPG keys.
4. Se necessario, criar nova chave SSH e remover a antiga.
5. Rodar `ssh -T git@github.com`.

### Deploy nao atualiza

1. Conferir se o commit foi enviado:

```bash
git status
git log --oneline -1
git push
```

2. Abrir logs no Netlify.
3. Conferir variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Rodar localmente:

```bash
pnpm run build
```

### Supabase bloqueia dados

1. Confirmar que o usuario tem linha em `memberships`.
2. Confirmar `role`: `owner` ou `coordinator`.
3. Conferir se a area tem `coordinator_id` correto.
4. Revisar policies em `supabase/migrations/20260629150200_auth_rls.sql`.

### Chave vazou

1. Considerar a chave comprometida.
2. Revogar ou rotacionar no provedor.
3. Remover qualquer exposicao do arquivo ou ambiente errado.
4. Confirmar que o segredo nao esta no GitHub.
5. Registrar o ocorrido sem colar o valor da chave em nenhum documento.

## Checklist periodico

- `git status` limpo depois das entregas.
- `git push` feito ao encerrar etapa importante.
- `.env` nao versionado.
- Netlify com apenas variaveis publicas do frontend.
- Supabase com service role apenas em secrets server-side.
- Chaves de IA apenas em `public.ai_model_keys`, sem acesso para `anon`/`authenticated`.
- `pnpm run lint` e `pnpm run build` passando.
