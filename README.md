# Oraculo V2

Oraculo e um sistema de execucao estrategica. Ele ajuda a empresa a enxergar se esta ganhando o jogo atual, pelo Resultado, e se esta construindo o proximo jogo, pela Evolucao.

A V2 inclui autenticacao, empresas, membros, areas, planos estrategicos, planos trimestrais, execucao mensal, evidencias, check-ins, arquivo operacional reversivel e um painel de IA estrategica com Supabase e Netlify.

O aviso público `/privacidade` explica o tratamento operacional de dados, IA, WhatsApp, arquivos e backups. Em Configurações, o owner registra ciência uma vez por versão e empresa, sem bloquear o uso diário. Dados técnicos vencidos são limpos diariamente por uma política fixa e conservadora; memória estratégica, documentos, conversas e auditorias críticas ficam fora dessa automação. A aba **Minha conta** permite corrigir perfil, exportar os próprios dados e excluir a conta com proteção do último owner e preservação anonimizada do histórico empresarial. A aba owner-only **Auditoria** registra automaticamente alterações administrativas sensíveis sem guardar chaves, contatos, prompts ou conteúdo de negócio. Em **Backups**, um único comando testa a restauração como clone, mede RPO/RTO e força a cópia externa no ciclo trimestral; a operação diária não ganha nenhuma confirmação nova.

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

`pnpm run lint` roda `tsc --noEmit`. `pnpm run test:unit` roda a suíte local; `pnpm run test:integration` e `pnpm run test:security` usam somente o Supabase de staging configurado em `.agents-private/agent-env`; `pnpm run test:e2e:staging` abre o frontend local contra esse staging e usa dados descartáveis. `pnpm run build` também executa `test:bundle`, que limita o JavaScript inicial a 200 KB gzip e impede PDF, XLSX, DOCX e ZIP de entrarem antes do uso. `pnpm run check` combina lint, testes e build. A matriz completa está em `docs/TESTING.md`.

O catalogo Q2 de qualidade estrategica e validado sem rede, dados ou custo de IA:

```bash
pnpm run test:strategic-cases
```

O executor Q3 e deliberadamente manual, pago e restrito ao staging. Depois de carregar as credenciais privadas e obter autorizacao financeira explicita, ele oferece `preflight`, fases `Q3A`-`Q3D`, bateria `deterministic`, `summary` e pacote `human-packet`:

```bash
pnpm run eval:strategic:q3 -- preflight
```

O baseline atual esta em `docs/STRATEGIC_QUALITY_BASELINE_Q3.md`. Nunca execute as fases pagas no CI.

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
- `set-member-role`
- `remove-member`
- `personal-account`
- `operational-lifecycle`
- `save-ai-settings`
- `save-ai-control-policy`
- `save-whatsapp-settings`
- `save-security-settings`
- `oracle-chat`
- `oracle-session`
- `month-turn`
- `weekly-pulse`
- `suggest-objective-kpis`
- `suggest-kpi-spreadsheet`
- `apply-kpi-import`
- `organization-backup`
- `operational-health`
- `whatsapp-health`
- `whatsapp-webhook`
- `whatsapp-sender`
- `whatsapp-worker`

## Documentacao

- Arquitetura: `docs/ARCHITECTURE.md`
- Seguranca: `docs/SECURITY.md`
- Acessos e chaves: `docs/ACCESS.md`
- Decisoes: `docs/DECISIONS.md`
- Runbook: `docs/RUNBOOK.md`
- Testes: `docs/TESTING.md`
- Inventário de dados: `docs/DATA_INVENTORY.md`
- CI: `docs/CI.md`
- Changelog: `docs/CHANGELOG.md`
- Instrucao para agentes: `AGENTS.md`

## Cuidados

- Nao commitar `.env`, zips, dumps, builds ou pastas privadas.
- Ao alterar banco, crie migration e revise RLS.
- Ao alterar deploy, atualize README e Runbook.
- Ao alterar permissoes, atualize Security e Architecture.
