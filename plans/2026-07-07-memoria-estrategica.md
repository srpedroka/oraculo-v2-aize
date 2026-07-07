# Plano: Memória Estratégica (histórico de planos como referência para a IA)

## Objetivo

Permitir subir planos e estratégias passadas para o Oráculo como **memória de referência**, e usar esse histórico para deixar a IA mais estrategista — capaz de notar, no planejamento novo, que uma meta se repete ano após ano ("essa meta aparece desde 2023; o que muda agora?"), sem depender de o usuário marcar o que foi atingido.

## Decisões do dono (2026-07-07)

1. **Resultado da meta:** histórico é **referência pura**. O dono NÃO vai alimentar "batida/não batida". A IA infere padrões pelo contexto — a própria recorrência de uma meta já é o sinal. → Não criar campo obrigatório de resultado; nada de UX de tagging.
2. **Ambição:** entrega **fatiada/incremental**. Cada fatia entrega valor e é testável sozinha.
3. **Lugar na UI:** **reusar** — importação dentro do **Plano Estratégico**; visualização na tela **Documentos**. Sem nova seção na sidebar.

## Como se encaixa no que já existe (fundação já pronta)

- `public.plan_documents` (migration `20260704110000_v3_intelligence_foundation.sql`): guarda documentos canônicos com `type`, `period`, `title`, `content jsonb`, `version`, `created_by`, RLS (`is_org_member` leitura / `is_owner` ou `can_write_area` escrita) e realtime. Hoje só é preenchida por propostas confirmadas. **É a casa natural do documento histórico.**
- Tela `src/pages/Documents.tsx`: já lista `plan_documents` com filtros por tipo, área e período. **Ver histórico é meio caminho andado.**
- `src/pages/Strategic.tsx`: já tem importação de plano por arquivo/texto (PDF/PPTX/DOCX/TXT via `src/lib/fileImport.ts`) com preview e confirmação. **Reusar essa UX para o modo histórico.**
- `supabase/functions/_shared/plan-context.ts` (`buildPlanContext`): monta o contexto textual para a IA — **mas é focado no presente** (filtra objetivos para o trimestre/mês vigente e não injeta histórico). É aqui que entra a inteligência da memória.
- `supabase/functions/_shared/conductors/strategic.ts` e `quarterly.ts`: persona/condução do planejamento — onde a IA passará a questionar metas recorrentes.
- Regra de segurança: criar plano/objetivo/ação exige proposta+confirmação (`_shared/proposals.ts`). **Importar histórico NÃO cria objetivos/ações ativos** — é só documento de referência, então não passa pela engine de propostas; usa um preview+confirmar mais leve e nunca grava em `objectives`.

## Modelo de dados

### Fatia 1 — reusar `plan_documents`
Adicionar uma coluna para distinguir documento gerado de sessão vs. importado como histórico:

```sql
alter table public.plan_documents
  add column if not exists origin text not null default 'session'
    check (origin in ('session', 'historical'));
create index if not exists idx_plan_documents_origin
  on public.plan_documents (org_id, origin, period);
```

Documento histórico: `origin='historical'`, `session_id=null`, `type` escolhido pelo usuário (`strategic|quarterly|monthly|month_close|quarter_close`), `period`/ano **obrigatório**, `content` = `{ "raw": "<texto extraído>", "source": "<arquivo>", "note": "<opcional>" }`. RLS e grants já cobrem (owner grava org-level; coordenador grava area-level). Nenhuma policy nova.

### Fatia 2 — memória estruturada para comparação
Documento cru (jsonb) não é comparável entre anos. Criar tabela leve com as metas normalizadas por período, para detrecção barata de recorrência (sem campo de resultado — decisão 1):

```sql
create table if not exists public.strategic_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  source_document_id uuid references public.plan_documents(id) on delete cascade,
  year int not null,
  period text not null,           -- "2024", "T3 2024", "Set 2024"
  level text not null check (level in ('strategic','area_annual','quarterly','monthly')),
  type text check (type in ('harvest','seed')),
  title text not null,
  metric text,
  target text,
  normalized_title text not null, -- lower + sem acento, para matching
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_strategic_history_lookup
  on public.strategic_history (org_id, normalized_title, year);
alter table public.strategic_history enable row level security;
grant select, insert, update, delete on public.strategic_history to authenticated, service_role;
-- leitura: membro da org; escrita: owner ou coordenador da área (mesmo padrão de plan_documents)
```

Recorrência = agrupar por `normalized_title` (e/ou `metric`) e contar anos distintos; "meta recorrente" quando aparece em ≥2 anos. Matching inicial simples (título normalizado + métrica), evoluir depois.

## Fatia 1 — Arquivo histórico: guardar e ver (SEM IA)

Entrega mínima, sem risco, imediatamente útil (construir o arquivo).

