# Equilibrio da IA F1 - resultado no staging

Data: 2026-07-22

Status: **PILOTO VERDE NO STAGING - ACEITE QUALITATIVO DO OWNER PENDENTE**

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

Depois da renovacao da chave temporaria, uma sonda minima validou o Grok 4.3
com HTTP 200. O caso trimestral sintetico foi repetido no staging em modo
diagnostico, sem judge pago, e passou nos oito controles aplicaveis.

Contexto do gestor:

> Tenho oito prioridades para o trimestre, mas a equipe comporta duas. O funil
> esta imprevisivel e quero escolher o que mais ajuda o objetivo anual de
> torna-lo confiavel.

Resposta do Oraculo:

> Quais duas das oito prioridades mais diretamente ajudam a tornar o funil
> confiavel?

A fala ficou curta, ancorada no contexto, sem bordao, sem parafrase mecanica e
com uma unica pergunta voltada a decisao. Nao houve proposta nem mutacao
prematura. Empresa, usuario e chave descartaveis foram removidos no cleanup.

- controles: 8/8;
- geracao: US$ 0,005351;
- judge: US$ 0;
- total do caso: US$ 0,005351;
- acumulado historico: US$ 17,352811 -> US$ 17,358162;
- consumo do ciclo atual de US$ 20: US$ 0,005351.

O runtime e o piloto sintetico estao verdes. Pela regra de governanca, a F1
continua valendo zero ate o owner avaliar a fala acima e dar o aceite
qualitativo. Producao permanece intacta.

## Proximo gate

1. apresentar a transcricao ao owner;
2. obter o aceite ou registrar o ajuste qualitativo solicitado;
3. somente apos o aceite, marcar F1 como 20% interno e decidir merge/release;
4. nao iniciar F2 nem publicar em producao antes desse gate.

Rollback: restaurar a composicao anterior do prompt e republicar as mesmas
quatro Functions. Nao existe migration para desfazer.
