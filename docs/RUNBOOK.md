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
- provider/modelo incorreto;
- erro em Edge Function;
- usuario sem membership.

Comportamento esperado: se nao houver chave, `oracle-chat` usa fallback deterministico.

Verifique:

- `public.ai_settings.has_key`;
- `public.ai_settings.key_preview`;
- existencia de linha em `public.ai_model_keys`;
- logs da Edge Function `oracle-chat`.

Para consumo:

1. Envie uma mensagem pequena para o Oraculo.
2. Confira `public.ai_usage_logs` filtrando por `org_id`.
3. Se houver resposta mas nao houver log, verifique `recordAiUsage` e o retorno de `usage` do provider.
4. Se nao houver resposta, consulte logs da Edge Function e veja se a chamada ao modelo falhou.

## Problema: WhatsApp recebeu mensagem mas nao respondeu

Diagnostico rapido:

1. Verifique `public.chat_messages` filtrando por `channel = 'whatsapp'`.
2. Se a mensagem `user` apareceu e nao existe resposta `oracle` logo depois, a falha ocorreu dentro do `whatsapp-webhook` antes do envio da resposta.
3. Confira `public.ai_usage_logs` para saber se a chamada de IA chegou a acontecer.
4. Se nao houver uso de IA, verifique provider/modelo, chave em `public.ai_model_keys` e logs da Edge Function.
5. Se houver resposta `oracle` no banco mas ela nao chegou no celular, verifique Evolution API/Evo Go, instancia conectada, endpoint de envio e chave da Evolution.
6. Se a mensagem nem apareceu em `chat_messages`, verifique webhook configurado na Evolution, segredo `x-oraculo-webhook-secret`, URL publica e instancia conectada.

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
Webhook: https://bkswkfazkjilwfzwzthz.supabase.co/functions/v1/whatsapp-webhook?orgId=66fee6c9-df10-4f86-924c-103a25778d7d
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
supabase functions deploy monthly-check-in
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
supabase/functions/_shared/prompt-guides.ts
```

Para deixar a IA mais natural:

1. Ajuste `CONVERSATION_STYLE`.
2. Evite instrucoes contraditorias, como "seja curto" e "explique tudo".
3. Publique `whatsapp-webhook` e `oracle-chat`.
4. Teste pelo WhatsApp com pergunta ambigua, por exemplo "Como esta o sistema?".
5. Confira se ela pede esclarecimento antes de despejar numeros.

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
