# Painel de progresso do plano geral do Oraculo

Data-base: 2026-07-24

Status: **ATIVO - fonte oficial das porcentagens**

Conteudo e ordem: `plans/2026-07-19-plano-mestre-evolucao-integrado.md`.

Este painel separa o programa em oito planos especificos. Os pesos representam
valor de marco para o produto, nao horas trabalhadas, quantidade de commits ou
custo. A soma dos oito pesos e 100 pontos.

## 1. Progresso atual

**Plano geral: 52,5%**

**Plano especifico atual: Plano 4 - Revisao Semestral Estrategica: 50,0%**

**Proxima acao: aplicar a revisao real ao Plano 2026 e aprovar o resultado**

**Subplano corretivo Equilibrio da IA: 90% (nao altera a porcentagem geral)**

A F1 foi aceita para continuidade com 20% internos; a qualidade global sera
avaliada na conversa pratica. A F2 trocou seis falas prontas por situacoes
seguras, preservando estrutura e gravacao server-side. Seu gate final passou no
staging com 574 unitarios, 31 arquivos de integracao e piloto de media 92,50.
As tres medicoes F2 custaram US$ 0,115403. A F3 separou estilo de defeitos de
dado e, na mesma baseline Q4W, reduziu chamadas de 5 para 3, reparos de estilo
de 2 para 0 e custo de geracao em cerca de 40%, mantendo nota final 95. Seu
custo total foi US$ 0,078225. A F4 separou prosa `planning` de estrutura
`background`, adicionou flag default off e protegeu turnos concorrentes. A
rodada geral passou com fechamento em media 92,50; custo F4 US$ 0,211855 e
consumo estimado do ciclo US$ 0,410834. Cleanup concluido. F1-F4 foram
publicadas em producao pela PR #21 e complementadas pela PR #25; a migration e
as seis Functions passaram nos releases protegidos `29965389449` e
`29965501405`. Em 2026-07-23, depois de backup externo verificado, o owner
autorizou o rollout integral e a flag foi ligada na unica empresa real
acessivel, Gaam/Aize, para app e WhatsApp. Planning, background e saude do
WhatsApp foram validados; a sessao real em andamento ficou intacta. Evidencias:
`plans/ddr/Equilibrio-IA-F1-staging.md` e
`plans/ddr/Equilibrio-IA-F2-staging.md` e
`plans/ddr/Equilibrio-IA-F3-staging.md` e
`plans/ddr/Equilibrio-IA-F4-staging.md` e
`plans/ddr/Equilibrio-IA-F4-producao.md`.

**Marco de operacao assistida: 95% do plano geral**

Os 5% finais pertencem ao Plano 8, de evolucoes futuras por evidencia. Assim,
o produto pode entrar em operacao assistida com 95% sem fingir que o backlog de
longo prazo foi executado. O roadmap integral chega a 100% apenas se as doze EVs
forem justificadas e concluidas; EV sem gatilho pode continuar congelada.

UX-P0 foi aprovada pelo owner em 2026-07-19:

- Plano 2 passa de 0% para 40%;
- plano geral passa de 25% para 29%;
- o DDR aprovado esta em `plans/ddr/UX-P0-auditoria-friccao.md`.

Ao aprovar UX-P1:

- Plano 2 passa de 40% para 70%;
- plano geral passa de 29% para 32%;
- o DDR e o Design System foram aprovados pelo owner em 2026-07-19.

UX-P2 foi aprovada pelo owner em 2026-07-19:

- Plano 2 passa de 70% para 100%;
- plano geral passa de 32% para 35%;
- o contrato aprovado esta em `plans/ddr/UX-P2-interacao-ia.md`.

UX-C0 foi executada e aprovada pelo owner em 2026-07-19:

- draft: `https://6a5d183bbe39944dbe344cf4--oraculo-v2-aize.netlify.app`;
- 528 unitarios, lint, build, bundle e `verify:deploy` verdes;
- desktop e celular sem overflow, foco visivel e zero alteracao de producao;
- Plano 3 passa de 0% para 20% e o geral de 35% para 37%;
- producao permanece inalterada ate um gate de release separado.

