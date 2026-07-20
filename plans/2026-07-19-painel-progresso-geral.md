# Painel de progresso do plano geral do Oraculo

Data-base: 2026-07-20

Status: **ATIVO - fonte oficial das porcentagens**

Conteudo e ordem: `plans/2026-07-19-plano-mestre-evolucao-integrado.md`.

Este painel separa o programa em oito planos especificos. Os pesos representam
valor de marco para o produto, nao horas trabalhadas, quantidade de commits ou
custo. A soma dos oito pesos e 100 pontos.

## 1. Progresso atual

**Plano geral: 43,0%**

**Plano especifico atual: Plano 3 - Calibracao pre-beta: 80,0%**

**Proxima acao: briefing da UX-C4 - Mobile e acessibilidade**

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

## 2. Os oito planos

| Plano | Peso geral | Progresso especifico | Contribuicao geral | Estado |
| --- | ---: | ---: | ---: | --- |
| [1. Fundacao tecnica e qualidade](especificos/01-fundacao-tecnica-e-qualidade.md) | 25% | 100% | 25,0% | Concluido |
| [2. Pesquisa de usabilidade](especificos/02-pesquisa-de-usabilidade.md) | 10% | 100% | 10,0% | Concluido |
| [3. Calibracao pre-beta](especificos/03-calibracao-pre-beta.md) | 10% | 80% | 8,0% | UX-C3 aprovada; UX-C4 e a proxima |
| [4. Revisao semestral estrategica](especificos/04-revisao-semestral-estrategica.md) | 15% | 0% | 0,0% | Nao iniciado |
| [5. Beta coletivo](especificos/05-beta-coletivo.md) | 10% | 0% | 0,0% | Nao iniciado |
| [6. Validacao operacional](especificos/06-validacao-operacional.md) | 15% | 0% | 0,0% | Nao iniciado |
| [7. Acabamento e operacao assistida](especificos/07-acabamento-e-operacao-assistida.md) | 10% | 0% | 0,0% | Nao iniciado |
| [8. Evolucoes por evidencia](especificos/08-evolucoes-por-evidencia.md) | 5% | 0% | 0,0% | Congelado |
| **Total** | **100%** | - | **43,0%** | Em andamento |

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
Plano geral: 43,0%
Plano especifico: Calibracao pre-beta - 80,0%
Proxima fatia: UX-C4 - vale 20 pontos do especifico e 2 pontos do geral
Se aprovada: especifico 100,0% | geral 45,0%
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
