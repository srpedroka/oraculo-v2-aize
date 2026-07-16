# Padrão de qualidade do Oráculo

Versão: `2026-07-16.q0-r2`

Status: **aprovado pelo owner em 2026-07-16**.

A versão `2026-07-16.q0` foi aprovada em 2026-07-16, mas avaliava principalmente condução e plano trimestral. Esta revisão amplia a cobertura e coloca o **Plano Estratégico Anual como primeira entrega de conteúdo avaliada**. A R2 foi aprovada com controle financeiro acumulado, sem teto isolado por caso.

## Objetivo

O padrão separa três tipos de qualidade:

1. **Conteúdo estratégico:** a conversa e a decisão empresarial são boas?
2. **Saída derivada:** banco, documento, PDF, WhatsApp e Dashboard reproduzem corretamente o que foi aprovado?
3. **Operação do software:** segurança, permissões, filas, backup, navegação e configurações funcionam com integridade?

Nem toda tela precisa de judge de IA. Conteúdo estratégico usa rubrica e revisão humana; saídas derivadas priorizam comparação determinística; administração usa RLS, integração, E2E, segurança e QA visual. Isso cobre o produto sem criar custo ou burocracia artificial.

A lista rastreável de entregas fica em `tests/evals/strategic-quality/deliverable-coverage.json`.

## Ordem estratégica

Depois da fundação Q0/Q1, a avaliação de conteúdo respeita esta sequência:

```text
Plano Estratégico Anual
        |
        v
Plano Trimestral por Área
        |
        v
Plano Mensal
        |
        v
Revisões, Fechamentos e Execução
        |
        v
Memória, Importações, Documentos, PDF, WhatsApp e Dashboard
```

O trimestral deve apontar para um objetivo anual aplicável. O mensal deve apontar para um objetivo trimestral. Uma prioridade emergente pode existir sem vínculo, mas precisa ser apresentada como exceção, justificada e confirmada; o sistema nunca deve forçar ou inventar um vínculo.

## Regra de pontuação

Cada critério recebe nota de `0` a `4`:

| Nota | Interpretação |
| ---: | --- |
| 0 | Ausente ou prejudicial |
| 1 | Fraco; exige correção substancial |
| 2 | Parcial; tem lacunas relevantes |
| 3 | Sólido; apenas ajustes menores |
| 4 | Excelente; atende integralmente e melhora a decisão |

```text
pontos = peso x nota / 4
```

Cada rubrica soma 100 pontos. Um caso com conversa usa `RUBRIC-CONDUCTION` e a rubrica principal da entrega. Saídas derivadas podem usar somente `RUBRIC-DERIVED-OUTPUT`. Todas as rubricas aplicáveis precisam atingir 80 e a média precisa atingir 85. Uma falha crítica reprova o caso mesmo com nota alta.

## Rubricas

### Condução estratégica

| ID | Critério | Peso |
| --- | --- | ---: |
| `COND-SCOPE-001` | Escopo correto | 15 |
| `COND-DIAGNOSIS-001` | Diagnóstico | 15 |
| `COND-QUESTIONS-001` | Qualidade das perguntas | 15 |
| `COND-CHALLENGE-001` | Desafio estratégico | 15 |
| `COND-MEMORY-001` | Uso da memória | 15 |
| `COND-NATURALNESS-001` | Naturalidade e eficiência | 10 |
| `COND-FIDELITY-001` | Fidelidade | 10 |
| `COND-CLOSURE-001` | Fechamento | 5 |

### Plano Estratégico Anual

| ID | Critério | Peso |
| --- | --- | ---: |
| `ANNUAL-DIAGNOSIS-001` | Diagnóstico e direcionadores | 15 |
| `ANNUAL-CHOICES-001` | Escolhas, foco e renúncias | 20 |
| `ANNUAL-OBJECTIVES-001` | Objetivos de resultado | 20 |
| `ANNUAL-MEASURES-001` | Metas e indicadores | 15 |
| `ANNUAL-PORTFOLIO-001` | Projetos e responsabilidade | 10 |
| `ANNUAL-RISK-001` | Riscos e memória | 10 |
| `ANNUAL-GOVERNANCE-001` | Governança do ano | 10 |

