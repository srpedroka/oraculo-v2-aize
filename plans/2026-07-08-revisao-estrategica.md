# Plano: Revisão Estratégica (recalibrar o plano anual sob demanda)

## Objetivo

Permitir revisar o planejamento estratégico anual **a qualquer momento**, para fazer **microajustes** nos objetivos principais (metas, números, prazos, status) quando o contexto muda no decorrer do ano — sem recriar o plano nem perder a direção original. Cada revisão preserva o estado anterior e o **porquê** da mudança, alimentando a Memória Estratégica para os planejamentos futuros.

## Decisões do dono (2026-07-08)

1. **Cadência:** NENHUMA. É sob demanda — um botão **"Revisão Estratégica"** no Plano Estratégico, acionável quando o autor achar que há uma mudança que vale revisar. Sem cron, sem empurrão automático.
2. **Fronteira (microajuste, não replanejamento):** a revisão **ajusta os objetivos estratégicos que já existem** (meta/número, indicador, prazo, status + justificativa do que mudou). **NÃO** adiciona/remove objetivos em massa nem troca a estratégia — isso continua sendo o fluxo de planejar/replanejar.
3. **Onde vive:** botão no `src/pages/Strategic.tsx` (owner), ao lado de "Planejar o ano com o Oráculo".

## Como se encaixa (fundação já pronta)

É um **quarto ritual** ao lado dos existentes. Hoje o sistema já tem condutores de fechamento (`month_close`, `quarter_close`) e de planejamento (`strategic`, `quarterly`, `monthly`). A Revisão Estratégica é um condutor novo com propósito de **recalibragem**, reusando quase tudo:

- **Motor de sessão:** `_shared/session-engine.ts` + tabela `planning_sessions` (estado, fase, `pending_proposal`).
- **Edge Function:** `oracle-session` (ações `start` / `message` / `confirm` / `abandon`) já orquestra sessões.
- **Proposta + confirmação:** `_shared/proposals.ts` (`applyProposal`, `assertProposalPermission`) — a revisão escreve em `objectives`, então segue a regra proposta+confirmação.
- **Documentos canônicos:** `plan_documents` (tem `version`, `content jsonb`, `origin`) + `_shared/plan-documents.ts` / `plan-render.ts`.
- **Memória Estratégica:** `_shared/plan-context.ts` já injeta `plan_documents` no contexto do planejamento — o documento de revisão entra nessa memória automaticamente.
- **UI de sessão:** `src/components/OraclePanel.tsx` já renderiza sessão ativa, fases e o cartão "Pronto para gravar".

## Mecânica central

A revisão gera **um** `plan_documents` do tipo `strategic_review` que é, ao mesmo tempo, o snapshot do "antes", o registro do "depois" e o log do porquê:

```jsonc
// plan_documents.content de um strategic_review
{
  "motivo_revisao": "Fechou o 1o semestre; meta de faturamento defasou com o câmbio",
  "ajustes": [
    { "objetivo_id": "...", "titulo": "Faturamento", "campo": "target",
      "de": "R$ 5 mi/mês", "para": "R$ 4,2 mi/mês", "porque": "revisão de mercado H2" },
    { "objetivo_id": "...", "titulo": "Margem", "campo": "deadline",
      "de": "2026-09-30", "para": "2026-12-15", "porque": "atraso no ERP" }
  ],
  "antes": [ /* snapshot dos objetivos estratégicos como estavam */ ],
  "depois": [ /* como ficaram */ ]
}
```

Assim: o "antes" preserva a direção original (nunca se perde), os objetivos vivos evoluem (nunca fica preso), e `motivo_revisao`/`porque` viram a memória que o Oráculo lembra no próximo ciclo.

## Fatia 1 — Ritual de revisão que ajusta os objetivos (núcleo)

- **Migration:** estender o `check` de `type` em `planning_sessions` e `plan_documents` para incluir `strategic_review`. (Idempotente, no padrão de `20260707170000_plan_documents_origin.sql`.)
- **Condutor:** `supabase/functions/_shared/conductors/strategic-review.ts` — fases sugeridas: `abertura` (o que mudou e por que revisar), `revisao_objetivos` (percorre cada objetivo estratégico do contexto, um a um: "esse número/prazo mudou? por quê?"), `sintese` (resumo dos ajustes + confirmação). Usa a persona de `persona.ts`. Instruído a **só ajustar** objetivos existentes e a exigir a justificativa de cada mudança; nunca criar/excluir objetivo.
- **Wiring:** registrar o novo tipo no `session-engine.ts`/mapa de condutores e no `oracle-session/index.ts` (mesmo caminho de `start`/`message`/`confirm`).
- **Proposta:** nova forma em `_shared/proposals.ts` (ex.: `apply_strategic_review`) que, ao confirmar: (a) monta o `content` (antes/depois/ajustes) a partir dos objetivos estratégicos atuais; (b) **grava o `plan_documents` do tipo `strategic_review`** (o snapshot + log); (c) aplica os ajustes confirmados aos `objectives` (update de `target`/`current`/`deadline`/`status`). Validar permissão com `assertProposalPermission` (owner, escopo org). Nunca tocar objetivos de outra org/área.
- **Frontend:** botão **"Revisão Estratégica"** em `src/pages/Strategic.tsx` (visível para owner quando existe plano estratégico) que dispara `start_session` com `sessionType: "strategic_review"` (via `src/state/store.tsx`). Ajustar `src/types/index.ts`. No `OraclePanel.tsx`, um preview de proposta mostrando **antes → depois por objetivo** (reusar o padrão dos previews existentes).

