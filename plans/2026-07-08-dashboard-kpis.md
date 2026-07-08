# Plano: Dashboard Executivo — 4 KPIs meta x atingido, mes a mes

> Design gerado por auditoria multi-agente (2026-07-08), grounded no codigo real. Parte do pacote de melhorias — ver `plans/2026-07-08-pacote-melhorias.md`.

Li os arquivos reais em `/Users/luisguilherme/Documents/Oraculo` (Dashboard, store, types, as duas migrations pedidas, `objective/*`, `_shared/auth.ts`, `invite-member`, `periods.ts`, `Settings.tsx` e a migration V3 mais recente para calibrar o estilo de RLS/realtime). Segue o design.

---

# Dashboard Executivo — KPIs meta × atingido, mês a mês

## 0. Diagnóstico do que existe hoje (para não reinventar)

- O bloco **Resultado** (`src/pages/Dashboard.tsx` linhas 103-165) hoje **garimpa `objectives`** por string (`metric/title` contendo "faturamento"/"margem") e mostra `objective.current` (atingido) e `objective.target` (meta) — ambos **texto livre** (`"R$ 1,8M"`), **sem recorte mensal**, sem % de atingimento.
- `objectives.target`/`current` são `text` (migration inicial, linhas 71-72). Não dá para calcular %, média móvel ou ladder em cima de texto.
- Permissão de escrita: `canEditObjective` (owner sempre; coordenador só na área dele) e `canCreateStrategicObjective = role === "owner"`. RLS via `is_owner`, `is_org_member`, `can_write_area`.
- Papéis existentes: só `owner` e `coordinator` (constraint `role in ('owner','coordinator')`, `MembershipRole` em `types/index.ts`). **Não existe `admin`.**
- Padrão de escrita: mutações simples vão **direto ao Supabase pelo client** sob RLS (`update_objective`); ações sensíveis/privilegiadas vão por **Edge Function + service role** (`invite-member` usa `assertOwner`).

## 1. Modelo de dados — recomendação: **tabela nova**, não estender `objectives`

**Recomendo tabela dedicada.** Justificativa concreta:

1. KPI mensal é **série temporal numérica** (12 meses × meta/atingido por KPI). Em `objectives` isso viraria ou 12 linhas por KPI (polui o hierárquico/planejamento) ou JSON num campo texto — ambos ruins para calcular %, MA3 e ladder.
2. `objectives.target/current` são `text`; precisamos de `numeric` para atingimento, média móvel e comparações.
3. Caixa precisa de **meta-como-marco (estágio)** além de número — colunas próprias, que não cabem no shape de `objectives`.
4. Caminho de escrita é diferente: KPI é **medição digitada** (não é objeto de plano) → escrita direta sob RLS, sem a máquina de proposta+confirmação das sessões.

Ficam **duas tabelas** (definição + valores mensais), no mesmo estilo das tabelas V3.

### 1.1 `executive_kpis` — definição/config por org (4 linhas por org)

```sql
create table public.executive_kpis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kpi_key text not null check (kpi_key in ('revenue','operating_margin','production','cash')),
  label text not null,                       -- rótulo PT-BR editável
  unit text not null default 'currency'
    check (unit in ('currency','percent','count','number')),
  secondary_unit text                        -- Produção: qtd opcional (ver decisão P1)
    check (secondary_unit is null or secondary_unit in ('count','number')),
  direction text not null default 'higher_better'
    check (direction in ('higher_better','lower_better')),
  flow_type text not null default 'flow'     -- 'flow' acumula no mês; 'stock' é saldo
    check (flow_type in ('flow','stock')),
  is_ladder boolean not null default false,  -- true só para caixa
  ladder jsonb not null default '[]',        -- estágios ordenados p/ caixa
  opening_balance numeric,                   -- baseline p/ Jan do caixa (Dez ano anterior)
  annual_target numeric,                     -- meta anual (informativa / auto-distribuição)
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, kpi_key)
);
```

