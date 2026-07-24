# R1B - Ponte entre revisao e Plano Estrategico Anual

Data: 2026-07-24

Status: **PUBLICADA EM PRODUCAO; AGUARDA RETESTE REAL**

## Problema

A revisao semestral e o Plano Estrategico Anual sao documentos diferentes por
uma razao correta: o primeiro registra a leitura e as decisoes do semestre; o
segundo representa a direcao anual vigente. A tela, porem, mostrava apenas
`Revisar plano anual`, que abria uma nova sessao generica e nao selecionava a
revisao ja aprovada.

Na pratica, o owner via a revisao completa em Documentos, mas nao tinha um
caminho claro para incorporar suas decisoes ao plano vigente.

## Decisao funcional

- manter revisao e plano como documentos separados e auditaveis;
- mostrar na tela a linhagem `Plano de origem -> Revisao -> Plano atualizado`;
- quando a revisao de meio do ano estiver salva e ainda nao aplicada, trocar a
  acao por `Atualizar Plano {ano} com a revisao`;
- iniciar a sessao com o ID exato da revisao, sem repetir o diagnostico do
  semestre;
- comparar o documento aprovado com o plano vigente e perguntar apenas sobre
  uma decisao realmente ambigua;
- mostrar manter, atualizar, criar e retirar antes de gravar;
- usar uma unica confirmacao para aplicar a mudanca e gerar a nova versao
  canonica do Plano Estrategico;
- no fechamento anual, preservar o ano encerrado e manter o fluxo separado de
  preparacao do proximo plano.

## Autoridade e seguranca

- a revisao selecionada precisa ser `strategic_review`, da mesma empresa, sem
  area, ativa e do mesmo ano;
- documento de outra empresa, outro ano, fechamento anual ou revisao ja
  aplicada e recusado;
- o conteudo integral entra como contexto delimitado e nao confiavel;
- a IA conduz e monta a proposta, mas o servidor exige
  `annual_plan_update.mode = update_current_year` e mudancas explicitas;
- uma tentativa de preservar novamente ou marcar atualizacao sem diff e
  recusada antes de virar proposta pendente;
- `proposals.ts` repete a exigencia dentro da confirmacao transacional;
- nenhuma tabela ou migration nova;
- nenhum dado real e alterado pelo deploy ou pelos testes.

## Interface

A tela de Plano Estrategico passa a mostrar:

1. documento anual de origem e versao;
2. revisao registrada e versao;
3. `Atualizacao pendente` ou o documento anual resultante e sua versao.

Depois da confirmacao, a invalidacao de consultas recarrega plano, objetivos,
documentos e sessoes, fazendo a linhagem apontar para a nova versao.

## Testes

- helper de linhagem: revisao preservada, revisao aplicada e fechamento anual;
- launcher: ID da revisao e intencao chegam intactos ao backend;
- helper server-side: contexto, abertura, modo obrigatorio e diff;
- integracao descartavel: empresa/ano/documento corretos, mensagem contextual e
  recusas de escopo;
- suite completa, lint, build, bundle e CI obrigatorios;
- smoke autenticado em producao antes do reteste real do owner.

## Release

- PR #30 e merge `fc508d0`;
- CI da `main` `30101922305`, com os tres gates verdes;
- `oracle-session` publicada pelo release protegido `30102384560`;
- frontend Netlify `6a637bb588a6e544269cbb75`;
- verificacao read-only protegida `30102788853`;
- smoke autenticado em producao confirmou a linhagem, a revisao correta,
  `Atualizacao pendente` e a acao
  `Atualizar Plano 2026 com a revisao`, sem iniciar sessao ou gravar dados;
- nenhuma migration, chamada paga de IA, compra ou mutacao do plano real.

## Progresso

Esta e uma correcao dentro da R1B e nao cria pontos extras.

- Plano geral: 52,5%;
- Plano 4: 50%;
- R1B so passa a 100% depois do reteste real e da aprovacao do owner.
