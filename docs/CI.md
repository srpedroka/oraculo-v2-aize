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

## Publicacao protegida de producao

O workflow manual `.github/workflows/production-release.yml` recebe um SHA completo da `main` e aceita somente `verify`, `functions` ou `migrations`. O job `Preflight without production secrets` comprova que o SHA pertence a `main`, exige o check `CI required` verde e valida os argumentos antes de abrir o GitHub Environment `production`. Esse job nao referencia nenhum segredo de producao.

Somente depois da aprovacao do owner um dos jobs protegidos recebe os secrets do Environment:

- `verify`: executa apenas `verify:deploy`, sem escrita;
- `functions`: publica somente os nomes explicitamente informados e validados;
- `migrations`: aplica somente o conjunto pendente contido no intervalo aprovado e reexecuta o guard antes do `db push`.

`DROP`, `TRUNCATE`, remoção de coluna/constraint e `DELETE` total sao recusados por padrao. A caixa `allow_destructive_migration` registra uma excecao explicita, mas nao pula CI, revisao do pacote nem aprovacao do Environment. O deploy comum do frontend permanece no fluxo Netlify existente e nao ganha aprovacao de migration.

## Diagnostico

1. Abra o job vermelho e leia o log sanitizado do passo.
2. Baixe o artefato `*-sanitized-*` somente se o log do passo nao bastar.
3. Reproduza o comando indicado localmente.
4. Em falha de Supabase, rode `supabase start`, exporte as variaveis locais e inicie `supabase functions serve` conforme o workflow. O CI fixa a CLI em `2.109.1`; o runtime provisiona as variaveis reservadas `SUPABASE_*` automaticamente. O TOTP local fica habilitado para manter paridade com os testes de MFA do ambiente hospedado.
5. Ao testar ausencia de autenticacao no gateway local, omita `Authorization` e `apikey`: a anon key local legada e um JWT e pode autenticar a chamada quando enviada apenas como `apikey`.
6. Nunca contorne o gate publicando outro commit ou desligando o check; corrija a causa ou registre formalmente a excecao de emergencia.
