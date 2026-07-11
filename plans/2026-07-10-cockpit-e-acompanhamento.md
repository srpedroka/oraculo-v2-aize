# Plano: Testabilidade + Cockpit de acompanhamento

> **STATUS: ✅ TUDO executado e publicado por Claude Code em 2026-07-10.** A (navegação mobile) + B (cockpit) no commit `c729197`; D (YTD/projeção) + C (dono=membro + cron `deadline-nudges` 08:00 SP) em seguida. Migration `20260710223000_owner_membership_and_nudges.sql` aplicada + registrada; função `deadline-nudges` deployada (dry-run OK, 401 sem segredo); frontend publicado. Fica de fora, consciente: seletor de membro para ações-chave (só objetivos têm hoje; o cron casa por nome) e carência automática.


Quatro melhorias que tiram o Oráculo de "forte no planejamento, fraco no acompanhamento" e destravam o teste prático. Ordenadas por alavanca e dependência. Cada frente é uma fatia independente, fatiável em ondas para o Codex (ou execução direta).

Fonte da avaliação: revisão geral de 2026-07-10 (7 lentes lendo o código). Diagnóstico já validado no código real.

---

## A · Navegação mobile (bug — prioridade máxima)

### Diagnóstico (confirmado no código)
- `src/components/Sidebar.tsx` renderiza sempre; o `<aside>` é escondido no mobile (`hidden sm:flex`).
- `src/components/Layout.tsx:23` tem um botão Menu (`sm:hidden`) que dispara `{ type: "toggle_sidebar" }`.
- `toggle_sidebar` só inverte `ui.sidebarCollapsed` (colapso de **desktop**, `store.tsx:239`). No celular não abre nada.
- **Resultado:** no celular o usuário loga, vê o Dashboard e não consegue navegar. Bloqueia o teste prático.

### Decisão
Separar o estado de **colapso desktop** do estado de **drawer mobile**. Não reaproveitar `sidebarCollapsed`.

### Implementação (fatia única)
1. **Store** (`src/state/store.tsx`): novo estado de UI `mobileNavOpen: boolean` (default `false`) + ações `open_mobile_nav` / `close_mobile_nav` / `toggle_mobile_nav`. Ficam na mesma lista de ações "só-UI" que não tocam banco (`store.tsx:1408`).
2. **Layout** (`src/components/Layout.tsx`): o botão Menu passa a disparar `toggle_mobile_nav` (não `toggle_sidebar`).
3. **Sidebar** (`src/components/Sidebar.tsx`): no mobile vira **slide-over**: `<aside>` posicionado `fixed inset-y-0 left-0 z-40` com `translate-x-[-100%]` quando fechado e `translate-x-0` quando `mobileNavOpen`, transição suave (respeitar `motion-reduce`). Um **backdrop** `fixed inset-0 z-30 bg-black/30` clicável que fecha. No desktop (`sm:`) mantém o comportamento atual (estático + colapsável). Botão X no topo do drawer.
4. **Fechar ao navegar:** `close_mobile_nav` ao clicar em qualquer `NavLink` e no `useEffect` de mudança de rota (usar `useLocation`). Trava scroll do body enquanto aberto (`overflow-hidden`).
5. **A11y:** `role="dialog"`/`aria-modal` no drawer aberto; foco no primeiro link; `Esc` fecha.

### Critério de pronto
No celular (≤640px): tocar Menu abre o drawer, navegar troca de página e fecha o drawer, backdrop fecha, e nada quebra no desktop. Testar em 390×844.

---

## B · Cockpit de execução

### Diagnóstico
- `deadline` e `status` (`"on_track" | "at_risk" | "late" | "done"`) existem em objetivos/ações/projetos, mas **"atrasado" nunca é derivado do prazo** — é sempre manual/IA.
- Não há agregado no-prazo/atrasado, nem lista de vencidos, nem corte por dono. Status mora dentro de cada card de área (`Execution.tsx`).

### Decisão
**"Atrasado" é derivado, não armazenado.** O `status` guardado continua sendo a intenção humana/IA; a "lateness" é **sempre calculada** (`deadline < hoje` em São Paulo E `status !== "done"`). Isso evita corrida de "quem é dono do status" e mantém a verdade sempre correta.

