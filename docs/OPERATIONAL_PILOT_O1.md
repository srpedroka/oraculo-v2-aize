# Piloto operacional O1

Data: 2026-07-18

Estado do gate: **nao iniciado oficialmente**

## Ensaio anterior

Antes da O1 oficial houve um ensaio descartavel de planejamento trimestral com o
owner. O conteudo empresarial desse ensaio nao foi aprovado como plano, nao deve
ser usado como baseline e nao pode alimentar retomadas futuras.

O ensaio encontrou dois defeitos tecnicos reais:

1. uma sessao podia continuar vinculada a um episodio de conversa arquivado,
   deixando mensagem e resposta invisiveis no painel;
2. uma rejeicao HTTP da confirmacao podia deixar o botao em estado de gravacao
   permanente, sem mostrar o erro recuperavel.

As correcoes foram publicadas nos merges `9f8287a` e `214faf0`. Elas preservam
o estado valido da sessao, religam apenas o episodio quando necessario e exibem a
falha de confirmacao com possibilidade de nova tentativa segura. A PR #13, que
tratava uma recuperacao especifica do ensaio, foi fechada sem merge e sem deploy.

## Limpeza concluida

Em 2026-07-18 foi executada uma transacao restrita a organizacao oficial, com IDs
exatos e verificacoes antes do commit. Foram removidos:

- 2 sessoes descartaveis;
- 2 conversas e 122 mensagens do ensaio;
- 2 objetivos arquivados de teste;
- 1 acao, 1 projeto e 2 documentos gerados pelo ensaio;
- revisoes e eventos administrativos ligados exclusivamente a esses IDs.

Foram preservados e verificados dentro da mesma transacao:

- 1 Plano Estrategico Anual oficial;
- 30 documentos historicos;
- 7 objetivos oficiais nao pertencentes ao ensaio;
- o projeto oficial ligado ao Plano Estrategico Anual;
- logs tecnicos de custo e seguranca, sem conteudo operacional reutilizavel.

Os fingerprints do plano anual, dos objetivos preservados e dos documentos
preservados permaneceram identicos. Depois do commit da transacao, todas as
contagens dos IDs descartaveis ficaram em zero.

## Custo

- ensaio tecnico anterior: US$ 0,023930;
- teste de WhatsApp O0 no ciclo atual: US$ 0,001535;
- limpeza e documentacao: US$ 0;
- acumulado do ciclo: US$ 0,025465 de US$ 20.

## Proximo gate

A O1 oficial nao reutilizara area, periodo, responsavel, objetivo ou proposta do
ensaio. Antes dela deve ser executado o plano
`plans/2026-07-18-pre-piloto-design-revisao-anual.md`: diagnostico e ajuste de
design, revisao real e controlada de um objetivo anual escolhido pelo owner e
ensaio assistido de usabilidade em clone isolado.

Somente depois desses gates o owner escolhera explicitamente o objetivo anual,
a area e o periodo da O1 oficial.
