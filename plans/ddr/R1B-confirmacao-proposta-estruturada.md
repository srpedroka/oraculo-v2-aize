# R1B - Confirmacao da proposta estruturada

Data: 2026-07-24
Estado: implementado; aguarda staging e release

## Falha real

O Oraculo apresentou a integracao completa da Revisao Semestral v2:

- 2 objetivos anuais atualizados;
- 1 objetivo anual novo;
- 3 projetos prioritarios;
- antes/depois e justificativas;
- uma pergunta final de confirmacao.

Apesar da fala correta, o extrator registrou o turno sem `pending_proposal`.
Quando o owner respondeu `pode confirmar`, a sessao caiu no fallback e nenhum
dado foi gravado.

## Correcao

- Uma fala de aplicacao de revisao que contenha atualizacao do plano,
  objetivos, projetos e confirmacao nao pode ser aceita com `proposal` nula.
- A segunda extracao recebe instrucao explicita para reconstruir
  `apply_strategic_review` com IDs reais, `sourcePriorityKey`,
  `objectiveChanges`, `projectChanges` e `update_current_year`.
- Confirmacoes naturais recuperam a proposta da fala anterior ou da conversa
  recente quando o turno anterior perdeu a estrutura.
- A proposta recuperada passa novamente por cobertura de prioridades,
  cobertura de primeiras acoes, escopo, ano e modo de atualizacao.
- Recuperar a proposta nao grava o plano. A mutacao continua exclusiva do
  endpoint de confirmacao transacional e idempotente.

## Gate

- Teste reproduz a proposta completa aceita sem estrutura.
- Teste reproduz `pode confirmar` depois da proposta perdida.
- Suite unitaria, lint, build e bundle obrigatorios.
- Staging deve validar `oracle-session` sem tocar a empresa real.
- Sem migration e sem frontend.
