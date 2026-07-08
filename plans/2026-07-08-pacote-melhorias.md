# Pacote de Melhorias — Oráculo (2026-07-08)

Índice mestre da rodada de testes do dono + pesquisas de design. Consolida tudo que foi coletado testando a plataforma. Cada item grande tem um plano detalhado próprio (linkado abaixo); os pequenos estão inline aqui.

**Como usar:** executar em **ondas** (não tudo de uma vez). A Onda 1 é correção/quick-win, pode rodar já. A Onda 2 (Dashboard) é a feature grande — revisar as "decisões abertas" antes de construir. Fechar cada mudança com `pnpm run lint && pnpm run build` (AGENTS.md).

---

## Visão geral

| # | Item | Tipo | Prioridade | Plano detalhado |
|---|---|---|---|---|
| A | WhatsApp mudo após Grok + validar config de IA ao salvar | 🔴 Bug | ALTA | [config-ia](2026-07-08-config-ia.md) — Fatia A |
| B | "Não sei se o modelo salvou" (confirmação real) | 🔴 Bug/UX | ALTA | [config-ia](2026-07-08-config-ia.md) — Fatia A |
| C | Acabamento: logo/lema (2 pontos do dono) | ✨ UI | ALTA | [polimento-ui](2026-07-08-polimento-ui.md) — P0 |
| D | Remover "Analytics" (placeholder morto) | 🧹 Limpeza | BAIXA (trivial) | inline abaixo |
| E | Importar histórico: corrigir data/período silenciosa | 🐛 Quick win | MÉDIA | [importar-historico-ia](2026-07-08-importar-historico-ia.md) — Fatia 0 |
| F | Dashboard: 4 KPIs meta×atingido, mês a mês | ⭐ Feature core | ALTA (grande) | [dashboard-kpis](2026-07-08-dashboard-kpis.md) |
| G | Permissão: só admin edita + promover a admin | 🔐 Permissão | MÉDIA | [dashboard-kpis](2026-07-08-dashboard-kpis.md) — Fatia 4 |
| H | Importar histórico: IA classifica tipo/área/período + título | 🧠 Feature | MÉDIA | [importar-historico-ia](2026-07-08-importar-historico-ia.md) — Fatias 1-4 |
| I | Config de tom/persona do Oráculo por empresa | ✨ Feature | MÉDIA | [config-ia](2026-07-08-config-ia.md) — Fatia B |
| J | Acabamento: transições, micro-interações, ritmo, tokens | ✨ UI | MÉDIA | [polimento-ui](2026-07-08-polimento-ui.md) — Fundação + Temas 1-4 |

---

## Ordem de execução recomendada (ondas)

### 🌊 Onda 1 — Correções e quick wins (rápido, alto valor, baixo risco)
Pode rodar já; entrega visível e conserta o que está quebrado.
1. **A + B** — [config-ia](2026-07-08-config-ia.md) **Fatia A**: validar provider+modelo+chave ao salvar (chamada de teste no `save-ai-settings`), confirmação real na UI, e status por função. Isso **conserta o WhatsApp mudo** (o `grok-4.3` provavelmente é inválido no xAI) e o "não sei se salvou".
2. **C** — [polimento-ui](2026-07-08-polimento-ui.md) **P0**: logo ORÁCULO/lema (só `Sidebar.tsx:163/167`).
3. **D** — Remover Analytics (inline abaixo).
4. **E** — [importar-historico-ia](2026-07-08-importar-historico-ia.md) **Fatia 0**: corrigir o default silencioso do período (sem IA).

### 🌊 Onda 2 — Feature core: Dashboard dos 4 KPIs
[dashboard-kpis](2026-07-08-dashboard-kpis.md), Fatias 0→5. **Antes de construir, bater as decisões abertas** (ver seção abaixo) — é a maior mudança do pacote (tabelas novas + papel `admin`). Inclui o item **G** (permissão) na Fatia 4.

### 🌊 Onda 3 — Inteligência e refinamento
- **H** — [importar-historico-ia](2026-07-08-importar-historico-ia.md) Fatias 1-4 (IA de classificação na importação).
- **I** — [config-ia](2026-07-08-config-ia.md) Fatia B (tom/persona por empresa).
- **J** — [polimento-ui](2026-07-08-polimento-ui.md) Fundação (tokens de conforto) + Temas 1-4 (transições, micro-interações, ritmo).

---

## Item D (inline) — Remover "Analytics" da sidebar
Placeholder inerte sem rota. Em `src/components/Sidebar.tsx`: remover o item do array `inertItems` (~linha 37) e o bloco que o renderiza (~linha 205); se `inertItems` ficar vazio, remover ele e a `<div className="my-3 h-px bg-border" />` órfã. Trivial e seguro.

---

## Decisões de produto EM ABERTO (o dono precisa bater antes/junto)

Cada plano detalhado tem sua seção "Decisões abertas". As que mais importam:

**Dashboard (Onda 2) — as mais relevantes:**
- **Papel `admin`**: o design recomenda criar um papel novo `admin` (owner + admin escrevem) em vez de permitir múltiplos owners. Confirmar.
- **Produção**: medir por **valor (R$)**, **quantidade (unidades)** ou os dois (o design deixa `secondary_unit` opcional)?
- **Meta anual → mensal**: o dono digita cada mês na mão, ou o sistema distribui a meta anual em 12 e ele ajusta?
- **Caixa**: confirmar que o "atingido" é o **saldo bancário no fim do mês** (o sistema calcula geração e média 3 meses a partir disso).

**Config de IA:** manter o catálogo de modelos (ex.: `grok-4.3`) validado contra a API real do provedor — decidir se some com o modelo inválido ou corrige o id.

**Importação com IA:** quando a empresa não tem IA configurada, preencher por heurística (recomendado) ou desabilitar o botão.

*(Fonte bruta da coleta: `/private/tmp/.../scratchpad/melhorias-oraculo-coleta.md` — sessão. O conteúdo relevante está destilado nestes planos.)*

---

## Prompt para o Codex (Onda 1 primeiro)

```text
Rode git pull --rebase. Leia plans/2026-07-08-pacote-melhorias.md e execute a ONDA 1:
1) plans/2026-07-08-config-ia.md Fatia A (validação ao salvar config de IA — conserta o WhatsApp com Grok e a confirmação de save);
2) plans/2026-07-08-polimento-ui.md P0 (logo/lema);
3) o item D do pacote (remover Analytics da sidebar);
4) plans/2026-07-08-importar-historico-ia.md Fatia 0 (default de período).
Feche com pnpm run lint && pnpm run build e faça deploy das Edge Functions afetadas. NÃO comece a Onda 2 (Dashboard) ainda — ela tem decisões de produto a confirmar.
```

Depois da Onda 1, revisamos juntos as decisões abertas do Dashboard e liberamos a Onda 2.