`ladder` (jsonb) para o caixa segue o mesmo padrão dos JSONs de `strategic_plans`. Default seedado:

```json
[
  {"key":"stop_bleed","label":"Estancar sangria","order":1},
  {"key":"operational_zero","label":"Operacional ≥ 0","order":2},
  {"key":"service_debt","label":"Aguentar a dívida","order":3},
  {"key":"surplus","label":"Sobrar","order":4}
]
```

### 1.2 `kpi_monthly_values` — meta/atingido por org/kpi/ano/mês

```sql
create table public.kpi_monthly_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kpi_id uuid not null references public.executive_kpis(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  target_value numeric,          -- meta do mês (fluxo) OU limiar do estágio (caixa, opcional)
  target_stage text,             -- marco/estágio do mês (caixa); referencia ladder[].key
  actual_value numeric,          -- fluxo: realizado do mês; caixa: SALDO no fim do mês (ver P2)
  secondary_actual numeric,      -- Produção: qtd (se secondary_unit definido)
  note text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (kpi_id, year, month)
);
create index kpi_monthly_values_lookup_idx on public.kpi_monthly_values (org_id, kpi_id, year, month);
```

`org_id` denormalizado nas duas tabelas para a RLS usar `is_admin(org_id)` direto, sem join (mesma escolha do resto do schema).

**Como Caixa suporta ladder + MA3** (tudo derivado no client, ver Fatia 2):
- `actual_value` do caixa = **saldo bancário no fim do mês** (é estoque). `opening_balance` = Dez do ano anterior.
- `geração[m] = actual[m] − actual[m−1]` (Jan usa `opening_balance`).
- `geraçãoMA3[m] = média(geração[m−2..m])` (suavização de 3 meses).
- `target_stage[m]` = estágio-alvo do mês; a UI compara `geraçãoMA3` com o estágio para dizer se o marco foi atingido.
- Fluxo (faturamento/produção/margem): `actual_value` é o realizado do mês; `target_value` é a meta do mês; atingimento `= actual/target` (guardando `target` nulo/zero).

## 2. RLS — membro lê, admin/owner escreve

Introduz `is_admin` (owner **ou** admin) e usa nas duas tabelas. Mesma forma dos helpers existentes:

```sql
create or replace function public.is_admin(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = target_org
      and role in ('owner','admin')
  );
$$;
```

Policies (padrão idêntico ao `plan_documents`/`objectives`):

```sql
alter table public.executive_kpis enable row level security;
alter table public.kpi_monthly_values enable row level security;

-- leitura: qualquer membro
create policy executive_kpis_read_member on public.executive_kpis
  for select to authenticated using (public.is_org_member(org_id));
create policy kpi_values_read_member on public.kpi_monthly_values
  for select to authenticated using (public.is_org_member(org_id));

-- escrita: owner OU admin
create policy executive_kpis_write_admin on public.executive_kpis
  for all to authenticated using (public.is_admin(org_id)) with check (public.is_admin(org_id));
create policy kpi_values_write_admin on public.kpi_monthly_values
  for all to authenticated using (public.is_admin(org_id)) with check (public.is_admin(org_id));
```

Grants + realtime + `replica identity full` seguindo o bloco final da migration V3 (linhas 136-267): `grant ... to authenticated, service_role`; adicionar as duas tabelas ao `supabase_realtime`.

Constraint de papel precisa aceitar `admin` (mesmo padrão do-block usado em `ai_model_keys`):

```sql
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','admin','coordinator'));
```

**Backfill / seed:** na própria migration, `insert ... select` das 4 linhas `executive_kpis` para cada org existente (com defaults: revenue=currency/flow, operating_margin=percent/flow, production=currency/flow + secondary count, cash=currency/stock/is_ladder + ladder default). Para orgs novas, seedar dentro de `create_organization` no store (junto do `insert ai_settings`, store linha ~1004).

> Nota de segurança (AGENTS.md): proposta+confirmação é exigida para **criar planos/objetivos/ações** — KPI aqui é **medição digitada pelo dono**, não objeto de plano. Escrita direta sob RLS `is_admin` é coerente com como `update_objective` já grava `current/target` hoje. Mantemos `updated_by`/`updated_at` para auditoria.

