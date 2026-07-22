# Equilibrio da IA F2 - resultado no staging

Data: 2026-07-22

Status: **GATE TECNICO APROVADO NO STAGING - QUALIDADE GLOBAL SERA AVALIADA NA PRATICA**

## Resumo funcional

A F2 manteve as deteccoes deterministas de pendencia herdada, capacidade e
fechamento, mas deixou de usar esses atalhos para substituir a resposta do
Oraculo por frases prontas. O servidor entrega ao modelo uma situacao segura,
com fatos canonicos e a decisao pendente; o modelo produz a fala visivel.

O servidor continua autoridade de estado, fase, IDs, periodo, escopo, proposta,
confirmacao, transacao e gravacao. A resposta livre do modelo nao pode alterar
esses campos. Para rollback e limpeza posterior, os envelopes antigos foram
preservados sem uso no caminho novo ate a F5.

## Implementacao

- criado `_shared/planning-situation.ts`, com contrato `kind`, `facts` e
  `decision` para o prompt e aplicacao server-side da estrutura canonica;
- convertidas seis deteccoes de `monthly-ready-block.ts` e `close-quality.ts`
  para situacoes, mantendo wrappers legados temporarios;
- `session-engine.ts` detecta a situacao, chama o modelo e sobrescreve
  `state_patch`, `next_phase`, `proposal` e `done` com a decisao do servidor;
- telemetria recebe somente o identificador e a contagem da situacao, nunca
  fala, documento, prompt ou fatos privados;
- testes passaram a validar situacao e contrato, sem depender de frase literal;
- o fechamento mensal absorve um bloco completo de fatos, sintetiza e pede uma
  unica confirmacao, sem criar uma passagem burocratica pelo pulso.

## Evidencias tecnicas

- unitarios: 574/574;
- lint, build, bundle de 135,1 KB gzip, secret scan e `git diff --check` verdes;
- integracao no Supabase de staging: 31 arquivos executados, com todos os gates
  aplicaveis verdes e os testes pagos/worker opt-in pulados por padrao;
- publicadas somente no staging: `oracle-session`, `oracle-chat`,
  `whatsapp-webhook` e `whatsapp-worker`;
- sem migration, frontend, dado real ou alteracao de producao;
- empresa, usuario e chave descartaveis removidos ao final de cada piloto.

## Piloto de fechamento mensal parcial

O caso sintetico fechou junho em 50%, abaixo da meta de 60%, partindo de 40%.
Duas acoes estavam concluidas; a terceira dependia de fornecedor e precisava
ser renegociada. A rodada final produziu:

> Fechamento parcial: 50% contra meta de 60%. Duas acoes concluidas. Para a
> integracao externa, qual o novo prazo?

Depois da decisao do gestor, o Oraculo sintetizou resultado, meta, pendencia,
novo prazo, aprendizado, confianca, bloqueio e compromisso e pediu uma unica
confirmacao. Banco, documento e WhatsApp preservaram os mesmos fatos.

Foram feitas tres medicoes para tratar uma oscilacao real do modelo:

| Rodada | Resultado | Conducao | Fechamento | Saida | Media | Custo |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Qualidade aprovada; teste local exigia frase/campo incorretos | 100,00 | 100,00 | 81,25 | 93,75 | US$ 0,043842 |
| 2 | Qualidade bloqueada; sintese criou etapa e referencias desnecessarias | 71,25 | 97,50 | 81,25 efetivo | 83,33 | US$ 0,038352 |
| 3 | Aprovada depois do ajuste de completude e fatos canonicos | 96,25 | 100,00 | 81,25 | 92,50 | US$ 0,033209 |

Na terceira rodada:

- geracao: US$ 0,016385;
- judge: US$ 0,016824;
- total: US$ 0,033209;
- acumulado historico: US$ 17,440356 -> US$ 17,473565;
- custo total das tres medicoes F2: US$ 0,115403;
- consumo do ciclo atual, incluindo F1: US$ 0,120754 de US$ 20.

O owner decidiu que uma pergunta sintetica nao mede toda a conducao. Assim, o
gate tecnico da F2 esta aprovado e seu peso interno e contabilizado, enquanto a
qualidade global continua reservada para a conversa pratica antes da R1B.
Producao permanece intacta.

## Proximo gate

Apresentar o briefing da F3, que transforma heuristicas de estilo em observacao
sanitizada sem relaxar validadores de dados. A F3 nao pode ser executada nem
publicada sem autorizacao explicita do owner.

Rollback: voltar a consumir os envelopes legados e republicar as mesmas quatro
Functions. Nao existe migration para desfazer.
