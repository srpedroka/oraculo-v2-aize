# DDR - Equilibrio IA F4 em producao

Data: 2026-07-22

Status: **PUBLICADA E ATIVA NA EMPRESA REAL DO OWNER**

## Decisao

O owner autorizou o merge e o release da F4 depois da aprovacao integral no
staging. O pacote F1-F4 entrou em producao, mas `prose_split_enabled` continua
`false` por padrao. Portanto, nenhuma empresa mudou automaticamente de
conducao; a ativacao seguinte sera somente na empresa piloto antes da R1B.

Em 2026-07-23, o owner autorizou explicitamente a ativacao integral em producao,
sem limitar o uso ao ritual de revisao. A flag foi ligada na unica empresa
acessivel ao owner, Gaam/Aize, para todas as sessoes estruturadas no app e no
WhatsApp. A seguranca de autenticacao, escopo, proposta, confirmacao,
idempotencia e gravacao server-side permanece igual.

## Rastreabilidade

- pacote F1-F4 na `main`: PR #21, merge `4402b29`;
- correcao aditiva e estabilizacao do CI: PR #25, merge `c7a5e14`;
- CI final da `main`: `29965071770`, tres gates verdes;
- primeiro release de migration: `29964088183`, bloqueado no preflight antes
  de segredos ou escrita por detectar um `DROP CONSTRAINT` de idempotencia;
- migration puramente aditiva: release `29965389449`, aplicado e verificado;
- Functions: release `29965501405`, publicado e verificado.

Functions publicadas: `oracle-session`, `oracle-chat`, `whatsapp-webhook`,
`whatsapp-worker`, `save-ai-control-policy` e `operational-health`.

Nao houve deploy do frontend. Nao houve compra, chamada adicional de IA nem
custo novo neste release. O custo aprovado da F4 permanece US$ 0,21185525 e o
consumo estimado do ciclo permanece US$ 0,410834 de US$ 20.

## Seguranca e rollback

O guard destrutivo funcionou como desenhado e nenhuma excecao foi concedida. A
migration final apenas cria a constraint quando ausente. O rollback funcional
continua sendo `proseSplitEnabled=false`; nao exige remover schema nem publicar
novamente.

## Rollout integral em 2026-07-23

- backup manual criado antes da ativacao e verificado interna e externamente:
  `23/07/2026 06:44`, 612 registros e 104 KB;
- inventario confirmou uma unica empresa acessivel ao owner, Gaam/Aize;
- `prose_split_enabled=true` foi materializado em `ai_control_policies`;
- os defaults efetivos foram preservados: 10 chamadas por pessoa/minuto, 60
  por empresa/minuto, orcamento mensal de US$ 100 e modo `monitor`;
- evento administrativo sanitizado `prose_split_rollout_enabled` foi gravado
  com request id `manual:prose-split-rollout:2026-07-23`;
- `planning` com OpenAI `gpt-5.4` foi validado as 06:48;
- `background` com xAI/Grok `grok-4.3` foi validado as 06:47;
- WhatsApp permaneceu conectado e operando, com webhook confirmado por trafego,
  fila zerada, zero falha recente e nenhum alerta ativo;
- a revisao semestral real ja em andamento foi preservada e nao recebeu
  mensagem, mutacao ou dado de teste;
- nao houve migration, deploy de Function ou frontend neste rollout, pois o
  codigo ja estava em producao;
- as validacoes de modelo nao produziram linha nova em `ai_usage_logs`;
  portanto, nao ha custo incremental registrado para informar.

## Proximo gate

O owner executa a R1B real com Plano Anual e evidencias de T1/T2 e testa, na
pratica, os planos trimestrais, mensais e fechamentos. A conversa e o pacote
canonico devem ser avaliados antes da confirmacao unica. A F5 fica depois
dessa validacao e do periodo de observacao.
