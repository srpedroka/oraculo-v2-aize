# Design System do Oraculo

Status: **UX-P1, UX-P2, UX-C0 E UX-C1 APROVADOS; UX-C2 EM REVISAO**

Aplicacao UX-C0: os tokens e as primitivas `Button`, `Card`, `StatusBadge` e
`Field` foram aprovados no draft da branch local `codex/ux-c0-foundation`.
Acesso, recuperacao de senha e onboarding ja consomem o controle visual comum.
Producao permanece inalterada, e as proximas mudancas de fluxo seguem para
UX-C2 a UX-C4.

Aplicacao UX-C1: `InlineFeedback` e o contrato de erro recuperavel foram
aplicados aos fluxos criticos no draft da branch local
`codex/ux-c1-feedback-recovery`. O owner aprovou o gate em 2026-07-19; o aceite
nao autoriza producao, que permanece em gate separado.

Aplicacao UX-C2: hierarquia, microcopy, navegacao agrupada, abas acessiveis,
status semanticos e listas mais compactas foram aplicados ao caminho critico do
gestor. O draft esta validado tecnicamente; o aceite do owner e a publicacao em
producao continuam como gates separados.

Fontes de decisao:

- `plans/ddr/UX-P1-design-system.md` - aprovada;
- `plans/ddr/UX-P2-interacao-ia.md` - aprovada para aplicacao futura em UX-C3.

## 1. Principios

1. Cockpit executivo, nao pagina de marketing.
2. Mesmo usuario, mesmas tarefas, menos esforco.
3. Uma acao primaria por contexto.
4. Cor de saude somente quando existe avaliacao real.
5. Resumo antes do detalhe.
6. Borda antes de sombra.
7. Card somente para item repetido ou ferramenta delimitada.
8. Nenhum card dentro de card.
9. Erro humano visivel; detalhe tecnico recolhido.
10. Desktop e mobile sao o mesmo produto.

## 2. Tokens propostos

### Cores

```css
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-muted: #fafafb;
  --surface-subtle: #f7f7f8;

  --fill-hover: #f0f0f2;
  --fill-active: #ececef;
  --fill-press: #e4e4e8;

  --border-subtle: #e8e8ed;
  --border-control: #8e8e93;

  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #737378;
  --text-disabled: #a1a1a6;

  --accent: #2e2e33;
  --focus: #2e2e33;

  --status-success: #1d7a3e;
  --status-success-bg: #e6f4ea;
  --status-warning: #8a5a0a;
  --status-warning-bg: #fdf1dd;
  --status-danger: #b42318;
  --status-danger-bg: #fbe9e7;
  --status-neutral: #5f6368;
  --status-neutral-bg: #eef1f4;
  --status-info: #245d85;
  --status-info-bg: #eef6fc;
}
```

Regras:

- `text-tertiary` pode ser texto normal; `text-disabled` nao;
- `border-control` e para limites essenciais de campos/controles;
- `border-subtle` e para separacao estrutural nao essencial;
- status sempre combina cor + texto, nunca apenas cor;
- `Sem dados`, `Sem prazo`, `A fechar` e `Sem avaliacao` sao neutros.

### Contraste verificado

| Token | Fundo | Razao |
| --- | --- | ---: |
| `text` | branco | 16,83:1 |
| `text-secondary` | branco | 5,07:1 |
| `text-tertiary` proposto | branco | 4,72:1 |
| `status-success` | fundo success | 4,73:1 |
| `status-warning` proposto | fundo warning | 5,30:1 |
| `status-danger` | fundo danger | 5,61:1 |
| `status-neutral` | fundo neutral | 5,34:1 |
| `border-control` | branco | 3,26:1 |

### Tipografia

| Uso | Tamanho / linha | Peso |
| --- | --- | ---: |
| Titulo de pagina | 24 / 32 px | 600 |
| Titulo de secao | 18 / 26 px | 600 |
| Titulo de item | 15 / 22 px | 600 |
| Corpo | 15 / 23 px | 400 |
| Corpo compacto | 14 / 20 px | 400 ou 500 |
| Rotulo/caption | 12 / 18 px | 500 |
| Metrica | 32 / 36 px | 600 |

- familia: Inter com fallbacks do sistema;
- numerais: tabulares;
- letter spacing: 0;
- font size nao escala com largura do viewport.

### Espacamento

