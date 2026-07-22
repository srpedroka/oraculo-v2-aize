# Plano especifico 4 - Revisao Semestral Estrategica

Peso no plano geral: **15%**

Progresso especifico: **50%**

Contribuicao atual ao geral: **7,5%**

Status: **R1A APROVADA - EQUILIBRIO IA F1-F4 ANTES DA R1B REAL**

## Objetivo

Revisar na pratica o Plano Estrategico Anual inteiro com o owner, usando os
resultados, evidencias e relatorios reais de T1/T2 para produzir a leitura do
semestre e um novo planejamento estrategico para julho-dezembro.

## Etapas e pontos

| Fatia | Pontos | Estado | Gate |
| --- | ---: | --- | --- |
| R1A. Preflight e contrato para o ciclo real | 50 | Aprovada em 2026-07-20 | Contexto semestral, contrato e testes aprovados |
| Equilibrio da IA F1-F4 | 0 extra | F1 no staging; piloto verde e aceite pendente | Fala natural com gravacao server-side intacta |
| R1B. Revisao e novo planejamento reais com owner | 50 | Aguarda F1-F4 | Duas secoes canonicas, uma confirmacao e qualidade aprovadas |
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

A F1 esta implementada no staging com gate tecnico verde. Depois da renovacao
da chave, o piloto trimestral passou 8/8 controles com fala ancorada, uma
pergunta visivel, zero mutacao e cleanup concluido. O custo foi US$ 0,005351 de
geracao e US$ 0 de judge. O progresso interno permanece 0% somente ate o aceite
qualitativo do owner. Evidencia:
`plans/ddr/Equilibrio-IA-F1-staging.md`.

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
