# Plano: Navegação e clareza (Configurações + varredura Apple/Tesla)

**Parte 1** resolve o menu da página de Configurações (o pedido original). **Parte 2** é a varredura de clareza das demais páginas — só o que sobrou depois de uma auditoria cética com a régua "simplicidade vale ouro, Apple/Tesla, não criar monstrinho". As duas são independentes e frontend-only.

---

## Parte 1 · Menu da página de Configurações

A página `/configuracoes` (`src/pages/Settings.tsx`, ~1310 linhas) é um empilhamento vertical de 8 blocos. Para chegar em WhatsApp, Backups ou Zona de perigo é preciso rolar muito — e o bloco de **IA do Oráculo sozinho tem ~250 linhas**. Objetivo: um menu com atalho para pular direto ao bloco desejado, sem rolar.

## Opções pesquisadas (referências reais)

| Modelo | Quem usa | Prós | Contras |
|---|---|---|---|
| **Rail vertical + sub-rotas** | Stripe, GitHub, Linear, Vercel | Padrão de facto; URL por seção; code-split | **2ª sidebar** (o app já tem uma); maior refactor (elevar estado) |
| **Scroll-spy (âncoras)** | Notion, docs longas | Esforço mínimo; mantém markup | **Não elimina o scroll**; o bloco de IA continua rolando |
| **Abas in-page (1 seção por vez)** | Stripe/Vercel/GitHub (sub-nav interna) | **Mata o scroll**; diff mínimo; reversível; sem 2ª sidebar | Sem URL por seção (resolvido com hash) |
| Abas horizontais clássicas | Linear (telas pequenas) | Familiar | NN/g: só 3-6 abas — 8 estoura |

## Decisão

**Abas de seção in-page** (renderiza **uma** seção por vez via estado), com um **menu horizontal de pills/segmented sob o título** — dentro da coluna de conteúdo, **nunca** um rail vertical à esquerda (evita a sensação de duas sidebars, já que a principal é `src/components/Sidebar.tsx`). Deep-link por `#hash`, menu filtrado por papel, e **sub-abas internas** só no bloco gigante de IA.

Por quê, e não os outros: a dor é literal ("ficar rodando"). Só renderizar uma seção por vez elimina o scroll. Scroll-spy apenas acelera o rolar e deixa a IA gigante rolando dentro dela. Sub-rotas são o ideal de longo prazo, mas exigem quebrar o componente de 1310 linhas e **elevar o estado compartilhado** (dezenas de `useState` + o `state`/dispatch) — refactor grande e arriscado agora. As abas entregam o mesmo "uma seção por vez" **envolvendo os blocos existentes** em `{active === 'ia' && (…)}`, e deixam o caminho aberto para promover a sub-rotas depois, uma por vez.

**Vantagem colateral:** como o componente não desmonta ao trocar de aba, **rascunhos digitados não se perdem** (diferente de sub-rotas).

## Modelo de seções

Ordem e visibilidade (papel):

| id | Rótulo | Âncora atual | Papel |
|---|---|---|---|
| `empresa` | Empresa ativa | h2 ~578 | owner |
| `areas` | Áreas | ~632 | owner |
| `pessoas` | Pessoas | ~715 | owner |
| `ia` | IA do Oráculo | ~817–1064 | owner · **sub-abas** |
| `whatsapp` | WhatsApp | ~1069 | owner |
| `backups` | Backups | `OrganizationBackupCard` ~1143 | owner |
| `tom` | Tom do Oráculo | ~1152 | **todos** |
| `perigo` | Zona de perigo | `CompanyDangerZone` ~1275 | **todos** |

O array de seções é a **fonte única**: dirige o menu e a renderização. Filtrar por `isOwner` (linha ~209) **antes** de renderizar. Owner vê as 8; não-owner vê só `tom` + `perigo`. Com o menu já filtrado, **remover o card "Administração restrita ao dono"** (~558–569) — vira redundante.

## Implementação (ondas pequenas e seguras)

