# Equilibrio da IA F1 - resultado no staging

Data: 2026-07-22

Status: **IMPLEMENTADA NO STAGING - GATE QUALITATIVO PENDENTE**

## Resumo funcional

A F1 substitui, somente no prompt principal das sessoes de planejamento, as
tres camadas redundantes de persona, regras de sessao e adaptacao por um nucleo
conversacional positivo e um contrato tecnico curto. Os condutores continuam
definindo metodo, fatos, qualidade anual/trimestral/mensal e fechamentos, mas
deixam de repetir instrucoes genericas de estilo.

Para o usuario, a intencao e uma conversa mais natural, direta e ancorada no
que ele acabou de dizer. Nao muda permissao, escopo, estado canonico, proposta,
confirmacao unica, transacao, idempotencia, auditoria ou regra de gravacao.

## Implementacao

- criado `_shared/conductors/nucleo.ts` com `NUCLEO_ORACULO` e
  `CONTRATO_TECNICO`;
- `session-engine.ts` passou a usar o novo nucleo na chamada principal;
- `UNTRUSTED_CONTENT_RULES`, tom por empresa, condutor e contexto permanecem;
- constantes antigas foram preservadas para rollback e so podem ser removidas
  na F5;
- retiradas apenas repeticoes de estilo em `strategic`, `quarterly`,
  `strategic-review` e `month-close`;
- baseline de qualidade atualizado de forma explicita, incluindo hash do novo
  nucleo.

## Evidencias

- unitarios: 571/571;
- lint, build, bundle de 135,1 KB gzip e `git diff --check`: verdes;
- integracao no Supabase de staging: 31 arquivos executados, todos os gates
  aplicaveis verdes e dois testes opt-in pulados como previsto;
- contratos de sessao, escopo por area, confirmacao atomica, documento
  canonico, atualizacao rapida, fila/worker/outbox do WhatsApp e cleanup
  passaram;
- publicadas somente no staging: `oracle-session`, `oracle-chat`,
  `whatsapp-webhook` e `whatsapp-worker`;
- sem migration, frontend, dado real ou alteracao de producao.

## Piloto qualitativo

O piloto trimestral sintetico foi iniciado em modo diagnostico, mas a xAI
recusou a chave temporaria antes de gerar qualquer resposta. Uma sonda minima
confirmou HTTP 400 `Incorrect API key`. O laboratorio removeu empresa, usuario
e chave descartaveis normalmente.

- geracao: US$ 0;
- judge: US$ 0;
- total do caso: US$ 0;
- acumulado historico: US$ 17,352811;
- consumo do ciclo atual de US$ 20: US$ 0.

Portanto, o runtime esta tecnicamente validado, mas a naturalidade ainda nao
foi observada. O gate F1 permanece pendente e vale zero ate um piloto com chave
valida ser avaliado pelo owner.

## Proximo gate

1. substituir somente a chave temporaria do laboratorio por uma chave valida;
2. repetir `Q4D` em modo diagnostico apenas para `QUARTERLY` no staging;
3. conferir pergunta ancorada, ausencia de bordao, uma pergunta visivel, zero
   mutacao e cleanup;
4. apresentar a transcricao ao owner;
5. somente apos o aceite, marcar F1 como 20% interno e decidir merge/release.

Rollback: restaurar a composicao anterior do prompt e republicar as mesmas
quatro Functions. Nao existe migration para desfazer.