### Implementação
- **B0 — Helpers** (`src/lib/execution.ts`, novo): `isOverdue(item, now)`, `derivedStatus(item, now)` (`done` | `late` | `at_risk` | `on_track`), `summarize(items)` → `{ total, onTrack, atRisk, late, done, onTimePct }`, `groupByOwner(items)`. Funciona para objetivos e ações-chave (ambos têm `deadline`/`status`).
- **B1 — Bloco Cockpit** no topo de `src/pages/Execution.tsx` (novo `src/features/execution/ExecutionCockpit.tsx`):
  - **Faixa de números:** % no prazo, # atrasados, # em risco, # concluídos — do mês/period corrente, considerando objetivos mensais ativos + ações-chave ativas.
  - **Lista de atrasados:** item, área, dono, prazo, dias em atraso — ordenada por mais atrasado. Clique abre o objetivo/ação. Chip vermelho.
  - **Corte por dono:** agrupa por `owner` (texto por ora; vira membro na Fatia C), mostrando por pessoa: total, atrasados, % no prazo.
- **B2 — Sinais nos cards existentes:** `ObjectiveCard`/ações ganham um selo "Atrasado" derivado (não depende do status salvo) quando `isOverdue`.
- **B3 — Espelho no Dashboard:** uma linha resumo no `Dashboard.tsx` ("X atrasados · Y% no prazo") com link para a Execução, para o CEO ver de relance sem entrar.

### Critério de pronto
Com objetivos/ações com prazo vencido e não concluídos, o Cockpit mostra a contagem certa, a lista de atrasados e o corte por dono; nada é gravado no banco (derivado). Empty state quando não há prazos.

### Não entra (aqui)
Pulso semanal automático e "status vira late sozinho no banco" — a lateness derivada já cobre a leitura; a **notificação** de atraso vem na Fatia C (cron).

---

## C · Dono = membro de verdade (+ notificação)

### Diagnóstico
- `owner` é **texto livre** em `key_actions`, `objectives`, `strategic_projects` (sem FK a membro). Sem atribuição real nem notificação.
- Já existe canal: `_shared/whatsapp.ts:sendWhatsAppMessages(settings, keyRow, phone, text)`; `profiles.phone` guarda o celular; `memberships` liga usuário↔empresa. O `month-turn` já faz exatamente esse envio.

### Decisão
Adicionar vínculo **opcional** a membro sem quebrar o texto livre (donos externos continuam válidos). O texto vira rótulo de exibição; o vínculo habilita notificação e o corte por pessoa real.

### Implementação
- **C0 — Migration** (`add_owner_membership.sql`): `add column owner_membership_id uuid references public.memberships(id) on delete set null` em `key_actions`, `objectives`, `strategic_projects`. Índice por `(org_id, owner_membership_id)`. Sem mudança de RLS (colunas nas tabelas já protegidas; escrita de coordenador continua por `can_write_area`).
- **C1 — Tipos + store + mapeadores:** `ownerMembershipId?: string | null` nos tipos; incluir no `select`/map e nas ações de update. Ao gravar, se um membro for escolhido, preencher **também** o texto `owner` com o nome do membro (denormalizado para exibição/PDF/IA).
- **C2 — Seletor de responsável** no `ObjectiveEditDialog` e no editor de ação-chave: dropdown de membros ativos da empresa (nome/e-mail) + opção "Outro (texto livre)". Coordenador vê os membros da empresa; a permissão de escrita continua a mesma.
- **C3 — Notificação de responsabilidade** (nova Edge Function `deadline-nudges`, cron diário ~08:00 São Paulo, protegida por segredo como o `month-turn`):
  - Varre ações-chave e objetivos **ativos**, com `deadline` hoje/amanhã ou vencido, `status != done`, `owner_membership_id` não nulo e `profiles.phone` presente.
  - Agrupa por pessoa e manda **um** WhatsApp por dia por pessoa (resumo: "Você tem 3 entregas para hoje/atrasadas: …"). Reusa `sendWhatsAppMessages` + settings/key da org (`whatsapp_settings`+`whatsapp_instance_keys`), respeitando `enabled` e empresa **não arquivada**.
  - Idempotência: tabela `deadline_nudge_log (org_id, membership_id, sent_date)` para não repetir no mesmo dia.
  - Notificação **na atribuição** (opcional, fase 2): ping curto quando um membro é setado como dono — deixar para depois para não spammar.