## 3. Edge Function vs store

| Operação | Onde | Por quê |
|---|---|---|
| Ler `executive_kpis` / `kpi_monthly_values` | React Query no store | igual às outras tabelas |
| Upsert de valor mensal (meta/atingido/estágio) | **Client direto** sob RLS `is_admin` (`upsert_kpi_month`) | medição de baixo risco; espelha `update_objective` |
| Upsert de config do KPI (label/unit/ladder/opening_balance) | **Client direto** sob RLS `is_admin` (`upsert_kpi_definition`) | idem |
| **Promover/rebaixar papel (admin)** | **Edge Function `set-member-role`** (service role + `assertOwner`) | escalonamento de privilégio = sensível; precisa validação server-side (último owner, papéis permitidos) |

## 4. Permissão — "promover a admin": **novo papel `admin`** (não multi-owner)

Recomendo **papel `admin` novo**, não transformar todo mundo em `owner`. Motivos:

- `owner` = dono (raiz de confiança: deleta org, transfere posse, gerencia billing). Multiplicar owners apaga essa raiz — qualquer owner poderia remover os outros e mudar a empresa.
- O pedido é literalmente "promover a **admin**". `admin` herda o poder **operacional** de escrever o dashboard, mas **não** a posse.

**Blast radius controlado (importante):** para esta feature, `is_admin` é usado **só nas policies dos KPIs** e na promoção. **Não** troco os `is_owner` das outras tabelas (plano estratégico, membros, IA) por `is_admin` — senão admins ganhariam poderes não pedidos. `admin` = **edita o dashboard**. (Ampliar depois é decisão de produto — ver P5.)

**Edge Function `set-member-role`** (`supabase/functions/set-member-role/index.ts`), espelhando `invite-member`:
- `getUser` → `assertOwner(user.id, orgId)` (só owner promove — ver P6).
- valida `role in ('admin','coordinator','owner')`.
- **guarda "último owner"**: se rebaixar um owner, exigir que exista ≥1 outro owner.
- `serviceClient().from('memberships').update({role}).eq('id', membershipId).eq('org_id', orgId)`.
- store: action `set_member_role` → `callEdgeFunction('set-member-role', {...}).then(invalidateOrg)`.

`memberships_update_owner` (RLS, auth_rls linha 191) já cobriria um update client-side, mas mantemos por Edge Function pela validação de último-owner e por consistência com AGENTS.md ("ações sensíveis por Edge Function").

## 5. UI — bloco Resultado (leitura) + editor de lançamento

### 5.1 Bloco Resultado no Dashboard (topo, máxima visibilidade)
Novo `src/features/kpi/KpiResultBlock.tsx` substitui os dois cards revenue/margin (Dashboard linhas 103-165). **4 cards** (grid 2×2, mesmo container `rounded-[22px] border shadow-card`), ano corrente, mês corrente como foco:

- **Faturamento / Margem / Produção** (fluxo): número grande do **mês atual** (`actual`), `Meta: <target>`, badge de **% atingimento** (verde ≥100, âmbar 80-99, vermelho <80 — cores contidas do cockpit), e **mini gráfico 12 meses** (recharts, já é dep) com barras `atingido` + linha `meta`.
- **Caixa** (estoque/ladder): mostra **geração de caixa (delta MA3)** do mês, badge do **estágio atingido** vs **estágio-alvo** (ladder), e sparkline da geração mensal.
- Cabeçalho da seção ganha botão **"Lançar / Editar"** visível só se `canEditDashboard` (owner/admin) que abre o editor.
- Empty state por card quando não há valores no ano ("Sem lançamento em 2026").

Derivações em novo `src/lib/kpi.ts` (puro, testável): `formatKpiValue(value, unit)`, `attainment(actual,target,direction)`, `ytdSum(values)`, `cashDeltas(values, openingBalance)`, `movingAverage3(deltas)`, `resolveLadderStage(ma3, ladder)`.

