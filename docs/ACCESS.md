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

## GitHub

Repositorio:

```text
git@github.com:srpedroka/oraculo-v2-aize.git
```

O repositorio foi criado como privado.

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
- chaves de IA no schema privado.

### Secrets das Edge Functions

Secrets esperados no Supabase:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Esses valores ficam no painel/CLI do Supabase, nao no repositorio.

Por que assim: Edge Functions rodam no servidor e podem usar service role com seguranca. O navegador nao pode receber service role.

### Banco de dados

Migrations versionadas:

```text
supabase/migrations/
```

Pontos de seguranca:

- RLS habilitado nas tabelas publicas.
- Funcoes auxiliares validam membership, owner e permissao por area.
- Schema `private` nao e liberado para `anon` nem `authenticated`.

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
5. A chave real e salva em `private.ai_model_keys`.
6. A tabela publica `ai_settings` guarda apenas `has_key` e `key_preview`.

Por que assim: a chave de IA nunca fica exposta no cliente, no GitHub ou na tabela publica. O app mostra apenas que existe uma chave e os ultimos caracteres para conferencia.

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
3. Conferir se o departamento tem `coordinator_id` correto.
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
- Chaves de IA apenas em `private.ai_model_keys`.
- `pnpm run lint` e `pnpm run build` passando.