**Critério de aceite:** owner clica "Revisão Estratégica" → o Oráculo percorre os objetivos, propõe ajustes com justificativa → ao confirmar, os objetivos são atualizados **e** um `plan_documents(strategic_review)` é gravado com antes/depois/porquê. Nenhum objetivo é criado ou removido. `pnpm run lint && pnpm run build` verdes.

## Fatia 2 — Documento de revisão visível + memória

- **Ver:** renderizar o `strategic_review` em `src/pages/Documents.tsx` / `PlanDocument.tsx` (seções: motivo, tabela antes→depois, justificativas). Aparece na lista de Documentos com selo próprio (ex.: "Revisão").
- **Memória:** confirmar que `_shared/plan-context.ts` inclui os `strategic_review` na seção "MEMÓRIA ESTRATÉGICA" quando o autor for planejar/revisar de novo — para o Oráculo lembrar "no meio de 2026 vocês ajustaram a meta de margem por causa de X".
- **WhatsApp (opcional):** resumo da revisão via `plan-render.ts`, como os outros documentos.

**Critério de aceite:** a revisão aparece em Documentos legível e, num planejamento/revisão seguinte, o Oráculo cita o ajuste anterior e o motivo.

## Fatia 3 — Trilha de evolução (opcional, depois)

- Linha do tempo de um objetivo: como a meta/prazo evoluiu ao longo das revisões (a partir dos `strategic_review.content`). Um bloco discreto no card do objetivo ou em Documentos. Sem tela nova.

## Riscos e decisões técnicas

- **Manter microajuste:** a maior tentação é a revisão virar replanejamento. O condutor e a validação da proposta devem **recusar** criação/exclusão de objetivo — só update de campos + justificativa. Deixar isso explícito no prompt e na `apply_strategic_review`.
- **Justificativa obrigatória:** cada ajuste precisa de `porque`; sem isso, a memória perde valor. O condutor deve insistir na justificativa antes de fechar a síntese.
- **Não poluir contagens:** o `strategic_review` é um documento; não é objetivo nem plano ativo novo. Conferir que dashboards/contagens não o confundem.
- **Permissão:** owner-only (nível estratégico), via `assertProposalPermission`. Coordenador não revisa o plano da empresa.
- **Concorrência/duplo-submit:** reusar o guard de confirmação já existente no `OraclePanel` (evita gravar a revisão duas vezes).
- **Tokens/custo:** a revisão usa a função `planning`; registra em `ai_usage_logs`. O contexto já traz os objetivos; não inflar.

## Arquivos prováveis

- `supabase/migrations/2026XXXXXXXXXX_strategic_review_type.sql` (Fatia 1)
- `supabase/functions/_shared/conductors/strategic-review.ts` (nova, Fatia 1)
- `supabase/functions/_shared/session-engine.ts` (registrar tipo, Fatia 1)
- `supabase/functions/_shared/proposals.ts` (`apply_strategic_review`, Fatia 1)
- `supabase/functions/oracle-session/index.ts` (wiring do novo tipo, Fatia 1)
- `supabase/functions/_shared/plan-documents.ts` / `plan-render.ts` (documento de revisão, Fatia 2)
- `supabase/functions/_shared/plan-context.ts` (memória inclui revisões, Fatia 2)
- `src/pages/Strategic.tsx` (botão, Fatia 1)
- `src/components/OraclePanel.tsx` (preview antes→depois, Fatia 1)
- `src/pages/Documents.tsx`, `src/components/PlanDocument.tsx` (ver revisão, Fatia 2)
- `src/state/store.tsx`, `src/types/index.ts`
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`

## Não entra (nesta iniciativa)

- Cadência/cron ou lembrete automático de revisão (decisão do dono: só sob demanda).
- Adicionar/remover objetivos ou trocar a estratégia (isso é planejar/replanejar).
- Revisão por coordenador do plano da empresa (owner-only).
- Reverter automaticamente para uma versão anterior (só preserva o histórico; rollback fica para depois se fizer sentido).