### 5.2 Editor de lançamento — **grade editável de 12 meses** (recomendado sobre modal-por-mês)
Novo `src/features/kpi/KpiEditorDialog.tsx` (mesmo shell de modal do `ObjectiveEditDialog`):

- **Abas** no topo: `Faturamento | Margem | Produção | Caixa`.
- **Grade de 12 linhas** (Jan…Dez de `currentYear()`), colunas:
  - Fluxo: `Mês | Meta (numérico) | Atingido (numérico) | %` (Produção com coluna extra `Qtd` se `secondary_unit`).
  - Caixa: `Mês | Estágio-alvo (dropdown do ladder) | Saldo fim do mês (numérico) | Geração (derivada, read-only) | MA3 (derivada, read-only)`.
- Campo **Meta anual** + botão **"Distribuir igualmente"** (preenche as 12 metas) e, no caixa, campo **Saldo inicial (Dez ano anterior)** → grava `opening_balance`.
- Inputs numéricos com máscara leve; salvar faz **upsert por mês** (`upsert_kpi_month`, onConflict `kpi_id,year,month`). Autosave por linha ou "Salvar" único — escolho **"Salvar"** único por aba para ficar simples e previsível.
- Só abre se `canEditDashboard`; coordenador nunca vê o botão nem a rota.

Grade > modal-por-mês porque o dono quer **ver e preencher o ano inteiro de uma vez** (desdobrar meta anual → mensal e ir atualizando o realizado) — 12 modais seria fricção.

### 5.3 Permissão no dashboard
Novo helper (substitui/estende o de hoje):
```ts
const canEditDashboard = ["owner","admin"].includes(state.currentMembership?.role ?? "");
```
Usado no botão "Lançar / Editar" e como guarda no `KpiEditorDialog`.

### 5.4 Settings — gestão de papel
Em `src/pages/Settings.tsx` (bloco de membros, linhas 420-451): trocar o badge estático por um **select de papel** (`Dono | Admin | Coordenador`) visível só para owner, disparando `set_member_role`; label "Admin" no badge (linha 436). `remove_member`/`isCurrentUser` já existem como referência de padrão.

## 6. Fatias (pequenas, testáveis)

### Fatia 0 — Fundação de dados (migration + RLS + `is_admin`) — sem UI
- **Arquivos:** nova migration `supabase/migrations/20260709xxxxxx_executive_kpis.sql`.
- **Passos:** criar as 2 tabelas; `is_admin()`; policies read-member/write-admin; grants; realtime + replica identity; alterar constraint de papel p/ incluir `admin`; backfill das 4 linhas por org existente.
- **Aceite:** migration aplica limpa; `is_admin` = true p/ owner e admin, false p/ coordinator; `select` de KPI funciona p/ membro; `insert/update` bloqueado p/ coordinator e liberado p/ owner/admin (testar via SQL com JWTs); 4 linhas seedadas por org.

### Fatia 1 — Tipos + store (leitura)
- **Arquivos:** `src/types/index.ts` (interfaces `ExecutiveKpi`, `KpiMonthlyValue`, `LadderStage`; `MembershipRole = 'owner'|'admin'|'coordinator'`; campos em `AppState`; labels); `src/state/store.tsx` (queries `executive_kpis`/`kpi_monthly_values` + `mapExecutiveKpi`/`mapKpiMonthlyValue`, incluir em `state`/`loading`, `invalidateOrg` e canal realtime).
- **Aceite:** `state.executiveKpis` (4) e `state.kpiValues` carregam; realtime invalida ao alterar linha no banco; `pnpm run lint && build` verdes.

### Fatia 2 — Bloco Resultado mês a mês (leitura)
- **Arquivos:** `src/lib/kpi.ts` (derivações); `src/features/kpi/KpiResultBlock.tsx`; `src/features/kpi/KpiSparkline.tsx`; editar `src/pages/Dashboard.tsx` (remover cards revenue/margin, renderizar o bloco).
- **Aceite:** 4 cards renderizam mês atual meta×atingido×%; sparkline 12 meses; card Caixa mostra geração MA3 + estágio; empty states; visual permanece cockpit limpo.

