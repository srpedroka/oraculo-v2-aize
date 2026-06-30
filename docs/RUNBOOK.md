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
- provider/modelo incorreto;
- erro em Edge Function;
- usuario sem membership.

Comportamento esperado: se nao houver chave, `oracle-chat` usa fallback deterministico.

Verifique:

- `public.ai_settings.has_key`;
- `public.ai_settings.key_preview`;
- existencia de linha em `private.ai_model_keys`;
- logs da Edge Function `oracle-chat`.

## Configurar WhatsApp real

O app ja tem a base para Evolution API, mas a hospedagem e o pareamento do numero sao manuais.

1. Hospede a Evolution API em ambiente proprio.
2. Crie uma instancia e escaneie o QR Code com o aparelho que sera usado.
3. No Oraculo, abra Configuracoes > WhatsApp.
4. Preencha URL da Evolution API, nome da instancia, numero conectado, chave da Evolution API e um segredo forte de webhook.
5. Copie a URL do webhook exibida na tela.
6. Configure a Evolution API para enviar mensagens recebidas para essa URL.
7. Envie no webhook o cabecalho `x-oraculo-webhook-secret` com o mesmo segredo salvo.
8. Cadastre o celular da pessoa na conta dela ou no convite.

Sem a Evolution API hospedada e sem QR pareado, o painel do sistema continua funcionando, mas o WhatsApp real nao recebe mensagens.

## Problema: salvar chave de IA falha

Possiveis causas:

- usuario nao e `owner`;
- secrets das Edge Functions ausentes;
- tabela `private.ai_model_keys` nao existe;
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
supabase functions deploy monthly-check-in
```

Se a CLI pedir login ou link do projeto, conecte ao projeto correto antes de publicar.

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
