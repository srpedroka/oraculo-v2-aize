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

Segredos operacionais salvos pelo app:

- chaves de IA ficam em `private.ai_model_keys`;
- chave da Evolution API e segredo do webhook ficam em `private.whatsapp_instance_keys`.

## Chaves de IA

O usuario configura a chave pela tela de configuracoes. O frontend envia a chave para `save-ai-settings`, e a funcao:

1. valida sessao;
2. exige papel `owner`;
3. salva a chave real em `private.ai_model_keys`;
4. salva apenas `has_key` e `key_preview` em `public.ai_settings`.

O schema `private` tem acesso revogado para `anon` e `authenticated`.

## WhatsApp

O webhook `whatsapp-webhook` so aceita chamadas com o segredo configurado no cabecalho `x-oraculo-webhook-secret` ou `Authorization: Bearer`. O numero recebido e normalizado e precisa existir em `profiles.phone`; numero sem cadastro recebe recusa educada e nao acessa contexto da empresa.

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
