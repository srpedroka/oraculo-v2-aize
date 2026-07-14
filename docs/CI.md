# Integracao continua

## Gate obrigatorio

O workflow `.github/workflows/ci.yml` roda em pull requests e em todo push para `main`. Ele possui dois jobs independentes e um status final estavel:

- `Quality and build`: instalacao congelada, secret scan, audit de dependencias, lint/typecheck, unitarios, fixtures, build e smoke do bundle;
- `Local Supabase integration`: aplica todas as migrations em Supabase local, serve as Edge Functions, roda integracao, RLS/seguranca e E2E autenticado em desktop/mobile;
- `CI required`: fica verde somente quando os dois jobs anteriores terminam com sucesso.

Na protecao da branch `main`, exigir o status **CI required** antes de merge. Tambem exigir que a branch esteja atualizada e impedir bypass, exceto recuperacao administrativa documentada.

## Segredos e artefatos

O CI de pull request nao recebe credenciais de producao nem de staging hospedado. Chaves locais do Supabase existem apenas durante o job e sao mascaradas. Logs enviados em falha passam por `scripts/run-ci-command.ts` ou `scripts/sanitize-ci-artifact.ts`; tokens, JWTs, emails e valores de variaveis sensiveis sao removidos. Traces, screenshots, dumps e payloads brutos nao sao publicados.

O scanner `pnpm run ci:secret-scan` inspeciona somente arquivos rastreados e falha com credenciais de alta confianca ou arquivos sensiveis proibidos. Ele complementa, mas nao substitui, rotacao imediata quando um segredo for exposto.

## Verificacao de producao

O workflow manual `.github/workflows/production-verify.yml` recebe o SHA exato publicado, faz checkout desse commit e executa `pnpm run verify:deploy`. O unico secret necessario no repositorio e `SUPABASE_ACCESS_TOKEN`, disponibilizado somente nesse workflow protegido.

Antes de liberar deploy automatico, configure um environment `production` no GitHub com aprovacao do owner e associe o secret a esse environment. O deploy deve depender de `CI required`, registrar o SHA publicado e terminar com a verificacao de migrations, Edge Functions e frontend.

## Diagnostico

1. Abra o job vermelho e leia o log sanitizado do passo.
2. Baixe o artefato `*-sanitized-*` somente se o log do passo nao bastar.
3. Reproduza o comando indicado localmente.
4. Em falha de Supabase, rode `supabase start`, exporte as variaveis locais e inicie `supabase functions serve` conforme o workflow. O CI fixa a CLI em `2.109.1`; o runtime provisiona as variaveis reservadas `SUPABASE_*` automaticamente. O TOTP local fica habilitado para manter paridade com os testes de MFA do ambiente hospedado.
5. Ao testar ausencia de autenticacao no gateway local, omita `Authorization` e `apikey`: a anon key local legada e um JWT e pode autenticar a chamada quando enviada apenas como `apikey`.
6. Nunca contorne o gate publicando outro commit ou desligando o check; corrija a causa ou registre formalmente a excecao de emergencia.