Escala unica: `4, 8, 12, 16, 20, 24, 32, 40, 48` px.

- gutter mobile: 16 px;
- gutter tablet: 24 px;
- gutter desktop: 32 px;
- gap entre secoes: 24 ou 32 px;
- gap entre itens do mesmo grupo: 8 ou 12 px.

### Raios

```text
small: 4px
control: 6px
card: 8px
overlay: 8px
full: apenas badge, avatar, toggle e progresso
```

### Sombras

```text
card: none por padrao
raised: 0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)
overlay: 0 16px 40px rgba(0,0,0,.14)
```

### Motion

```text
controle: 120ms
estado/layout pequeno: 180ms
painel/modal: 220ms
easing: cubic-bezier(.2, 0, 0, 1)
deslocamento maximo: 2px
```

`prefers-reduced-motion` remove movimento nao essencial.

## 3. Componentes

### Button

Variantes:

- `primary`: comando principal;
- `secondary`: alternativa visivel;
- `quiet`: ferramenta de baixa enfase;
- `danger`: confirmacao destrutiva.

Tamanhos:

- desktop: 40 px;
- mobile critico: 44 px;
- icone: 40 x 40 desktop, 44 x 44 mobile.

Regras:

- um primary por contexto;
- icone conhecido para ferramenta; texto para comando;
- icon-only exige tooltip e `aria-label`;
- loading nao altera largura;
- disabled informa a pre-condicao perto do controle.

### Card

- raio 8 px;
- borda sutil;
- sem sombra padrao;
- padding 16 ou 20 px;
- apenas item repetido, modal ou ferramenta delimitada;
- nunca usar como moldura de uma secao inteira;
- nunca aninhar cards.

### Status

| Estado | Rotulo padrao | Cor |
| --- | --- | --- |
| healthy | No prazo / Saudavel | success |
| attention | Em risco / Atencao | warning |
| critical | Atrasado / Critico | danger |
| done | Concluido | neutral forte |
| unset | Sem avaliacao / Sem prazo | neutral |

Status verde exige dado real. Ausencia nao e sucesso.

### Field

Estrutura:

```text
Label
[controle]
Hint ou erro
```

- altura 40 px desktop e 44 px mobile critico;
- label sempre visivel;
- placeholder e exemplo, nao rotulo;
- erro ligado por `aria-describedby`;
- foco com contorno continuo de 2 px;
- input, select e textarea compartilham estados.

### Dialog

Estrutura:

```text
Header: contexto + titulo + fechar
Body: min-h-0 + overflow-y-auto
Footer: cancelar + acao principal
```

- altura maxima 92dvh;
- corpo nunca fica por baixo do footer;
- `Tab` fica contido;
- `Escape` fecha quando seguro;
- foco volta ao disparador;
- no mobile, footer empilha sem encobrir campo;
- acao destrutiva recebe confirmacao e foco inicial seguro.

### Tabs e segmented control

- tabs trocam secoes;
- segmented control troca modo da mesma superficie;
- ativo usa contraste e indicador;
- mais de cinco tabs no mobile precisam de indice/menu ou pista de continuidade;
- foco e setas seguem o padrao WAI-ARIA.

### Lista e tabela

- lista para operacao repetida;
- tabela somente para comparar colunas;
- linha minima 44 px;
- acao frequente visivel;
- acoes secundarias em menu;
- destrutiva separada;
- no mobile, cada valor conserva seu rotulo.

### Inline feedback

Estados: loading, success, warning, error e retrying.

- resposta visual em ate um segundo;
- erro diz o que ocorreu e o que fazer;
- retry preserva o rascunho;
- codigo tecnico fica recolhido;
- success aponta o resultado ou documento.

Contrato aplicado na UX-C1:

- loading e retry nao mudam a largura do comando;
- falha preserva o valor digitado, o arquivo em memoria ou a proposta;
- retry reutiliza o payload que falhou e nao cria uma acao diferente;
- erro importante usa `role=alert`; loading e sucesso usam `role=status`;
- detalhe recolhido exibe apenas `Codigo da ocorrencia: ORC-...`;
- URL, Function, API, JSON, stack, provider e mensagem bruta nao aparecem na
  interface;
- a telemetria recebe somente a ocorrencia sanitizada pelo caminho existente;
- acoes irreversiveis ou confirmacoes permanecem bloqueadas durante o envio;
- a recuperacao volta a ficar disponivel assim que a tentativa termina.

