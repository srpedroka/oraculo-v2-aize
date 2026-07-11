# Plano de Polimento — Cockpit Oráculo

Resultado de uma auditoria de acabamento em 4 frentes (tipografia-identidade, movimento-transições, micro-interações, ritmo-espaçamento) + síntese. Todos os achados verificados contra o código real (linhas, classes, o clamp `Math.max(188, …)`, sombras hardcoded, ausência de hover/active nos chevrons).

**Lei de design (AGENTS.md), inegociável:** cockpit executivo limpo — branco, cinzas, Inter, bordas discretas, status com cor contida. Nada com cara de landing/marketing. Movimento **sutil e rápido (120–220ms), easing suave, sem bounce, sem cor forte, sem deslocamento chamativo**. `prefers-reduced-motion` já está neutralizado globalmente em `src/index.css:63-72` — todo keyframe/animação novo herda esse guard; onde houver `translate`/`scale` no press, adicionar `motion-reduce:*` explícito.

**Como usar:** os 2 pontos do dono (P0) são autossuficientes e não dependem de token novo — faça-os primeiro. Depois instale os **Tokens de conforto** (Fundação), porque metade dos itens P1/P2 referencia esses tokens.

---

## P0 — Os dois pontos do dono (prioridade ALTA)

Ambos têm a **mesma raiz**: o lema é fisicamente mais largo que o wordmark. Uma correção resolve os dois.

### P0.1 — Lema "Ad astra per aspera" domina o título ORÁCULO
- **Problema:** `tracking-[0.16em]` estica o lema (9px) para ~111.8px de largura, enquanto ORÁCULO (21px, tracking normal) mede ~104.6px; o olho lê dominância pelo comprimento da linha, então o lema "ganha". O tracking exagerado — não o font-size — é o culpado, e é estética de landing.
- **Arquivo:** `src/components/Sidebar.tsx:163` (título) e `:167` (lema)
- **Fix concreto:**
  - Título (`:163`): `text-[22px] font-bold leading-[1.05] tracking-[0.01em] text-text` → ~109.6px.
  - Lema (`:167`): `mt-1 whitespace-nowrap text-[9px] font-normal tracking-[0.08em] text-text-tertiary` → ~98.2px.
  - Resultado: título 109.6px vs lema 98.2px (ratio 0.90) — o título passa a dominar. Baixar o lema de `font-medium` para `font-normal` faz ele recuar ainda mais.

### P0.2 — Wordmark ORÁCULO "deslocado à esquerda / não centralizado"
- **Problema:** não é bug de padding. Wordmark e lema são left-aligned no mesmo eixo dentro de `<div className="min-w-0 overflow-hidden">`; como o lema (111.8px) transborda ~7px à direita do wordmark (104.6px), o título parece "empurrado para a esquerda". Não há offset/indent no código — é 100% diferença de largura.
- **Arquivo:** `src/components/Sidebar.tsx:161-170`
- **Fix concreto:** resolvido pela redução de tracking do P0.1 — ao ficar mais **estreito** que o título, o lema aninha por baixo e o conjunto lê-se como lockup intencional. **NÃO centralizar no eixo da sidebar** (contraria o padrão left-aligned do cockpit). Só se o dono pedir literalmente o wordmark centrado *sobre* o lema: envolver os dois num `inline-block text-center`; mas o recomendado é manter left-aligned garantindo título mais largo que lema.

---

## Fundação — Tokens de conforto (fazer antes dos temas 1–3)

Valores reutilizáveis que eliminam os hexs/durações avulsos. Instalar em `tailwind.config.ts` (`theme.extend`) e `src/index.css`. Depois disso, a maioria dos fixes vira troca de classe.

**Raio** (`extend.borderRadius`) — hoje convivem 5 raios ad-hoc (10/12/16/22/full):
```ts
borderRadius: { control: "10px", card: "16px", overlay: "20px" }
```
Mapear: controles (Button, StatusBadge, inputs do Sidebar, botões de fechar) → `rounded-control`; cards/painéis/popover/org box → `rounded-card`; molduras/overlays → `rounded-overlay`. Unificar inputs do Sidebar (`rounded-xl`→`rounded-control`) e trocar o órfão `rounded-[22px]` (Dashboard) por `rounded-overlay`. (A moldura-telefone `rounded-[34px]` do OraclePanel é mockup de dispositivo — deixar fora da escala.)