### Onda 1 — Abas in-page (refactor puro, zero mudança de comportamento)
- `const SECTIONS = [{ id, label, ownerOnly }]` no topo do componente; `visibleSections = SECTIONS.filter(s => isOwner || !s.ownerOnly)`.
- `const [active, setActive] = useState<SectionId>(...)` com **default por papel** (owner → `empresa`; não-owner → `tom`). Garantir que `active` sempre pertence a `visibleSections`.
- **Menu:** faixa horizontal de pills sob o `<h1>` (~551), `role="tablist"`, cada pill um `role="tab"` com `aria-selected`/`aria-current`. No mobile, `overflow-x-auto` + `snap-x` (a faixa já sinaliza que há mais). Reusar tokens existentes (`rounded-control`, `bg-fill-active`, `text-text`).
- **Conteúdo:** envolver cada `<Card>`/bloco existente em `{active === 'id' && ( … )}`. **Não alterar o JSX interno dos blocos** — só embrulhar. O bloco owner-only já está delimitado (`{!isOwner ? null : (` ~572 … `)}` ~1145); a filtragem por papel reaproveita isso.
- Remover o card de restrição (~558–569).
- Critério: pill troca a seção sem rolar; papel certo vê as abas certas; nada da lógica dos blocos muda. **Deploy.**

### Onda 2 — Deep-link por hash
- `useEffect` lê `location.hash` no mount (após um `requestAnimationFrame`) e seta `active`; ao trocar de aba, `history.replaceState(null, "", '#id')` (não empilha histórico).
- `/configuracoes#backups` abre direto no bloco; o "voltar" do navegador se comporta. É a ponte natural para sub-rotas reais depois.

### Onda 3 — Sub-abas internas da IA
- O bloco `ia` (~817–1064) é o único que ainda rola. Dividir em: **Provedores/Chaves** · **Funções (modelos)** · **Histórico** (a lista de logs ~1051), com um segundo nível de pills interno. Isolado a esse bloco.

### Onda 4 — (opcional/futuro) Sub-rotas reais
- Quando alguma seção crescer, promover a aba-hash a `<Route>` aninhada (`<Outlet>` do React Router), **uma por vez**. O embrulho da Onda 1 já deixou cada bloco extraível.

## Acessibilidade e responsivo (da pesquisa)
- `aria-current="location"` (não `"page"`) no pill ativo; padrão `role="tablist"/"tab"/"tabpanel"` com `aria-selected`.
- Ao trocar de aba, **focar** o painel (`tabIndex={-1}` + `.focus({ preventScroll: true })`) para o teclado/leitor caírem na seção.
- `prefers-reduced-motion`/`motion-reduce` em qualquer transição.
- Mobile: pills com scroll-x + snap; **nada sticky vertical** (evita 2ª sidebar).

## Riscos e cuidados
- **Default por papel:** coordenador/admin não pode cair numa aba vazia — default em `tom`.
- **Preservar o JSX dos blocos:** a Onda 1 só embrulha; qualquer edição interna vira bug de regressão. Diffs pequenos, um bloco por vez.
- **`active` sempre válido:** ao trocar de empresa/papel, recomputar o default se o `active` sumir da lista visível.
- **Só frontend:** sem migration, sem Edge Function, sem tocar em store. Deploy é só Netlify.

## Não entra
- Busca/⌘K dentro de settings (complemento futuro, não estrutura).
- Rail vertical fixo (colide com a sidebar principal).
- Reescrever a lógica dos blocos (só reorganiza a navegação).

---

## Parte 2 · Varredura de clareza (Apple/Tesla) nas demais páginas

Auditoria cética de todas as páginas com a régua "só mexer se ajudar de verdade". A maioria passou **intacta** (ver "O que NÃO mexer"). Sobraram apenas **remoções de ruído/jargão e um CTA** — zero feature nova. Cada item é 1-2 linhas, todo frontend, agrupável numa única onda de polimento.

### Correções que valem (todas mínimas)