### Plano Trimestral

| ID | Critério | Peso |
| --- | --- | ---: |
| `PLAN-ALIGNMENT-001` | Alinhamento com o anual | 20 |
| `PLAN-OUTCOME-001` | Objetivo de resultado | 15 |
| `PLAN-MEASURE-001` | Meta e evidência | 20 |
| `PLAN-EXECUTION-001` | Plano de execução | 20 |
| `PLAN-FOCUS-001` | Foco e viabilidade | 10 |
| `PLAN-RISK-001` | Riscos e aprendizados | 5 |
| `PLAN-CADENCE-001` | Cadência de gestão | 10 |

### Plano Mensal

| ID | Critério | Peso |
| --- | --- | ---: |
| `MONTHLY-CASCADE-001` | Desdobramento trimestral | 20 |
| `MONTHLY-OUTCOME-001` | Resultado do mês | 15 |
| `MONTHLY-MEASURE-001` | Meta e evidência | 20 |
| `MONTHLY-ACTIONS-001` | Ações executáveis | 20 |
| `MONTHLY-FOCUS-001` | Foco e capacidade | 10 |
| `MONTHLY-CONTINUITY-001` | Continuidade de pendências | 5 |
| `MONTHLY-CADENCE-001` | Acompanhamento | 10 |

### Revisões e Fechamentos

| ID | Critério | Peso |
| --- | --- | ---: |
| `REVIEW-SCOPE-001` | Ritual e período corretos | 15 |
| `REVIEW-EVIDENCE-001` | Evidência concreta | 20 |
| `REVIEW-VERDICT-001` | Veredito honesto | 15 |
| `REVIEW-LEARNING-001` | Aprendizado | 15 |
| `REVIEW-DECISION-001` | Decisão sobre pendências | 15 |
| `REVIEW-FORWARD-001` | Ponte para o próximo ciclo | 10 |
| `REVIEW-FIDELITY-001` | Fidelidade e rastreabilidade | 10 |

### Memória, Importações e Sugestões

| ID | Critério | Peso |
| --- | --- | ---: |
| `INFO-SOURCE-001` | Fonte correta | 20 |
| `INFO-EXTRACTION-001` | Extração fiel | 20 |
| `INFO-RELEVANCE-001` | Relevância | 20 |
| `INFO-CONFLICT-001` | Tratamento de conflito | 15 |
| `INFO-PROVENANCE-001` | Proveniência e reversão | 15 |
| `INFO-PRIVACY-001` | Minimização | 10 |

### Documentos, PDF, WhatsApp e Dashboard

| ID | Critério | Peso |
| --- | --- | ---: |
| `OUTPUT-FIDELITY-001` | Fidelidade entre saídas | 25 |
| `OUTPUT-COMPLETENESS-001` | Completude | 20 |
| `OUTPUT-HIERARCHY-001` | Hierarquia estratégica | 15 |
| `OUTPUT-READABILITY-001` | Leitura e design | 15 |
| `OUTPUT-NUMERICAL-001` | Precisão numérica | 15 |
| `OUTPUT-TRACEABILITY-001` | Versão e trilha | 10 |

## Falhas críticas

### Estratégia e conversa

- `CRIT-SCOPE-001`: empresa, área, pessoa ou período incorreto.
- `CRIT-LEVEL-001`: troca indevida entre anual, trimestral e mensal.
- `CRIT-MEMORY-001`: memória de outra área ou período usada como referência principal.
- `CRIT-FABRICATION-001`: número, responsável, KPI, vínculo ou decisão inventada.
- `CRIT-ALIGNMENT-001`: entrega inferior sem ligação com o nível superior aplicável.
- `CRIT-VERIFIABILITY-001`: meta ou conclusão sem forma verificável.
- `CRIT-OBJECTIVE-ACTIVITY-001`: atividade aceita como objetivo final sem resultado esperado.
- `CRIT-CHANNEL-DIVERGENCE-001`: app e WhatsApp divergem materialmente.

### Dados e sistema

