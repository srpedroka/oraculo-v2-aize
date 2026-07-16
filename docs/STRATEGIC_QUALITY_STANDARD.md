# Padrao de qualidade estrategica

Versao: `2026-07-16.q0`

Status: aprovado pelo owner em 2026-07-16.

## Objetivo

Este documento define como avaliar, de forma repetivel, duas coisas diferentes:

1. se o Oraculo conduziu bem a conversa com o gestor;
2. se o plano trimestral produzido ficou bom o suficiente para executar.

A rubrica completa e legivel por maquina fica em `tests/evals/strategic-quality/rubric.json`. Esta versao nao altera prompts, modelos, banco, WhatsApp ou interface.

## Regra de pontuacao

Cada criterio recebe uma nota de `0` a `4`:

| Nota | Interpretacao |
| ---: | --- |
| 0 | Ausente ou prejudicial |
| 1 | Fraco; exige correcao substancial |
| 2 | Parcial; tem lacunas relevantes |
| 3 | Solido; apenas ajustes menores |
| 4 | Excelente; atende integralmente e melhora a decisao |

Pontos do criterio:

```text
pontos = peso x nota / 4
```

O resultado deve ser arredondado para uma casa decimal somente na apresentacao. O calculo do total usa o valor sem arredondamento intermediario.

As duas rubricas somam 100 pontos separadamente. Cada uma precisa atingir 80, e a media entre elas precisa atingir 85 no gate final. Uma falha critica reprova o caso mesmo com nota alta.

## Conducao estrategica

| ID | Criterio | Peso |
| --- | --- | ---: |
| `COND-SCOPE-001` | Escopo correto | 15 |
| `COND-DIAGNOSIS-001` | Diagnostico | 15 |
| `COND-QUESTIONS-001` | Qualidade das perguntas | 15 |
| `COND-CHALLENGE-001` | Desafio estrategico | 15 |
| `COND-MEMORY-001` | Uso da memoria | 15 |
| `COND-NATURALNESS-001` | Naturalidade e eficiencia | 10 |
| `COND-FIDELITY-001` | Fidelidade | 10 |
| `COND-CLOSURE-001` | Fechamento | 5 |

## Plano trimestral

| ID | Criterio | Peso |
| --- | --- | ---: |
| `PLAN-ALIGNMENT-001` | Alinhamento estrategico | 20 |
| `PLAN-OUTCOME-001` | Objetivo de resultado | 15 |
| `PLAN-MEASURE-001` | Meta e evidencia | 20 |
| `PLAN-EXECUTION-001` | Plano de execucao | 20 |
| `PLAN-FOCUS-001` | Foco e viabilidade | 10 |
| `PLAN-RISK-001` | Riscos e aprendizados | 5 |
| `PLAN-CADENCE-001` | Cadencia de gestao | 10 |

## Falhas criticas

### Revisao humana

- `CRIT-SCOPE-001`: empresa, area, pessoa ou periodo incorreto.
- `CRIT-LEVEL-001`: troca indevida entre plano anual, trimestral e mensal.
- `CRIT-MEMORY-001`: historico de outra area usado como referencia principal.
- `CRIT-FABRICATION-001`: numero, responsavel, KPI ou decisao inventada.
- `CRIT-ALIGNMENT-001`: ausencia de ligacao com objetivo anual aplicavel.
- `CRIT-VERIFIABILITY-001`: meta sem forma verificavel de conclusao.

### Checagem deterministica

- `CRIT-PREMATURE-WRITE-001`: gravacao antes da confirmacao.
- `CRIT-MULTI-CONFIRM-001`: mais de uma confirmacao final para a proposta.
- `CRIT-DIVERGENCE-001`: conversa, banco e documento canonico divergem.
- `CRIT-JUDGE-MUTATION-001`: o avaliador altera algum dado.

Na Q1, cada checagem deterministica deve produzir `pass`, `fail` ou `not_applicable` com evidencia tecnica sanitizada. `not_applicable` precisa de justificativa e nao pode esconder uma checagem que o caso realmente exercitou.