| # | Onde | Mudança | Por que ajuda |
|---|---|---|---|
| 1 | Dashboard (`Dashboard.tsx` título Evolução + `KpiResultBlock.tsx` título Resultado) | Remover "(Jogo Atual)" e "(Próximo Jogo)" | Metáfora interna que o CEO não decodifica; os subtítulos já explicam. Ruído. |
| 2 | Dashboard empty state ("A empresa está pronta para começar…") | Adicionar botão **"Criar Plano Estratégico"** (Link `/estrategico`) | Hoje a 1ª tela descreve o passo mas não deixa dá-lo — beco sem saída. Fecha o loop (espelha o empty state de Evolução, que já faz certo). |
| 3 | KPI vazio (`KpiResultBlock.tsx`) | Trocar "quando a **migration** é aplicada" por "aparecem automaticamente" | "Migration" é palavra de dev vazando pro dono. |
| 4 | Estratégico (`Strategic.tsx` header, ~414-427) | Apagar os 2 botões-atalho do header ("Importar plano pronto", "Importar histórico") | Duplicam a tab bar logo abaixo — dois caminhos pro mesmo lugar. Uma fonte de verdade. |
| 5 | Estratégico (`Strategic.tsx` ~536,541) | "carregar no **módulo**" → "Enviar ao Oráculo" / "grava no seu plano" | Jargão de dev. |
| 6 | Áreas (`Areas.tsx` card, ~239-245) | Remover o CTA **"Ver trimestral"** do card (deixar só "Abrir área") | Joga o usuário pra fora do contexto da área e duplica a aba Trimestral do detalhe. Um card, uma ação. |
| 7 | Documentos (`Documents.tsx` ~140-147 + estado) | Remover o filtro **"Origem"** (Sessão/Histórico) | Jargão + redundante (a origem já aparece em cada card). 4 filtros → 3. |
| 8 | Sidebar (`Sidebar.tsx:33`) | **"Execução Viva" → "Execução"** | Único rótulo de marketing; ícone + subtítulo já entregam. Alinha os 8 itens no mesmo padrão de substantivo seco. |
| 9 | Auth (`Auth.tsx:~28`) | Tirar **"Supabase"** do texto → "Se pedirmos confirmação por email, confirme e entre novamente." | Jargão técnico na 1ª (e mais sensível) tela. |
| 10 *(opcional, baixa prio)* | Sidebar (`Sidebar.tsx:34`) | "Arquivo" → "Arquivo operacional" (= H1) | Distancia de "Documentos" no menu; leve. |

### O que NÃO mexer (a régua funcionou — isto é feature, não bug)
- **Ordem e estrutura do menu principal** — a cascata Dashboard → Estratégico → Trimestrais → Áreas → Execução → Arquivo → Config é natural.
- **Execução e Arquivo como itens separados** — padrão "retira no lugar / restaura na lixeira"; enterrar o Arquivo esconderia a rede de segurança (o macOS mantém a Lixeira à vista pelo mesmo motivo). O próprio diálogo já diz "pode ser restaurado pelo Arquivo".
- **Planos Trimestrais** — enxuto; o plano mensal vive dentro da área (correto). Não criar item "Planos Mensais" no menu.
- **Onboarding** — conduz em prosa; um wizard aqui seria "monstrinho".
- **OraclePanel** (metáfora WhatsApp) — acerto, zero aprendizado.
- **Documentos** — 2 painéis, default no documento mais recente, export óbvio; **não** adicionar busca.
- **Áreas** — 1 nível só; "← Áreas" já resolve a volta; não forçar card-clicável nem breadcrumb.

### Fatiamento
- **Onda P · Polimento de clareza:** as 9 correções da tabela (#10 opcional). Tudo remoção/troca de texto + 1 botão. Uma passada, frontend, deploy Netlify. Risco ~zero, ganho imediato.

### Ordem sugerida do pacote completo
**Onda P** (clareza, risco ~zero) → **Onda 1** (abas de Configurações) → **Onda 2** (deep-link `#hash`) → **Onda 3** (sub-abas da IA). A Onda 4 (sub-rotas reais) fica para quando/se alguma seção crescer.