## 4. Padroes de pagina

- titulo literal da tarefa;
- contexto secundario em uma linha curta;
- comando principal no cabecalho quando aplicavel;
- secoes sem moldura de card;
- cards apenas para itens repetidos;
- vazio contem uma explicacao curta e um unico proximo comando;
- resumo antes de listas longas;
- filtros proximos da lista que alteram;
- nenhuma largura fixa pode gerar overflow em 320 px.

## 5. Acessibilidade minima

- texto normal: 4,5:1;
- texto grande e limite visual essencial: 3:1;
- foco visivel com contorno equivalente a 2 px;
- foco nunca encoberto por footer, header ou teclado;
- alvo de toque 44 px no caminho critico mobile;
- controles tem nome, papel e estado;
- dialogo prende e devolve foco;
- teclado executa toda tarefa critica;
- cor nao e o unico sinal;
- motion reduzido e respeitado.

## 6. Sequencia de aplicacao

1. UX-C0: tokens, Button, Card, Status, Field e aliases.
2. UX-C1: Dialog e InlineFeedback nos fluxos criticos.
3. UX-C2: tabs, listas, hierarquia e estados neutros.
4. UX-C3: proposta e confirmacao da IA com os mesmos componentes.
5. UX-C4: mobile, foco, teclado e regressao visual completa.

Nenhum valor entra no runtime antes do briefing e da autorizacao especifica de
UX-C0. A aprovacao deste documento define a direcao, nao autoriza um deploy.

## 7. Interacao com a IA

Este anexo materializa a UX-P2 aprovada. Ele orienta a futura UX-C3, mas nao
autoriza por si so alterar `OraclePanel`, prompts, sessoes ou WhatsApp.

### Principios

1. O contexto da conducao permanece visivel: ritual, empresa, area, periodo e
   ano.
2. Conversa registra o caminho; proposta concentra a decisao.
3. Toda acao mostra pensando, gravando, sucesso ou erro em ate um segundo.
4. Uma proposta recebe uma confirmacao primaria.
5. Ajuste e retry preservam o trabalho; descarte declara que nada foi gravado.
6. App e WhatsApp compartilham fatos e regra, com apresentacoes naturais para
   cada canal.

### Estados

```text
disponivel
enviando / pensando
resposta recebida
proposta pendente
ajustando
gravando
sucesso
erro recuperavel
sessao retomada
novo episodio com contexto preservado
proposta descartada
```

- `pensando`, `gravando` e `sucesso` usam `role=status`;
- erro importante usa `role=alert`, sem mover foco;
- detalhe tecnico permanece recolhido;
- rascunho e proposta nao somem antes da resposta do servidor.

### Contexto da IA

```text
Plano Trimestral
Gaam/Aize · Comercial · T3 2026
Objetivos do trimestre · etapa 4 de 7
```

- sem area: usar `Empresa inteira`;
- nunca mostrar enums internos;
- proposta repete o contexto;
- proposta de outro contexto nao substitui silenciosamente a atual.

### Proposta

Estrutura comum:

```text
Pronto para conferir
Ritual · area · periodo
[previa estruturada]

Confirmar e gravar
Ajustar              Descartar proposta
```

- shell unico para anual, trimestral, mensal, fechamento mensal, fechamento
  trimestral e revisao;
- revisao separa `Vai mudar`, `Permanece igual` e `Antes / Depois / Motivo`;
- primary unico: `Confirmar e gravar`;
- sucesso mostra o que foi salvo e `Abrir documento`;
- erro preserva a proposta e oferece `Tentar novamente`.

### Conversa e anexos

- texto admite somente negrito, listas e quebras seguras;
- HTML bruto nao e aceito;
- arquivo importado vira recibo compacto expansivel;
- atalhos gerais nao aparecem durante conducao ou proposta;
- resposta nova e anunciada sem tomar o foco;
- rolagem automatica ocorre somente quando o usuario estava no fim.

### WhatsApp

- proposta final com ritual, area e periodo;
- `Responda confirmar para gravar`;
- `Responda ajustar e diga o ponto`;
- nunca expor `API`, `modulo`, rota, HTTP, provider, enum ou estado interno;
- falha no envio do PDF nao invalida o plano salvo;
- nao pedir nova confirmacao depois de uma confirmacao aceita.