## Ficha humana

A ficha oficial fica em `tests/evals/strategic-quality/human-review-template.md`. O revisor deve:

1. ler o contexto sintetico, a transcricao sanitizada e o plano;
2. marcar primeiro as falhas criticas;
3. dar nota de 0 a 4 por criterio;
4. citar evidencia curta da transcricao ou do plano;
5. justificar notas 0, 1, 2 e qualquer divergencia do judge;
6. registrar decisao humana independente da nota automatica.

O judge de IA pode sugerir notas, mas nao aprova o gate, nao edita o caso e nao grava no Oraculo.

## Custo por caso

O custo do laboratorio e medido em dolares com quatro campos:

```text
generationCostUsd
judgeCostUsd
totalCaseCostUsd = generationCostUsd + judgeCostUsd
cumulativePlanCostUsd = soma dos casos executados no plano
```

Entram na conta somente chamadas pagas iniciadas pelo laboratorio Q1-Q6. Testes sem modelo, custos anteriores do app e uso operacional normal ficam fora do custo do caso.

Limites aprovados pelo owner:

- aviso ao atingir US$ 15;
- parada preventiva antes de iniciar nova chamada ao atingir US$ 19;
- teto absoluto de US$ 20 sem nova autorizacao;
- compra de creditos, assinatura, upgrade ou recarga sempre exige autorizacao especifica e imediata.

O runner deve registrar provider, modelo, funcao, tokens de entrada/saida quando disponiveis e custo calculado. Nunca registra chave ou payload bruto.

## Formato sanitizado

Cada caso futuro deve usar aliases sinteticos como `ORG_FIXTURE_A`, `AREA_FIXTURE_A` e `PERSON_FIXTURE_A`.

Transcricao minima:

```json
{
  "schemaVersion": 1,
  "caseId": "CASE-001",
  "channel": "web",
  "scope": {
    "organization": "ORG_FIXTURE_A",
    "area": "AREA_FIXTURE_A",
    "period": "T3-2026",
    "planLevel": "quarterly"
  },
  "messages": [
    {
      "sequence": 1,
      "role": "manager",
      "content": "conteudo sintetico"
    }
  ]
}
```

Plano avaliado minimo:

```json
{
  "schemaVersion": 1,
  "caseId": "CASE-001",
  "planLevel": "quarterly",
  "period": "T3-2026",
  "area": "AREA_FIXTURE_A",
  "strategicAlignment": [],
  "objectives": [],
  "actions": [],
  "risks": [],
  "cadence": null
}
```

E proibido incluir nomes, emails, telefones, UUIDs de producao, chaves, tokens, texto empresarial real, IDs internos de pessoas ou URLs temporarias. Transcricoes geradas ficam em `.agents-private/`, com permissao `600` e fora do Git.

## Linha de partida

`tests/evals/strategic-quality/baseline.json` registra:

- commit anterior a Q0;
- modelos observados no preflight para `planning`, `daily` e `background`;
- hashes SHA-256 dos condutores, prompts, roteadores e aplicadores relevantes.

O teste unitario compara os hashes com o codigo. Assim, uma alteracao em condutor ou prompt nao passa silenciosamente: a mudanca precisa atualizar o baseline de forma explicita e explicar por que isso ocorreu.

## Gate Q0

Q0 somente e aprovada quando o owner confirmar que compreendeu e aceita:

- os pesos e as notas;
- as faixas 80/85;
- as dez falhas criticas;
- a separacao entre judge e decisao humana;
- o limite financeiro de US$ 20, com aviso em US$ 15 e parada preventiva em US$ 19.

Aprovacao registrada: o owner confirmou explicitamente a rubrica Q0 e seus limites em 2026-07-16.

A aprovacao libera apenas o briefing e a execucao autorizada da Q1. Nao libera producao nem contato com gestor real.
