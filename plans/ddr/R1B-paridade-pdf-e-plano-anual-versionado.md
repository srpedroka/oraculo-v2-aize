# R1B - Paridade do PDF e plano anual versionado

Data: 2026-07-23

Status: **VALIDADO NO STAGING; AGUARDA RELEASE E RETESTE REAL**

## Problema observado no ciclo real

A conducao e o documento salvo no app ficaram bons, mas o teste real revelou
tres defeitos no fechamento da revisao:

1. o PDF enviado no WhatsApp continha apenas cabecalho, motivo e ajustes;
2. pedir novamente "o arquivo da revisao" era interpretado como fechamento
   mensal e o Oraculo perguntava uma area sem necessidade;
3. a revisao gerava o diagnostico e o plano do segundo semestre, mas preservava
   o Plano Estrategico Anual mesmo quando o owner queria atualiza-lo.

Evidencia recebida:

- PDF WhatsApp: 1 pagina, 1.611 bytes e somente o bloco inicial;
- PDF impresso pelo app: 4 paginas e o conteudo integral;
- conversa real mostrou a perda de contexto no reenvio e a preservacao
  automatica do plano anual.

## Decisao funcional

### Revisao no meio do ano

- pode apenas preservar o plano ou atualizar o plano vigente;
- toda mudanca aparece na proposta antes da gravacao;
- uma unica confirmacao aplica revisao + plano;
- pode atualizar blocos gerais, atualizar objetivo, criar objetivo ou retirar
  objetivo;
- objetivo novo exige titulo, resultado, indicador, meta, prazo, responsavel e
  fonte de evidencia;
- o antes/depois permanece no documento e em `operational_revisions`;
- retirada usa o arquivo reversivel existente, incluindo dependencias.

### Revisao no fim do ano

- o ano encerrado nao e reescrito;
- a revisao grava o fechamento e um briefing estruturado para o proximo ano;
- o novo Plano Estrategico nasce depois no fluxo anual proprio, com confirmacao
  separada.

## Decisao tecnica

- nenhuma tabela ou migration nova;
- `apply_strategic_review` ganhou `review_cycle` e
  `annual_plan_update`;
- o envelope transacional aplica todas as mudancas ou nenhuma;
- `TxClient.rpc()` permite reutilizar
  `set_operational_item_archived` dentro da mesma transacao;
- quando o plano vigente muda, e gerada uma nova versao canonica do documento
  `strategic`, alem do documento `strategic_review`;
- a confirmacao da sessao filtra o documento pelo tipo da sessao, evitando que
  a nova versao anual seja devolvida no lugar da revisao;
- o PDF do WhatsApp passou a renderizar o mesmo conteudo executivo exibido em
  Documentos;
- "revisao" isolada nao vira mais `month_close`: o tipo vem da sessao ativa.

## Contrato da proposta

```json
{
  "type": "apply_strategic_review",
  "period": "2026",
  "review_cycle": "midyear",
  "annual_plan_update": {
    "mode": "preserve|update_current_year|prepare_next_year",
    "planChanges": {},
    "objectiveChanges": [
      {
        "operation": "update|create|archive",
        "because": "justificativa concreta"
      }
    ],
    "nextYearBrief": {}
  }
}
```

## Compatibilidade

- propostas antigas com `adjustments` continuam aceitas;
- documentos antigos sem os novos campos continuam renderizados;
- revisao apenas diagnostica continua preservando o plano;
- nao ha mutacao do plano real durante deploy ou teste de fixture.

## Gate

Concluido:

- 144 testes focados verdes;
- suite completa com 594 testes unitarios verdes;
- 32 arquivos de integracao executados no Supabase de staging;
- 7 verificacoes de seguranca/RLS verdes;
- integracao R1B real de banco passou com update/create/archive, nova versao
  anual, documento da revisao, retry idempotente, bloqueio de mutacao no
  fechamento anual e cleanup;
- `oracle-session`, `oracle-chat`, `whatsapp-webhook` e `whatsapp-worker`
  publicadas no staging;
- lint, build e bundle inicial de 135,1 KB gzip verdes;
- regressao do PDF e do reenvio coberta;
- PDF A4 renderizado e inspecionado visualmente sem corte, sobreposicao ou
  pagina vazia;
- previa web, WhatsApp, documento e PDF alinhados;
- nenhum dado real foi alterado e nenhuma chamada paga de IA foi feita.

Pendente:

- CI, merge e release protegido;
- verificacao pos-deploy;
- reteste real do owner com uma unica confirmacao;
- confirmar no WhatsApp o PDF completo e o reenvio sem nova pergunta de area.

## Progresso

Esta e uma correcao dentro da R1B e nao cria pontos extras.

- Plano geral: 52,5%;
- Plano 4: 50%;
- R1B permanece pendente ate o reteste real e a aprovacao do owner.
