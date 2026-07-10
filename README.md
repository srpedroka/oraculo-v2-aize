# Oraculo V2

Oraculo e um sistema de execucao estrategica. Ele ajuda a empresa a enxergar se esta ganhando o jogo atual, pelo Resultado, e se esta construindo o proximo jogo, pela Evolucao.

A V2 inclui autenticacao, empresas, membros, areas, planos estrategicos, planos trimestrais, execucao mensal, evidencias, check-ins e um painel de IA estrategica com Supabase e Netlify.

## Stack

- Vite + React 18 + TypeScript
- React Router
- TailwindCSS
- React Query
- Supabase Auth, Database, RLS, Realtime e Edge Functions
- Netlify para deploy do frontend

## Requisitos

- Node.js 22.13+
- pnpm
- Acesso ao projeto Supabase da V2
- Acesso ao site Netlify da V2, se for publicar

## Configurar ambiente local

Crie um arquivo `.env` a partir de `.env.example`.

```env
VITE_SUPABASE_URL=https://bkswkfazkjilwfzwzthz.supabase.co
VITE_SUPABASE_ANON_KEY=cole_a_publishable_key_aqui
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend. Essa chave deve existir apenas nos secrets das Edge Functions no Supabase.

## Instalar e rodar

```bash
pnpm install
pnpm run dev
```

O Vite normalmente abre em:

```text
http://127.0.0.1:5173
```

Se a porta estiver ocupada, ele pode usar outra porta.

## Checagens

```bash
pnpm run lint
pnpm run build
```

`pnpm run lint` roda `tsc --noEmit`. Hoje nao existe suite de testes automatizados alem da checagem de tipos e build.

## Deploy

Frontend em producao:

```text
https://oraculo-v2-aize.netlify.app
```

O Netlify usa:

- comando de build: `pnpm run build`
- pasta publicada: `dist`
- fallback SPA: `netlify.toml` e `public/_redirects`

Variaveis do Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase

Projeto Supabase:

```text
https://bkswkfazkjilwfzwzthz.supabase.co
```

As migrations ficam em `supabase/migrations/`.

As Edge Functions ficam em `supabase/functions/`:

- `invite-member`
- `save-ai-settings`
- `save-whatsapp-settings`
- `oracle-chat`
- `oracle-session`
- `month-turn`
- `suggest-kpi-spreadsheet`
- `apply-kpi-import`
- `organization-backup`
- `whatsapp-webhook`

## Documentacao

- Arquitetura: `docs/ARCHITECTURE.md`
- Seguranca: `docs/SECURITY.md`
- Acessos e chaves: `docs/ACCESS.md`
- Decisoes: `docs/DECISIONS.md`
- Runbook: `docs/RUNBOOK.md`
- Changelog: `docs/CHANGELOG.md`
- Instrucao para agentes: `AGENTS.md`

## Cuidados

- Nao commitar `.env`, zips, dumps, builds ou pastas privadas.
- Ao alterar banco, crie migration e revise RLS.
- Ao alterar deploy, atualize README e Runbook.
- Ao alterar permissoes, atualize Security e Architecture.