- **Migration:** coluna `origin` em `plan_documents` (acima).
- **Import (Plano Estratégico):** em `src/pages/Strategic.tsx`, uma ação "Importar histórico" — upload/colar + **ano/período obrigatório** + tipo. Reusa `fileImport.ts` para extrair texto. Mostra preview do texto extraído e, ao confirmar, grava um `plan_document` com `origin='historical'`. **Não** chama IA, **não** cria objetivos.
- **Persistência:** via `src/state/store.tsx` (mutação nova `import_historical_document`) chamando o Supabase direto (é gravação de documento, protegida por RLS), OU uma Edge Function leve se preferir validar server-side o tamanho/tipo. Recomendo Edge Function `save-historical-document` para manter a fronteira (validação de `period`, `type`, tamanho do texto).
- **Ver:** em `src/pages/Documents.tsx`, adicionar filtro/badge "Histórico" (`origin`) para distinguir do gerado por sessão. Reusa a tela e o `plan-render`/`PlanDocument`.
- **Tipos:** ajustar `src/types/index.ts` (campo `origin` no tipo de documento).

**Critério de aceite:** subir um PDF de plano de 2024 com período "2024" → aparece em Documentos com badge Histórico → abre e imprime como os demais. `pnpm run lint && pnpm run build` verdes.

## Fatia 2 — Memória na inteligência (o pulo do gato)

- **Migration:** tabela `strategic_history` (acima).
- **Extração estruturada:** ao importar histórico (Fatia 1), disparar extração com a função de IA `background` (`_shared/ai-router.ts` + `model.ts`) para transformar o texto em linhas de `strategic_history` (title/metric/target/level/type por período). Registrar uso em `ai_usage_logs`. Opcional: backfill a partir de `objectives`/`plan_documents` já existentes.
- **Contexto histórico para a IA:** em `_shared/plan-context.ts`, adicionar seção "MEMÓRIA ESTRATÉGICA" (ou novo `buildHistoryContext`) que, ao iniciar sessão `strategic`/`quarterly`, resume as **metas recorrentes** (de `strategic_history` + objetivos atuais): ex. "Aumentar margem — aparece em 2023, 2024, 2025". Resumo compacto (não despejar documentos inteiros → controle de tokens).
- **Condução:** em `_shared/conductors/strategic.ts` e `quarterly.ts`, instruir a IA a **usar** essa memória e questionar repetição: "essa meta se repete desde 2023 — o que vai ser diferente para ela sair do papel agora?". A inferência de "não vem sendo atingida" vem do contexto (recorrência + qualquer status citado nos docs), sem campo de resultado.

**Critério de aceite:** com ≥2 anos de histórico contendo uma meta parecida, iniciar um planejamento estratégico novo e a IA mencionar/questionar a recorrência espontaneamente.

## Fatia 3 — Padrões visíveis (opcional, depois)

- Visão de "metas recorrentes" / linha do tempo de uma meta ao longo dos anos, deterministicamente a partir de `strategic_history` (agrupar por `normalized_title`).
- Onde: um bloco em Documentos ou um alerta discreto no Dashboard ("3 metas se repetem há ≥2 anos — revisar antes de replanejar"). Sem tela nova dedicada (decisão 3).

## Riscos e decisões técnicas

- **Não poluir o plano ativo:** histórico vive em `plan_documents(origin='historical')` e `strategic_history`, **nunca** em `objectives`. Dashboards/contagens não podem contar histórico. Conferir filtros existentes.
- **Custo de tokens:** alimentar a IA com *resumo* de recorrência, não documentos inteiros. Extração e uso passam por `ai_usage_logs` e roteamento por função (`background` para extrair, `planning` para conduzir).
- **Matching de recorrência:** começar simples (título normalizado + métrica); risco de falso positivo/negativo. Evoluir com similaridade depois (reusar abordagem de `_shared/quick-updates.ts`).
- **Privacidade:** documentos históricos são dados sensíveis da empresa — mesma RLS por `org_id`, nunca ao frontend como segredo. Atualizar `docs/SECURITY.md`.
- **Sem resultado estruturado:** por decisão do dono, a força da inferência depende da riqueza dos documentos. Deixar a porta aberta para, no futuro, capturar resultado opcional sem retrabalho de schema.

## Arquivos prováveis

- `supabase/migrations/2026XXXXXXXXXX_plan_documents_origin.sql` (Fatia 1)
- `supabase/migrations/2026XXXXXXXXXX_strategic_history.sql` (Fatia 2)
- `supabase/functions/save-historical-document/index.ts` (nova, Fatia 1) ou mutação em `src/state/store.tsx`
- `supabase/functions/_shared/plan-context.ts` (Fatia 2)
- `supabase/functions/_shared/conductors/strategic.ts`, `quarterly.ts` (Fatia 2)
- `supabase/functions/_shared/ai-router.ts` / `model.ts` / `usage.ts` (reuso, Fatia 2)
- `src/pages/Strategic.tsx` (import histórico, Fatia 1)
- `src/pages/Documents.tsx` (filtro/badge Histórico, Fatia 1)
- `src/state/store.tsx`, `src/types/index.ts`
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`

## Não entra (nesta iniciativa)

- Marcar/alimentar resultado (batida/não batida) das metas passadas.
- Transformar histórico em plano ativo ou objetivos editáveis.
- Nova seção na sidebar.
- Detecção de padrões por ML; começamos com heurística determinística + IA de linguagem.
```