UX-C1 foi executada em draft, aprovada e publicada em producao:

- evidencia: `plans/ddr/UX-C1-feedback-recuperacao.md`;
- draft: `https://6a5d5646cfcba581e404012f--oraculo-v2-aize.netlify.app`;
- 535 unitarios, 132 integracoes, lint, build, bundle, secret scan e
  `verify:deploy` verdes;
- feedback, preservacao de rascunho, retry e clique duplicado cobertos;
- zero IA paga, migration, Function ou alteracao de backend;
- Plano 3 passa de 20% para 40% e o geral de 37% para 39%;
- release autorizado pelo owner e concluido em 2026-07-20 pela PR #15;
- CI #101 (`29730862290`) passou qualidade, integracao local e `CI required`;
- merge `330190a` e deploy Netlify `6a5de9e76733af06c6887d56` publicados;
- `production:verify` confirmou 31 Functions, 54/54 migrations, HTTP 200,
  headers, cache e segredos fora do Git;
- smoke publico desktop/mobile e smoke autenticado de Dashboard, Oraculo,
  Documentos, Planos Trimestrais e Configuracoes ficaram verdes;
- custo de IA/API: US$ 0.

UX-C2 foi executada no draft e aprovada pelo owner em 2026-07-20:

- evidencia: `plans/ddr/UX-C2-caminho-gestor.md`;
- draft: `https://6a5dfa113c90387d0905fc6e--oraculo-v2-aize.netlify.app`;
- 541 unitarios, lint, build, bundle, secret scan e verificacao do deploy verdes;
- jornada autenticada e smoke publico desktop/mobile aprovados;
- zero backend, dado, WhatsApp, migration ou IA paga;
- Plano 3 passa de 40% para 60% e o geral de 39% para 41%;
- producao continua inalterada e exige autorizacao separada.

UX-C3 foi executada no draft/staging e aprovada pelo owner em 2026-07-20:

- evidencia: `plans/ddr/UX-C3-proposta-confirmacao.md`;
- draft: `https://6a5e2b72df0f2fded70554e3--oraculo-v2-aize.netlify.app`;
- contexto e proposta cobrem os seis rituais existentes;
- uma confirmacao primaria, ajuste, descarte e sucesso com documento;
- repeticao pelo app ou WhatsApp devolve o mesmo documento sem duplicar dados;
- 554 unitarios, 132 integracoes aprovadas, 2 skips opt-in esperados e jornada
  autenticada desktop/mobile verde;
- verificacao estrutural e smoke publico desktop/mobile do draft verdes;
- zero migration, IA paga ou alteracao de producao;
- Plano 3 passa de 60% para 80% e o geral de 41% para 43%;
- producao continua inalterada e exige autorizacao separada.

UX-C4 foi executada no draft e aprovada pelo owner em 2026-07-20:

- evidencia: `plans/ddr/UX-C4-mobile-acessibilidade.md`;
- draft: `https://6a5e39c470f0f2420ba96122--oraculo-v2-aize.netlify.app`;
- foco, `Esc`, retorno ao acionador, dialogs aninhados, `dvh`, safe area,
  contraste AA e alvos de toque cobertos;
- 556 unitarios, 132 integracoes aprovadas, 2 skips opt-in esperados, 6 E2E
  autenticados e 2 smokes publicos verdes;
- desktop 1280x720, celulares 390x844/430x932 e teclado em 430x520 validados;
- zero backend, migration, dado de producao, WhatsApp ou IA paga;
- Plano 3 passa de 80% para 100% e o geral de 43% para 45%;
- producao continua inalterada e exige autorizacao separada.

R1A foi implementada, validada no staging e aprovada em 2026-07-20:

- a IA interpreta o turno; guias passaram a ser referencia interna e o servidor
  continua autoridade para escopo, proposta, confirmacao e gravacao;
- `strategic_review` agrega o primeiro semestre e gera um pacote canonico com
  Revisao Semestral e Plano do Segundo Semestre;