**Elevação** (`extend.boxShadow`) — hoje `shadow-card` único + sombras hand-rolled com alpha até 0.25 (forte demais):
```ts
boxShadow: {
  card:    "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
  raised:  "0 2px 4px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.08)",
  overlay: "0 12px 32px rgba(0,0,0,0.12)",
}
```
Hierarquia rest → raised → overlay; alpha máximo cai de 0.25 para 0.12.

**Movimento** — padrão único de conforto (dentro de 120–220ms):
```ts
transitionDuration:      { DEFAULT: "160ms" },
transitionTimingFunction:{ DEFAULT: "cubic-bezier(0.2,0,0,1)",   // ease-out padrão (hover/press)
                           oracle:  "cubic-bezier(0.22,0.61,0.36,1)" }, // entrada de rota (decelerate)
keyframes: {
  "page-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
  "pop-in":  { from: { opacity: "0", transform: "translateY(4px) scale(.98)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
},
animation: {
  "page-in": "page-in 180ms cubic-bezier(0.22,0.61,0.36,1) both",
  "pop-in":  "pop-in 160ms cubic-bezier(0.16,1,0.3,1)",
},
```
Com `DEFAULT` definido, o utilitário cru `transition`/`transition-colors` já sai em **160ms ease-out** — não precisa mais sprinkle de `duration-150`. Tabela de tempos:

| Interação | Duração | Easing |
|---|---|---|
| Entrada de rota | 180ms | oracle (decelerate) |
| Hover/press de controle e nav | 160ms (default) | ease-out |
| Lift de sombra/borda de card | 160ms (default) | ease-out |
| Collapse/expand + width da sidebar | 200ms | ease-out |
| Pop-in de overlay/aviso | 160ms | cubic-bezier(0.16,1,0.3,1) |

**Cores de estado/superfície** (`src/index.css` `:root` + `extend.colors`) — hoje `#F0F0F2 / #ECECEF / #E4E4E8 / #FAFAFB` espalhados como hex:
```css
--surface-muted: #FAFAFB;  --fill-hover: #F0F0F2;  --fill-active: #ECECEF;  --fill-press: #E4E4E8;
```
Expor como `bg-surface-muted`, `bg-fill-hover`, `bg-fill-active`, `bg-fill-press`. Nível: hover < selecionado < press.

**Escala tipográfica** (`extend.fontSize`) — hoje px avulsos (36/34/21/20/18/17/16/15):
```ts
fontSize: {
  metric:     ["34px", { lineHeight: "1" }],
  "title-lg": ["20px", { lineHeight: "1.15" }],
  body:       ["15px", { lineHeight: "1.5" }],
  label:      ["13px", { lineHeight: "1.35" }],
}
```

---

## Tema 1 — Lockup da marca (mesma área do P0) — resolver junto

### 1.1 — Itálico sintético (faux italic) no lema · MÉDIA
- **Problema:** o lema usa `italic`, mas `src/index.css:1-4` só importa Inter upright — o navegador gera um itálico falso por skew, aspecto "barato".
- **Arquivo:** `src/components/Sidebar.tsx:167`
- **Fix:** **remover `italic`** (recomendado — casa com o cockpit). Se o dono prefere o tom clássico latino, importar `@fontsource/inter/400-italic.css` em `index.css` e usar `font-normal italic`. Preferir a remoção.

### 1.2 — Cores do wordmark/lema fora dos tokens · MÉDIA
- **Problema:** título usa `text-[#1D2A31]` (cinza-azulado one-off) e lema `text-[#8C9096]/80`. O header mobile (`Layout.tsx:16`) já usa `text-text` correto — a sidebar destoa com tom azulado.
- **Arquivo:** `src/components/Sidebar.tsx:163` e `:167`
- **Fix:** título → `text-text`; lema → `text-text-tertiary`. (Já embutido nas classes do P0.)

### 1.3 — `leading-none` corta o acento de "Á" · BAIXA
- **Problema:** `line-height:1` deixa o agudo de Á encostado no topo (risco de corte no `overflow-hidden`).
- **Arquivo:** `src/components/Sidebar.tsx:163`
- **Fix:** `leading-[1.05]` no título (já no P0.1).

