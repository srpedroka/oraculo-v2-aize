# Plano especifico 4 - Revisao Semestral Estrategica

Peso no plano geral: **15%**

Progresso especifico: **50%**

Contribuicao atual ao geral: **7,5%**

Status: **R1A APROVADA - R1B EM CORRECAO E RETESTE**

## Objetivo

Revisar na pratica o Plano Estrategico Anual inteiro com o owner, usando os
resultados, evidencias e relatorios reais de T1/T2 para produzir a leitura do
semestre e um novo planejamento estrategico para julho-dezembro.

## Etapas e pontos

| Fatia | Pontos | Estado | Gate |
| --- | ---: | --- | --- |
| R1A. Preflight e contrato para o ciclo real | 50 | Aprovada em 2026-07-20 | Contexto semestral, contrato e testes aprovados |
| Equilibrio da IA F1-F4 | 0 extra | F1-F4 concluidas no staging; 90% interno | Fala natural com gravacao server-side intacta |
| R1B. Revisao e novo planejamento reais com owner | 50 | Correcao validada no staging; aguarda release/reteste | Duas secoes canonicas, plano anual versionado, PDF completo, uma confirmacao e qualidade aprovadas |
| **Total** | **100** | **Em andamento** | **50%** |

## Entregas

- Resumo Estrategico do Semestre;
- leitura por objetivo, area, KPI, projeto e evidencia;
- lacunas e riscos explicitamente identificados;
- proposta consolidada do que manter, reforcar, ajustar ou substituir;
- prioridades para o segundo semestre;
- Plano Estrategico do Segundo Semestre derivado da revisao;
- primeira prova real da arquitetura conversacional AI-first;
- uma conferencia e uma confirmacao;
- plano original preservado, versionado e auditavel.

Fonte: secao 10, R1A e R1B do plano mestre.

Briefing executavel: `plans/ddr/R1A-prontidao-contrato-briefing.md`.

Subplano corretivo aprovado:
`plans/2026-07-22-equilibrio-da-ia.md`. Ele possui progresso interno proprio,
mas nao altera os pontos deste plano. F1-F4 precedem a R1B; F5 ocorre depois do
piloto e da observacao.

A F1 foi aceita para continuidade depois do piloto trimestral 8/8. A F2
substituiu seis envelopes de fala por situacoes seguras, mantendo estrutura e
gravacao sob autoridade do servidor. O piloto final de fechamento mensal teve
media 92,50 e cleanup completo. A F3 separou estilo de dados e, na mesma
baseline Q4W, reduziu chamadas de 5 para 3 e zerou dois reparos de estilo, com
media final 95. A F4 separou fala e estrutura, protegeu concorrencia e passou a
rodada geral com media 92,50 no fechamento. O subplano esta em 90%; a qualidade global sera avaliada na
conversa pratica. Evidencias:
`plans/ddr/Equilibrio-IA-F1-staging.md` e
`plans/ddr/Equilibrio-IA-F2-staging.md` e
`plans/ddr/Equilibrio-IA-F3-staging.md` e
`plans/ddr/Equilibrio-IA-F4-staging.md`.

## Correcao aberta pela R1B real

O owner concluiu uma boa conducao e aprovou a revisao real em 2026-07-23. O
documento salvo no app ficou completo, mas o PDF do WhatsApp trouxe apenas o
bloco inicial; o pedido de reenvio perdeu o contexto e pediu area; e o plano
anual permaneceu intacto embora a intencao fosse atualiza-lo.

A correcao validada no staging:

- iguala o PDF do WhatsApp ao documento completo;
- preserva a sessao ao reenviar "o arquivo da revisao";
- permite preservar ou atualizar explicitamente o plano vigente;
- atualiza, cria ou retira objetivos de forma transacional e reversivel;
- gera nova versao canonica do Plano Estrategico quando houver mudanca;
- no fim do ano preserva o ano encerrado e prepara o proximo plano.

Fonte: `plans/ddr/R1B-paridade-pdf-e-plano-anual-versionado.md`.

## Ponte contextual entre os documentos

A separacao entre Revisao Semestral e Plano Estrategico Anual foi preservada
para manter auditoria, mas a tela passou a ligar os dois documentos. Quando a
revisao de meio do ano esta salva e ainda nao foi aplicada, o owner ve
`Atualizar Plano {ano} com a revisao` e a linhagem entre versoes.

O motor recebe o ID exato da revisao, usa seu conteudo integral como contexto,
nao reinicia a entrevista semestral e exige uma proposta com diff explicito e
uma unica confirmacao. Documento de outra empresa/ano, revisao ja aplicada,
fechamento anual, nova preservacao ou atualizacao vazia sao recusados
server-side. Fonte:
`plans/ddr/R1B-ponte-revisao-plano-anual.md`.

O gate tecnico passou com 594 unitarios, 32 arquivos de integracao, 7 provas
de seguranca, lint, build e bundle. O progresso permanece em 50% ate release e
reteste real aprovados.

## Evidencia R1A

- roteamento separa criacao anual de `strategic_review` no app e WhatsApp;
- pergunta lateral e oferta de arquivo preservam fase, estado e proposta;
- contexto `semester_review` agrega Plano Anual, T1/T2, janeiro-junho, todas as
  areas, KPIs, evidencias, check-ins e documentos pertinentes;
- um pacote canonico contem Revisao do Primeiro Semestre e Plano do Segundo
  Semestre, com a mesma fonte para tela, PDF e WhatsApp;
- teste real de banco preservou integralmente o objetivo anual quando nao havia
  ajuste explicito e nao duplicou documento no retry;
- 563 unitarios, 31 arquivos de integracao, 7 verificacoes de seguranca, 11 E2E
  desktop/mobile, lint, build, bundle e secret scan verdes;
- teste opt-in com modelo real foi pulado por ausencia da chave temporaria no
  ambiente; custo desta fatia ate o gate: US$ 0;
- por decisao do owner, naturalidade e qualidade estrategica serao avaliadas na
  conversa real R1B em producao, sem substituir essa prova por ensaio sintetico.
