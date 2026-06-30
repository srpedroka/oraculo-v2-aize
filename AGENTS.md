# ORACULO - Instrucao para agentes de IA

Este projeto e a V2 do Oraculo, um sistema de execucao estrategica para empresas acompanharem Resultado, Evolucao, planos anuais, trimestrais e mensais com apoio de uma IA estrategica.

Idioma do produto: portugues do Brasil.
Idioma do codigo: ingles para identificadores, tipos, variaveis e nomes tecnicos. Textos visiveis ficam em PT-BR.

## Stack atual

- Frontend: Vite, React 18, TypeScript, React Router.
- Estilo: TailwindCSS, Inter via `@fontsource/inter`, icones `lucide-react`.
- Estado e dados: React Context + `useReducer` para UI local, React Query para dados remotos.
- Banco, autenticacao e realtime: Supabase.
- Backend leve: Supabase Edge Functions em Deno.
- Deploy frontend: Netlify.
- Build local: `pnpm`.

## Comandos principais

- Instalar dependencias: `pnpm install`
- Rodar local: `pnpm run dev`
- Checar tipos: `pnpm run lint`
- Build de producao: `pnpm run build`
- Preview local do build: `pnpm run preview`

Antes de encerrar qualquer mudanca relevante, rode pelo menos:

```bash
pnpm run lint
pnpm run build
```

## Antes de mexer no codigo

1. Leia `README.md`.
2. Leia `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/ACCESS.md`, `docs/RUNBOOK.md` e `docs/DECISIONS.md`.
3. Rode `git status`.
4. Se existir repositorio remoto configurado, rode `git pull` antes de alterar arquivos.
5. Verifique se a mudanca afeta ambiente, banco, deploy, autenticacao, seguranca ou fluxo de negocio. Se afetar, atualize a documentacao junto.

Observacao: se o diretorio ainda nao for um repositorio Git, avise o usuario antes de depender de commit ou push.

## Estrutura importante

- `src/App.tsx`: rotas e guardas de sessao/onboarding.
- `src/state/store.tsx`: leitura e escrita dos dados do app via Supabase.
- `src/lib/supabase.ts`: cliente Supabase do frontend.
- `src/pages/`: telas principais.
- `src/components/`: layout, sidebar, painel do Oraculo e componentes reutilizaveis.
- `src/features/objective/`: cards e builder de objetivos.
- `supabase/migrations/`: schema, RLS, private schema e realtime.
- `supabase/functions/`: funcoes server-side.
- `supabase/functions/_shared/`: autenticacao, CORS, modelo e roteiros do Oraculo.
- `docs/`: documentacao de manutencao.

## Regras de seguranca

- Nunca commitar `.env`, `.env.*`, chaves, tokens, dumps ou arquivos privados.
- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY` no frontend. Ela pertence apenas aos secrets das Edge Functions.
- Chaves de modelo de IA nao devem ir para o cliente. O app envia a chave para a Edge Function `save-ai-settings`, que salva em `private.ai_model_keys`.
- A documentacao deve explicar onde as chaves ficam, mas nunca registrar valores reais. Use `docs/ACCESS.md` para mapa de acessos.
- Toda escrita sensivel deve respeitar RLS e/ou validacao server-side nas Edge Functions.
- Donos (`owner`) podem administrar empresa, membros, areas e configuracoes. Coordenadores (`coordinator`) so podem escrever na propria area quando permitido.
- Ao encontrar segredo exposto, pare, remova, avise o usuario e oriente rotacao da credencial.
- Mantenha `.gitignore` cobrindo artefatos locais, builds, zips, dumps e pastas privadas.

## Padroes de implementacao

- Preserve o design limpo do cockpit executivo: branco, cinza, Inter, status com cor contida.
- UI em portugues do Brasil, sem termos crus de enum.
- Componentes devem seguir os padroes existentes antes de criar novas abstracoes.
- Mantenha a cascata de rastreabilidade: estrategico -> anual da area -> trimestral -> mensal.
- A regua de concretude orienta, mas nao bloqueia o salvamento.
- Evite refatoracoes fora do escopo.

## Banco e permissoes

- Alteracoes de schema devem virar migration em `supabase/migrations/`.
- Toda tabela publica com dados de empresa precisa de RLS.
- Tabelas privadas ficam no schema `private`, sem acesso para `anon` ou `authenticated`.
- Ao criar tabela nova, documente no `docs/ARCHITECTURE.md` e revise `docs/SECURITY.md`.

## Deploy

- Frontend publica no Netlify.
- O app usa fallback de SPA em `netlify.toml` e `public/_redirects`.
- Variaveis publicas do frontend no Netlify:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Secrets das Edge Functions ficam no Supabase, nao no Netlify.

## Quando atualizar documentacao

Atualize docs quando:

- adicionar modulo importante;
- mudar comando de instalar, testar, buildar ou publicar;
- adicionar variavel de ambiente;
- alterar Supabase, RLS, Edge Functions ou autenticacao;
- mudar fluxo de permissao;
- corrigir problema que pode voltar;
- tomar decisao tecnica relevante.

## Politica de Git

Antes de trabalhar:

```bash
git status
git pull
```

Depois de uma unidade logica pronta:

```bash
git status
git diff
git add .
git commit -m "mensagem curta e clara"
```

Antes de alternar ferramenta, encerrar trabalho ou salvar backup remoto:

```bash
git push
```

Se o projeto ainda nao tiver Git inicializado, recomende ao usuario inicializar e conectar ao GitHub antes de continuar evolucoes grandes.
