# DDR - Equilibrio IA F4 em producao

Data: 2026-07-22

Status: **PUBLICADA COM FLAG DESLIGADA**

## Decisao

O owner autorizou o merge e o release da F4 depois da aprovacao integral no
staging. O pacote F1-F4 entrou em producao, mas `prose_split_enabled` continua
`false` por padrao. Portanto, nenhuma empresa mudou automaticamente de
conducao; a ativacao seguinte sera somente na empresa piloto antes da R1B.

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

## Proximo gate

Apresentar o briefing da ativacao piloto. Depois de autorizada, ligar a flag
somente na empresa real do owner, executar a R1B com Plano Anual e evidencias
de T1/T2 e avaliar a conversa e o pacote antes da confirmacao unica. A F5 fica
depois do piloto e do periodo de observacao.