- plano anual original e preservado, salvo ajuste explicito na unica proposta
  confirmada; retry nao duplica documento nem mutacao;
- 563 unitarios, 31 arquivos de integracao, 7 testes de seguranca e 11 E2E
  desktop/mobile verdes, alem de lint, build, bundle e secret scan;
- teste pago opt-in foi pulado sem custo porque a chave temporaria nao estava no
  ambiente; o owner decidiu fazer a prova qualitativa na R1B real em producao;
- release conjunto de UX-C2/C3/C4 e R1A concluido: PR #16, merge `688707b`,
  Actions `29771409862` e Netlify `6a5e7543f33863cd34980d37`;
- verificacao de producao verde com 31 Functions, 54/54 migrations, HTTP 200,
  headers/cache e smoke publico desktop/mobile;
- Plano 4 passa de 0% para 50% e o geral de 45% para 52,5%.

Antes da R1B, o owner aprovou em 2026-07-22 o subplano corretivo
`plans/2026-07-22-equilibrio-da-ia.md`:

- F1-F4 separam fala natural de gravacao segura e serao executadas uma por vez;
- F5 fica depois do piloto e do periodo de observacao;
- o subplano tem acompanhamento interno proprio e esta em 90% depois dos gates
  F1, F2, F3 e F4 no staging;
- por ser correcao dentro da R1, nao cria pontos extras nem altera 52,5% geral
  ou 50% no Plano 4 antes do gate R1B.

Na R1B real de 2026-07-23, a conducao e o documento no app foram aprovados,
mas o PDF do WhatsApp saiu parcial, o reenvio perdeu o tipo da sessao e o Plano
Estrategico Anual nao foi atualizado. A correcao foi implementada localmente:
PDF integral, reenvio contextual, atualizacao transacional/reversivel do plano,
nova versao canonica anual e contrato de fechamento do ano. O pacote foi
publicado pela PR #28 e merge `53d3a28`; aguarda o reteste real junto com a
ponte contextual. Fonte:
`plans/ddr/R1B-paridade-pdf-e-plano-anual-versionado.md`.

O primeiro reteste revelou ainda uma lacuna de arquitetura na tela: revisao e
plano estavam corretamente separados para auditoria, mas o botao generico nao
selecionava a revisao ja aprovada. A ponte contextual foi implementada em
2026-07-24: a tela mostra a linhagem, abre a aplicacao pelo documento exato,
impede preservar novamente e exige diff antes da confirmacao unica. A ponte
foi publicada pela PR #30, merge `fc508d0`, release protegido
`30102384560`, Netlify `6a637bb588a6e544269cbb75` e verificacao
`30102788853`. Aguarda somente o reteste real. Fonte:
`plans/ddr/R1B-ponte-revisao-plano-anual.md`.

O segundo reteste real comprovou que a ponte criava a nova versao, mas aceitava
como atualizacao material apenas um resumo generico; contexto, objetivos e
projetos permaneciam antigos. A correcao de materializacao completa foi
implementada em 2026-07-24: cada prioridade exige destino em objetivo, cada
primeira acao exige destino em projeto e os blocos aprovados da revisao entram
deterministicamente no plano. A aplicacao incompleta existente recebe caminho
de reparo sem apagar historico. O pacote foi publicado pela PR #32, merge
`1b742d3`, release protegido `30113002368`, Netlify
`6a63a22877aa69db05ad013f` e verificacao `30113080510`. O smoke autenticado
confirmou o estado `Atualizacao incompleta` e a acao correta, sem mutar dados.
O progresso permanece em 52,5% geral e 50% no Plano 4 ate o owner revisar os
destinos propostos e confirmar a nova versao real.

Na tentativa de confirmacao, a fala natural apresentou corretamente 2 objetivos
atualizados, 1 objetivo novo e 3 projetos, mas o extrator tecnico deixou
`proposal` nula; `pode confirmar` caiu no fallback sem gravar. A correcao
R1B de confirmacao passa a exigir a estrutura quando a proposta ja foi
apresentada e recupera confirmacoes naturais a partir da conversa recente,
sempre reaplicando as guardas antes de permitir a gravacao. O progresso nao
muda antes do reteste real.