- **C4 — Cockpit por membro real:** a Fatia B passa a agrupar por `owner_membership_id` quando houver, caindo para o texto quando não.

### Dependências / cuidados
- Depende de WhatsApp configurado + celulares nos perfis. Sem isso, a atribuição/cockpit funcionam; só a notificação fica silenciosa (degradação graciosa; logar "sem telefone").
- Deep-link do dono para o item exige rota direta (pode ser fase 2; por ora o texto do WhatsApp descreve o item).

### Critério de pronto
Setar um membro como responsável de uma ação-chave preenche o vínculo + o nome; o Cockpit agrupa por pessoa real; o cron manda (em ambiente de teste com número real) um resumo diário e não repete no mesmo dia.

---

## D · YTD + projeção no Dashboard

### Diagnóstico
- `executive_kpis` tem `annualTarget`, `openingBalance`, `flowType`, `isLadder`; `kpi_monthly_values` tem `targetValue`/`actualValue` por mês. Mas `KpiResultBlock` mostra **só o mês fechado** — sem "quanto do ano já entregou" nem "vou bater a meta?".
- `src/lib/kpi.ts` não tem YTD/projeção.

### Decisão
Adicionar YTD e uma projeção **simples e honesta** (run-rate), respeitando o tipo do KPI. Nada de forecast estatístico — só "no ritmo atual, onde chego".

### Implementação
- **D0 — Helpers** (`src/lib/kpi.ts`):
  - `ytd(monthValues, upToMonth)`: para KPI de **fluxo** (`flowType === "flow"`: faturamento, produção) = soma dos `actualValue` dos meses fechados; alvo YTD = soma dos `targetValue` até o mês (ou `annualTarget` proporcional se faltar meta mensal).
  - Para **margem (%)**: YTD = média ponderada/observada dos meses fechados (não soma). Mostrar "média no ano".
  - Para **caixa (stock/ladder)**: não somar. "Ano" = geração acumulada (Σ `cashDeltas` dos meses fechados) e saldo atual; projeção = saldo atual + média de geração × meses restantes.
  - `runRateProjection(kpi, monthValues, monthsElapsed)`: fluxo = `ytdActual / monthsElapsed × 12`; comparar a `annualTarget`. Retorna `{ projected, vsAnnualTarget, onPace }`.
  - Guardas: `annualTarget` nulo ⇒ retorna `null` e a UI esconde a linha.
- **D1 — UI** (`src/features/kpi/KpiResultBlock.tsx`): sob o valor do mês, uma **linha "Ano"** compacta por card: `YTD {valor} de {annualTarget}` + barra de progresso anual + **marcador de projeção** ("projeção {valor} · no ritmo / abaixo") com cor semântica (verde/âmbar/vermelho reusando o padrão de `attainment`). Caixa mostra "geração no ano" + projeção de saldo em vez de soma.
- **D2 — Formatação:** reusar `formatKpiValue` por `unit`; `tabular-nums`; esconder projeção quando faltar dado (poucos meses fechados ⇒ marcar "projeção indisponível" em vez de número enganoso).

### Critério de pronto
Cada card mostra YTD × meta anual e uma projeção de run-rate coerente com o tipo (fluxo soma, margem média, caixa geração/saldo); esconde graciosamente sem meta anual ou com poucos meses.

---

## Ordem sugerida de execução
1. **A (mobile)** — bug, rápido, destrava o teste. 1 onda.
2. **B (cockpit)** — só frontend, sem schema, alto valor. 1–2 ondas (B0/B1 e depois B2/B3).
3. **D (YTD/projeção)** — só `kpi.ts` + `KpiResultBlock`, isolado. 1 onda.
4. **C (dono=membro + notificação)** — a maior: migration + UI + cron. 2 ondas (C0–C2 e depois C3–C4).

A/B/D são independentes e podem ir em paralelo; C fecha o ciclo (accountability real + notificação) e enriquece o corte por dono do Cockpit.

## Não entra (todo o pacote)
Integrações externas (calendário/CRM/ERP), exportação CSV/API, deck de board, forecast estatístico, permissão granular por objetivo, LGPD. São o próximo horizonte, fora deste plano de "destravar o teste + acompanhamento vivo".