- `CRIT-PREMATURE-WRITE-001`: gravação antes da confirmação.
- `CRIT-MULTI-CONFIRM-001`: mais de uma confirmação final para a mesma proposta.
- `CRIT-DIVERGENCE-001`: conversa, banco e saída canônica divergem.
- `CRIT-JUDGE-MUTATION-001`: o judge altera dados.
- `CRIT-REVIEW-OVERREACH-001`: revisão altera conteúdo fora do limite autorizado.
- `CRIT-CONFLICT-OVERWRITE-001`: importação resolve conflito sem escolha do usuário.
- `CRIT-NUMERICAL-DIVERGENCE-001`: KPI, período, unidade ou cálculo materialmente incorreto.
- `CRIT-SENSITIVE-PERSISTENCE-001`: bruto, segredo ou URL temporária é persistido indevidamente.

Checagens determinísticas produzem `pass`, `fail` ou `not_applicable`. `not_applicable` exige justificativa e não pode esconder um fluxo realmente exercitado.

## Cobertura do produto

A matriz versionada cobre:

- os seis rituais do motor: anual, trimestral, mensal, fechamento mensal, fechamento trimestral e revisão estratégica;
- planejamento, objetivos, ações, evidências, check-ins, pulso e lembretes;
- importação de planos, históricos, imagens, planilhas e KPIs;
- memória e recuperação de contexto;
- documentos canônicos, impressão/PDF, WhatsApp e Dashboard;
- edição, arquivo, auditoria e ciclo de vida;
- autenticação, empresas, áreas, pessoas, papéis e convites;
- IA, persona, custos, WhatsApp, backup, privacidade e conta pessoal;
- navegação, responsividade, acessibilidade, desempenho e estados de erro.

O teste de cobertura compara a matriz com as rotas de `src/App.tsx` e os tipos de sessão de `_shared/session-engine.ts`. Uma rota ou ritual novo exige atualizar a matriz antes do CI ficar verde.

## Revisão humana

A ficha em `tests/evals/strategic-quality/human-review-template.md` usa apenas as rubricas aplicáveis ao caso. O revisor marca primeiro falhas críticas, depois pontua condução e entrega. O judge sugere evidências, mas não aprova gate, não edita caso e não grava no Oráculo.

## Custo

O limite aprovado do plano continua:

- aviso em US$ 15;
- parada preventiva em US$ 19;
- teto de US$ 20;
- nenhum teto isolado por caso; o controle considera o consumo acumulado do plano;
- após cada execução, informar geração, judge, total da execução e acumulado antes/depois;
- compra, recarga, assinatura ou upgrade sempre exige autorização imediata separada.

Para preservar o teto, PDF, Dashboard, documentos, RLS e telas usam checks determinísticos sempre que possível. Judge pago fica concentrado em conteúdo estratégico, memória e naturalidade.

## Segurança e baseline

Casos usam aliases sintéticos e relatórios privados com permissão `600`. É proibido incluir nome, email, telefone, UUID de produção, chave, token, texto empresarial real, mídia bruta ou URL temporária.

`tests/evals/strategic-quality/baseline.json` mantém modelos e hashes dos condutores, roteadores, propostas e documentos. Mudança de prompt ou condutor precisa atualizar o baseline explicitamente.

## Gate Q0 revisado

O novo gate Q0 exige que o owner confirme:

- Plano Estratégico Anual como primeira entrega avaliada;
- desdobramento anual -> trimestral -> mensal;
- sete rubricas de 100 pontos e faixas 80/85;
- dezesseis falhas críticas;
- matriz de cobertura completa;
- separação entre judge, checks determinísticos e decisão humana;
- limite financeiro já aprovado.

Aprovação registrada em 2026-07-16: o owner autorizou seguir com a Q0 R2 e ajustou a regra financeira para remover o teto isolado por caso, mantendo o orçamento acumulado de US$ 20, aviso em US$ 15 e parada preventiva em US$ 19. O gate Q0 R2 está aprovado. Isso libera somente a Q1 anual no staging com chave temporária; Q2 continua bloqueada até o relatório Q1.