## 2. Os oito planos

| Plano | Peso geral | Progresso especifico | Contribuicao geral | Estado |
| --- | ---: | ---: | ---: | --- |
| [1. Fundacao tecnica e qualidade](especificos/01-fundacao-tecnica-e-qualidade.md) | 25% | 100% | 25,0% | Concluido |
| [2. Pesquisa de usabilidade](especificos/02-pesquisa-de-usabilidade.md) | 10% | 100% | 10,0% | Concluido |
| [3. Calibracao pre-beta](especificos/03-calibracao-pre-beta.md) | 10% | 100% | 10,0% | Concluido |
| [4. Revisao semestral estrategica](especificos/04-revisao-semestral-estrategica.md) | 15% | 50% | 7,5% | Materializacao completa em release; aguarda reparo real |
| [5. Beta coletivo](especificos/05-beta-coletivo.md) | 10% | 0% | 0,0% | Nao iniciado |
| [6. Validacao operacional](especificos/06-validacao-operacional.md) | 15% | 0% | 0,0% | Nao iniciado |
| [7. Acabamento e operacao assistida](especificos/07-acabamento-e-operacao-assistida.md) | 10% | 0% | 0,0% | Nao iniciado |
| [8. Evolucoes por evidencia](especificos/08-evolucoes-por-evidencia.md) | 5% | 0% | 0,0% | Congelado |
| **Total** | **100%** | - | **52,5%** | Em andamento |

## 3. Formula

Progresso especifico:

```text
pontos das fatias com gate aprovado / 100
```

Contribuicao de um plano para o geral:

```text
peso geral x progresso especifico
```

Progresso geral:

```text
soma das contribuicoes dos oito planos
```

Exemplo da UX-P0:

```text
Plano 2: 40 de 100 pontos = 40%
Geral: peso 10 x 40% = 4 pontos
Novo geral: 25 + 4 = 29%
```

## 4. Regras para nao distorcer a porcentagem

1. Uma fatia vale zero ate seu gate ser aprovado.
2. `Em andamento` informa trabalho, mas nao soma conclusao.
3. Fatia grande so pode ter parcial se for dividida antes em subfatias com
   pontos e gates proprios.
4. Teste reprovado nao perde progresso ja aprovado; abre correcao dentro da
   mesma fatia.
5. Correcao de regressao nao cria porcentagem extra.
6. Escopo novo nao entra silenciosamente. Primeiro versiona-se a baseline,
   explica-se o impacto e o owner aprova a nova distribuicao.
7. Item H3 nao iniciado continua congelado e nao impede a operacao assistida,
   embora faca parte dos 100 pontos do roadmap integral.
8. Progresso mede escopo aprovado. Esforco, tentativas, custo e tempo sao
   reportados separadamente.

## 5. Relatorio obrigatorio a cada fatia

Antes de executar a proxima fatia:

```text
Plano geral: 52,5%
Plano especifico: Revisao Semestral Estrategica - 50,0%
Proxima fatia mestre: R1B - vale 50 pontos do especifico e 7,5 pontos do geral
Subplano atual: F1-F4 ativas em producao - 90% interno e 0 ponto adicional
Se aprovada: especifico 100,0% | geral 60,0%
```

Depois de executar:

```text
Gate: aprovado ou reprovado
Plano geral: antes -> depois
Plano especifico: antes -> depois
Evidencia: testes, aprovacao e documento
Custo e tentativas: informados separadamente
Proxima fatia: nome, peso e impacto potencial
```

## 6. Manutencao

Ao encerrar qualquer fatia, o agente deve atualizar no mesmo ciclo:

1. este painel;
2. o plano especifico correspondente;
3. o plano mestre, quando houver decisao de escopo ou ordem;
4. `docs/CHANGELOG.md`;
5. os handoffs privados aplicaveis.

Se os numeros divergirem, este painel e os pontos aprovados nos planos
especificos devem ser reconciliados antes de anunciar progresso.
