# Decisoes tecnicas

## 2026-06-29 - Supabase como backend da V2

Decisao: usar Supabase para autenticacao, banco PostgreSQL, RLS, realtime e Edge Functions.

Contexto: a V2 precisava sair do prototipo frontend puro e ganhar persistencia, contas, permissoes e IA configuravel sem construir um backend completo do zero.

Alternativas: backend Node proprio, Firebase, manter frontend puro.

Motivo: Supabase entrega PostgreSQL, Auth, RLS e funcoes server-side com pouco atrito, mantendo rastreabilidade e seguranca por empresa.

Consequencias: migrations e RLS viram parte critica da manutencao; secrets de servidor precisam ficar nas Edge Functions.

## 2026-06-29 - Netlify para deploy do frontend

Decisao: publicar o frontend no Netlify em `https://oraculo-v2-aize.netlify.app`.

Contexto: o usuario pediu criacao/autenticacao no Netlify com Google e deploy do frontend.

Alternativas: Vercel, Supabase Hosting, servidor proprio.

Motivo: Netlify resolve build estatico do Vite e permite configurar variaveis publicas de ambiente com simplicidade.

Consequencias: rotas internas precisam de fallback SPA em `netlify.toml` e `public/_redirects`.

## 2026-06-29 - Chaves de IA no schema privado

Decisao: salvar chaves de IA em `private.ai_model_keys` e expor publicamente apenas `has_key` e `key_preview`.

Contexto: a V2 permite configurar provider/modelo de IA, mas o frontend nao pode armazenar segredos.

Alternativas: salvar chave em `localStorage`, salvar em tabela publica com RLS, exigir env fixa por projeto.

Motivo: o schema privado acessado somente por Edge Function reduz risco de exposicao pelo cliente.

Consequencias: chamadas ao modelo precisam passar por Edge Functions e usar validacao server-side.

## 2026-06-29 - React Query com Context para estado

Decisao: usar React Query para dados remotos e Context/reducer para UI local.

Contexto: o projeto V1 usava estado em memoria. A V2 passou a carregar dados remotos e precisava de refresh consistente.

Alternativas: Redux, Zustand, apenas Context.

Motivo: React Query simplifica cache/refetch de dados Supabase sem adicionar arquitetura pesada.

Consequencias: mutacoes devem invalidar queries ou chamar `refresh` para manter telas coerentes.

## 2026-06-29 - Documentacao minima de manutencao

Decisao: manter README, AGENTS, docs de arquitetura, seguranca, runbook, decisoes e changelog.

Contexto: o projeto passou de prototipo para V2 publicada e precisa ser recuperavel por IA ou humano.

Alternativas: documentar apenas no chat.

Motivo: chats se perdem; arquivos versionaveis mantem contexto operacional.

Consequencias: mudancas de arquitetura, ambiente, deploy e seguranca devem atualizar docs no mesmo ciclo.
