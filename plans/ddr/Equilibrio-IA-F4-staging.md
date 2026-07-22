# DDR - Equilibrio IA F4 no staging

Data: 2026-07-22

Status: **APROVADA TECNICAMENTE NO STAGING; PRODUCAO PENDENTE DE AUTORIZACAO**

## Decisao

Separar a fala visivel da estrutura de gravacao nas sessoes de planejamento:

1. `planning` responde somente em prosa natural;
2. `background` extrai `state_patch`, `next_phase`, `proposal` e `done`;
3. o servidor aplica os mesmos normalizadores e validadores existentes;
4. nenhuma proposta e gravada sem a confirmacao unica ja exigida;
5. uma lease por sessao impede dois turnos de atualizarem o mesmo estado;
6. a revisao otimista recusa uma resposta atrasada em vez de sobrescrever fatos;
7. a mudanca e ligada por empresa em `prose_split_enabled`, desligada por padrao.

O principio continua sendo: **a IA possui a fala; o servidor possui a gravacao**.

## O que muda para o gestor

Quando a flag estiver ligada para a empresa piloto, a resposta deixa de ser
obrigada a nascer dentro do envelope JSON. A expectativa e uma conversa mais
natural, sem abrir mao da proposta estruturada, da conferencia e da confirmacao.

Nao ha novo clique, tela ou etapa. Com a flag desligada, o comportamento anterior
permanece integralmente ativo.

## Implementacao

- migration `20260722180000_prose_split_sessions.sql`:
  - adiciona `ai_control_policies.prose_split_enabled`, default `false`;
  - adiciona `planning_sessions.revision`, `processing_token` e
    `processing_expires_at`;
  - cria RPCs service-only para adquirir e liberar o turno de uma sessao;
- `session-extract.ts` define o schema sem `reply`, limita o contexto enviado e
  valida estritamente a estrutura recebida;
- `session-engine.ts` mantem o caminho legado quando a flag esta desligada e,
  quando ligada, executa fala, extracao e um unico retry logico de extracao;
- falha persistente do extrator devolve uma resposta recuperavel e nao atualiza
  fase, estado ou proposta;
- o extrator recebe o contrato estrutural do ritual ativo, inclusive o formato
  canonico da proposta, sem controlar a fala visivel;
- backup restaurado nunca religa a flag experimental nem reaproveita lease;
- `save-ai-control-policy` preserva a flag quando o campo nao e enviado e aceita
  alteracao apenas pelo endpoint autenticado de owner;
- telemetria registra funcao, tentativa, codigos, custo e latencia, sem fala,
  prompt, documento, telefone ou contexto.

## Incidente encontrado pelo piloto

A primeira rodada trimestral ficou em 12/15. A fala era natural e os cenarios
vago/anti-loop passaram, mas o extrator generico nao conhecia o formato completo
de `save_quarterly_plan`; depois de duas estruturas recusadas, o servidor usou o
fallback seguro e nao gravou nada.

A correcao entregou ao `background` o contrato do ritual apenas como referencia
estrutural. O reteste exclusivo do caso falho passou 6/6. Depois disso, a rodada
geral trimestral passou 15/15.

## Gates

- 586/586 testes unitarios;
- 32/32 arquivos de integracao coletados, com tres skips opt-in esperados;
- 7/7 verificacoes de seguranca;
- lint, build e bundle inicial de 135,1 KB gzip verdes;
- flag default off e escrita direta pelo navegador recusada;
- duas aquisicoes concorrentes de lease produzem um unico vencedor;
- revisao antiga nao sobrescreve estado novo;
- atualizacao rapida pelo WhatsApp preservada: 5/5 controles direcionados;
- plano mensal F4: proposta unica, cinco acoes, backlog, confianca, vinculo,
  confirmacao, banco e documento coerentes;
- fechamento mensal final: conducao 86,25; fechamento 100; saida 91,25; media
  92,50; zero falha critica;
- cleanup de todas as organizacoes e usuarios descartaveis concluido.

## Custo e latencia

O custo total da F4 foi **US$ 0,211855**, incluindo a rodada bloqueada, a
correcao, os retestes seletivos e a repeticao geral final. O consumo estimado do
ciclo atual passou a **US$ 0,410834 de US$ 20**, abaixo do aviso de US$ 15.

Na rodada geral mensal houve quatro chamadas (duas `planning`, duas
`background`), zero reparos, US$ 0,020969 e 25,253 s somados na metrica de
latencia observada. A jornada completa, incluindo setup, gravacao e cleanup,
durou 76,54 s. A latencia adicional e o principal trade-off a observar na R1B.

## Staging e rollback

A migration e seis Functions afetadas foram publicadas somente no projeto de
staging `bijbdsvejdzhpgyiykpi`. O frontend e a producao nao foram publicados.

O staging possuia cinco migrations historicas locais sem registro remoto. Para
nao aplicar escopo antigo junto da F4, somente `20260722180000` foi executada e
registrada pela Management API. Nao usar `db push` nesse staging antes de
reconciliar conscientemente essas cinco versoes.

Rollback funcional: enviar `proseSplitEnabled=false` pelo endpoint owner-only.
Isso volta imediatamente ao envelope legado sem deploy ou perda de dados. A
migration e aditiva e nao precisa ser removida para desativar o experimento.

## Progresso e proximo gate

O subplano Equilibrio da IA passa de 65% para **90%**. O plano geral permanece
em 52,5% e o Plano 4 em 50%, pois a F4 e uma correcao interna da R1.

O merge/release posterior foi autorizado e concluido com a flag desligada. A
rastreabilidade de producao esta em `plans/ddr/Equilibrio-IA-F4-producao.md`.
O proximo passo e aprovar a ativacao somente na empresa piloto para a R1B real.
A F5 continua depois do piloto e do periodo de observacao.
