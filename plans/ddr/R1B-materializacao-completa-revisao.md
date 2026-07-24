# R1B - Materializacao completa da revisao no Plano Anual

Data: 2026-07-24
Estado: publicado; aguarda reparo real do owner

## Problema comprovado

O primeiro uso real da ponte registrou uma nova versao do Plano Estrategico
2026, mas alterou somente o resumo executivo. A Revisao Semestral continha
contexto, tres prioridades, decisoes, renuncias, riscos, cadencia e primeiras
acoes; objetivos e projetos do plano permaneceram antigos.

O contrato anterior considerava qualquer chave em `planChanges` como
atualizacao suficiente. Projetos estrategicos nem faziam parte da proposta.

## Comportamento aprovado

- Revisao e Plano Anual continuam documentos separados.
- A revisao aprovada e fonte imutavel durante sua aplicacao.
- Contexto, foco, cadencia, riscos, renuncias e aprendizados entram no plano
  pelo servidor; nao dependem de o modelo repetir o texto.
- Cada prioridade recebe `sourcePriorityKey` e precisa manter, atualizar ou
  criar um objetivo anual.
- Cada primeira acao precisa manter, atualizar ou criar um projeto estrategico
  ligado ao objetivo da mesma prioridade.
- Resumo generico isolado e recusado.
- Aplicacoes antigas incompletas exibem `Completar atualizacao do Plano 2026`.
- O reparo preserva todas as versoes e exige uma unica confirmacao antes de
  gerar nova Revisao Semestral e novo Plano Estrategico.
- Fechamento anual continua sem reescrever o ano encerrado.

## Gate

- Testes unitarios cobrem rejeicao de resumo isolado, cobertura de objetivos,
  cobertura de projetos, deteccao de reparo e linhagem.
- Integracao cobre materializacao transacional de contexto, objetivo, projeto,
  documento de revisao e documento anual.
- Sem migration.
- Edge Function afetada: `oracle-session`.
- Frontend afetado: Plano Estrategico e Documentos.
- Nenhuma chamada paga de IA durante o gate tecnico.

## Aceite real pendente

Depois do release, o owner abre Plano Estrategico, usa
`Completar atualizacao do Plano 2026`, confere o destino das tres prioridades
e confirma uma vez. O gate R1B so termina quando a tela mostrar o contexto
revisado, os objetivos corretos, os projetos correspondentes e a nova versao
canonica sem perda do historico.

## Release

- PR #32; merge `1b742d3`.
- CI da main `30112638735`.
- Release protegido de `oracle-session` `30113002368`.
- Verificacao protegida `30113080510`.
- Frontend Netlify `6a63a22877aa69db05ad013f`.
- Smoke autenticado: revisao real reconhecida como `Atualizacao incompleta` e
  acao `Completar atualizacao do Plano 2026` visivel.
- Nenhuma sessao foi iniciada e nenhum dado real foi alterado no smoke.
- Sem migration e sem chamada paga de IA.