### 1.4 — Alinhamento frágil do header/toggle (número mágico) · BAIXA
- **Problema:** header usa `items-start + pt-7` e o Button compensa com `mt-[-6px]`; mudar a escala do título desalinha o ícone.
- **Arquivo:** `src/components/Sidebar.tsx:161` e `:178`
- **Fix:** flex previsível: `h-20 px-5 items-center` no header, remover `mt-[-6px]` do Button, lema abaixo dessa linha. Usar `text-title-lg` no wordmark.

### 1.5 — Teto de largura do wordmark no clamp mínimo · BAIXA
- **Problema:** a sidebar redimensiona com mínimo de 188px (`src/state/store.tsx:156`); nesse mínimo o bloco do título tem só ~112px, então ORÁCULO a 23–24px **clipa**. A dominância deve vir do lema encolhendo, não do título crescer.
- **Arquivo:** `src/components/Sidebar.tsx:162-165`
- **Fix:** manter ORÁCULO ≤ ~114px (`text-[22px]` + `tracking-[0.01em]`). Para 23–24px, adicionar `truncate` no div do wordmark ou elevar o clamp mínimo.

---

## Tema 2 — Transições de página e navegação

### 2.1 — Transição de página inexistente (a "secura" ao navegar) · ALTA
- **Problema:** o `<Outlet />` troca a rota instantaneamente, sem fade/slide.
- **Arquivo:** `src/components/Layout.tsx:25-29` + o keyframe `page-in` da Fundação
- **Fix:** keyed-remount por CSS (sem lib). Keyar o wrapper por `location.pathname`:
```tsx
import { Outlet, useLocation } from "react-router-dom";
const location = useLocation();
<main className="min-w-0 flex-1">
  <div key={location.pathname} className="animate-page-in mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <Outlet />
  </div>
</main>
```
Enter-only (180ms decelerate), sem latência de saída. Coberto por reduced-motion.

### 2.2 — NavLink "seco": hover sem timing, ícone pula, sem press · ALTA
- **Problema:** o link usa `transition` cru e o **ícone (`:196`) não tem transition** — a cor do ícone "pula" enquanto o fundo suaviza. Sem feedback de clique.
- **Arquivo:** `src/components/Sidebar.tsx:188-200`
- **Fix:** press por cor (não scale) + sincronizar o ícone:
```tsx
"group flex h-12 items-center gap-3 rounded-control text-body font-medium transition-colors"
// isActive ? "bg-fill-active text-text" : "text-[#2E2E33] hover:bg-fill-hover active:bg-fill-press"
<item.icon className="h-5 w-5 shrink-0 text-text-secondary transition-colors group-hover:text-text" />
```
Aplicar `transition-colors` também nos `inertItems` (`:210`) e no botão de conta (`:261`).

### 2.3 — Resize manual "borrachudo" · MÉDIA
- **Problema:** `transition-[width] duration-200` fica ativo durante o drag, então a barra persegue o cursor com atraso.
- **Arquivo:** `src/components/Sidebar.tsx:158` e `src/components/Layout.tsx:25`
- **Fix:** desligar a transição de width enquanto arrasta (estado `dragging` em `:73`); em `Layout.tsx:25` **remover** `transition-[width] duration-200` do `<main>`.

---

## Tema 3 — Micro-interações de controles

### 3.1 — Button sem feedback de active/pressed (clique seco) · ALTA
- **Arquivo:** `src/components/ui/Button.tsx:35` (base) e `:20-24` (variantes)
- **Fix:** base — trocar `transition` por `transition active:translate-y-px disabled:active:translate-y-0 motion-reduce:transition-none motion-reduce:active:translate-y-0`. Reforçar por variante: primary `active:bg-[#161618]`; ghost `active:bg-surface-muted`; quiet `hover:bg-fill-hover active:bg-fill-press`; size `icon` usar `active:scale-95`.

### 3.2 — Card interativo: lift de landing + shadow pesado · ALTA (4 achados consolidados)
- **Problema:** `hover:-translate-y-0.5` tem leitura de marketing; `hover:shadow-md` é pesado; `transition` anima tudo; falta `cursor-pointer` e reduced-motion.
- **Arquivo:** `src/components/ui/Card.tsx:12`
- **Fix:** **remover o translate** — o respiro vem do aprofundar de sombra/borda:
```tsx
interactive ? "cursor-pointer transition-[box-shadow,border-color] hover:border-accent/30 hover:shadow-raised motion-reduce:transition-none" : ""
```