### Fatia 3 — Editor de lançamento (grade 12 meses)
- **Arquivos:** `src/features/kpi/KpiEditorDialog.tsx`; store actions `upsert_kpi_month` e `upsert_kpi_definition` (client direto sob RLS, padrão `update_objective`); botão no Dashboard sob `canEditDashboard`.
- **Aceite:** owner abre, edita 12 metas + realizado, salva, dashboard atualiza ao vivo; "Distribuir igualmente" preenche metas; caixa grava estágio + saldo e mostra geração/MA3 derivados; coordenador não vê o botão; validação numérica (meta nula → % "—").

### Fatia 4 — Permissão "promover a admin"
- **Arquivos:** `supabase/functions/set-member-role/index.ts` (novo); `_shared/auth.ts` (opcional `assertAdmin`); store action `set_member_role`; `src/pages/Settings.tsx` (select de papel + label Admin); helper `canEditDashboard`.
- **Aceite:** owner promove coordenador→admin; admin passa a abrir/salvar o editor; admin **não** ganha poder de editar plano/membros; owner não consegue rebaixar o último owner (erro server-side); coordenador não promove ninguém.

### Fatia 5 — Acabamento + docs (opcional)
- YTD/acumulado anual por card (fluxo = soma; margem/caixa **não somam** — ver P9); atualizar `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` (schema novo, RLS, papel admin, Edge Function) — obrigatório por AGENTS.md §8.

## 7. Decisões de produto em ABERTO (flaggo, não invento)

- **P1 — Produção: valor ou quantidade?** Default proposto: `unit` primário escolhido pelo dono + `secondary_unit`/`secondary_actual` opcional para qtd. Confirmar se quer os dois lado a lado no card ou só um.
- **P2 — Caixa "atingido": saldo ou variação?** Recomendo gravar **saldo do fim do mês** (é estoque) + `opening_balance`, app deriva delta/MA3. Alternativa mais simples: dono digita a **variação** direto. Precisa do dono confirmar como ele pensa o número.
- **P3 — Ladder do caixa:** entrego 4 estágios default (estancar/operacional≥0/dívida/sobrar). Confirmar rótulos e se cada estágio tem **limiar numérico** (`target_value`) ou é só qualitativo.
- **P4 — Escopo do papel `admin`:** default = **só edita o dashboard**. Ampliar para convidar membros / editar plano é decisão futura (evita escalonamento silencioso).
- **P5 — Quem promove admin:** default = **só owner**. Admin poder promover outro admin? (recomendo não, por ora).
- **P6 — Ano do dashboard:** default = ano corrente (`currentYear()`); schema já tem `year` para histórico/multi-ano. Confirmar se precisa seletor de ano já na v1.
- **P7 — Agregação anual de Margem e Caixa:** soma de meses **não** faz sentido (margem é razão; caixa é saldo). Definir se o "acumulado" mostra última leitura, média ponderada (margem) ou saldo atual (caixa).
- **P8 — Direção por KPI:** default `higher_better` para os 4. Algum caso `lower_better` (ex.: alguma meta de caixa)? Confirmar.
- **P9 — % de atingimento quando meta ausente/zero:** default = exibir "—" (sem divisão por zero) e badge neutro.

---

**Arquivos que serão criados/afetados** (todos absolutos sob `/Users/luisguilherme/Documents/Oraculo`): `supabase/migrations/20260709xxxxxx_executive_kpis.sql` (novo), `supabase/functions/set-member-role/index.ts` (novo), `src/lib/kpi.ts` (novo), `src/features/kpi/KpiResultBlock.tsx` + `KpiEditorDialog.tsx` + `KpiSparkline.tsx` (novos), `src/types/index.ts`, `src/state/store.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Settings.tsx`, `supabase/functions/_shared/auth.ts` (opcional), e docs em `docs/`.