### 3.3 — focus-visible sem halo · MÉDIA
- **Arquivo:** `src/index.css:50-57`
- **Fix:** manter o outline e adicionar halo tênue: `box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);`

### 3.4 — Estado loading real no Button · MÉDIA
- **Arquivo:** `src/components/ui/Button.tsx:31-45`; uso em `Sidebar.tsx:341-343`
- **Fix:** prop `loading?: boolean` → `<Loader2 aria-hidden className="h-4 w-4 animate-spin" />`, `disabled={disabled||loading}`, `aria-busy`. Manter texto "Salvando..." (reduced-motion congela o spin).

### 3.5 — Chevrons de collapse/expand e botão de conta sem feedback · BAIXA
- **Arquivo:** `src/components/Sidebar.tsx:363-382` e `:253-263`
- **Fix:** chevrons → `transition hover:bg-fill-hover hover:text-text active:scale-95 motion-reduce:transition-none`. Botão de conta → `active:bg-fill-hover`.

### 3.6 — Popover de Conta e aviso "Conta salva." abruptos · BAIXA
- **Arquivo:** `src/components/Sidebar.tsx:277-283` e `:332`
- **Fix:** `animate-pop-in` (fade + 4px + scale, 160ms).

### 3.7 — `::selection` azul fora da paleta · BAIXA
- **Arquivo:** `src/index.css:59-61`
- **Fix:** `background: rgba(29,29,31,0.10);`

### 3.8 — (Opcional) Barra de acento na nav ativa · BAIXA
- Barra de 2px à esquerda por opacidade, `bg-text-secondary`, sem cor forte, sem layout shift. Enfeite mínimo, não obrigatório.

---

## Tema 4 — Ritmo, espaçamento e camadas

### 4.1 — Card-in-card no bloco Resultado (borda dentro de borda) · MÉDIA
- **Problema:** moldura `rounded-[22px] border shadow-card` (`Dashboard.tsx:109`) envolve dois `Card` `shadow-card` → borda dentro de borda, sombra dupla, raios concêntricos quase iguais.
- **Fix:** uma camada por agrupamento — remover `border`+`shadow` do wrapper (agrupador transparente com grid+gap). Se mantiver a moldura, tirar sombra dos Cards internos e corrigir concentricidade (externo = interno + padding ≈ 28px, usar `rounded-overlay`).

### 4.2 — Métricas com tamanhos divergentes · MÉDIA
- **Problema:** Resultado 36px vs Evolução 34px; rótulos 16/17px.
- **Arquivo:** `Dashboard.tsx:115,144,181,217`
- **Fix:** `text-metric` (34px) em todos os números grandes; rótulo num tamanho único.

### 4.3 — Passo de espaçamento ímpar (28px) · BAIXA
- **Fix:** normalizar em 8px — seções `space-y-8`/`space-y-6`; grids de cards `gap-4` em vez de `gap-3`.

### 4.4 — Padding vertical não responsivo · BAIXA
- **Arquivo:** `Layout.tsx:26`
- **Fix:** `px-4 py-6 sm:px-6 sm:py-8 lg:px-8` (já no snippet do 2.1).

---

## Ordem de execução sugerida

1. **P0.1 + P0.2** (os dois pontos do dono — só `Sidebar.tsx:163/167`, entrega imediata e visível).
2. **Fundação — Tokens de conforto** (`tailwind.config.ts` + `index.css`): raio, sombra, motion default, cores de estado, escala tipográfica.
3. **Alta:** 2.1 transição de página · 2.2 NavLink · 3.1 Button press · 3.2 Card.
4. **Média:** 1.1 · 1.2 · 2.3 · 3.3 · 3.4 · 4.1 · 4.2.
5. **Baixa:** 1.3–1.5, 3.5–3.8, 4.3–4.4.
6. Fechar com `pnpm run lint` e `pnpm run build`.

**Nota de escopo:** a moldura-telefone do OraclePanel (`:550`) e a aba WhatsApp (`:532`) são mockup de dispositivo com identidade própria (verde WhatsApp) — ficam fora da escala de raio/sombra do cockpit.
