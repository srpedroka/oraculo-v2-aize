# Equilibrio da IA F3 - resultado no staging

Data: 2026-07-22

Status: **GATE APROVADO NO STAGING - PRODUCAO INTACTA**

## Resumo funcional

A F3 deixou de pedir uma segunda resposta ao modelo quando o unico problema e
de estilo. Pergunta parecida, bordao, excesso de frases e outras heuristicas de
forma continuam visiveis na telemetria, mas nao atrasam a conversa nem duplicam
o custo. JSON, estado, escopo, periodo, proposta, confirmacao e gravacao seguem
fechados e podem disparar o unico reparo controlado.

## Implementacao

- `session-adaptive.ts` exporta `DATA_REPAIR_REASONS` e
  `STYLE_OBSERVATION_REASONS`;
- `partitionAdaptiveValidationReasons` trata motivo desconhecido como dado,
  mantendo o comportamento fail-closed;
- `done_without_confirmation` impede que planejamento seja encerrado antes da
  confirmacao server-side;
- `session-engine.ts` valida a primeira resposta antes de registrar o uso e so
  chama a tentativa 2 quando existem motivos de dado;
- a recuperacao depois da tentativa 2 tambem ignora estilo e continua agindo
  sobre defeitos estruturais;
- `ai_usage_logs.metadata` recebe somente codigos, contagem, ritual, canal,
  funcao e latencia da observacao. Nao recebe fala, prompt, mensagem, contexto,
  documento ou telefone;
- o laboratorio passou a consolidar observacoes e latencia nos proximos
  relatorios e o RUNBOOK ganhou a consulta semanal das quatro semanas.

## Gates tecnicos

- testes unitarios: 578/578;
- teste focal de `session-adaptive`: 80/80;
- lint, build, bundle inicial de 135,1 KB gzip e `git diff --check`: verdes;
- integracao: 31 arquivos coletados, todos os gates aplicaveis verdes; o teste
  concorrente de contadores oscilou uma vez na leitura imediata e passou na
  repeticao isolada e na segunda suite completa;
- publicadas somente no staging: `oracle-session`, `oracle-chat`,
  `whatsapp-webhook` e `whatsapp-worker`;
- sem migration, frontend, dado real ou alteracao em producao.

## Pilotos e baseline

O piloto mensal opt-in fez dois turnos reais com duas chamadas, nenhum reparo,
nenhuma observacao de estilo, 23.803 ms somados de modelo e US$ 0,011505.

O smoke Q4W repetiu exatamente o fechamento mensal parcial usado na F2:

| Medida | F2 | F3 aprovada | Variacao |
| --- | ---: | ---: | ---: |
| Turnos do modelo | 3 | 3 | igual |
| Chamadas | 5 | 3 | -40% |
| Tentativas 2 | 2 | 0 | -100% |
| Reparos `verbose_regular_turn` | 2 | 0 | -100% |
| Custo de geracao | US$ 0,027006 | US$ 0,016164 | -40,1% |
| Tempo total com judge/cleanup | 174,043 s | 165,804 s | -4,7% |
| Nota conjunta | 93,75 | 95,00 | +1,25 |

A primeira rodada F3 do Q4W custou US$ 0,033188 e foi bloqueada pelo judge em
saida derivada. A proposta e o produto estavam corretos: baseline 40%, atingido
50% e meta 60%. O avaliador confundiu o campo legado `objetivos[].atual`, que
representa baseline no documento, com o valor atingido. A rodada F2 anterior ja
registrava a mesma confusao com nota menos severa. A instrucao do judge foi
alinhada ao schema real, sem alterar produto ou rubrica; a repeticao passou com
96,25 em conducao, 100 em fechamento, 88,75 em saida e media 95.

## Custo e limpeza

- piloto mensal: US$ 0,011505;
- Q4W diagnostico: US$ 0,033188;
- Q4W final: US$ 0,033532;
- total F3: US$ 0,078225;
- acumulado operacional estimado: US$ 17,551790;
- consumo estimado do ciclo: US$ 0,198979 de US$ 20;
- empresas, usuarios e chaves descartaveis removidos em todas as rodadas.

## Proximo gate

Apresentar o briefing da F4. Ela separa prosa e estrutura sob flag por empresa,
desligada por padrao, sem publicar em producao antes de nova autorizacao.

Rollback F3: voltar a usar todos os motivos como causa de reparo e republicar
as mesmas quatro Functions. Nao existe migration ou frontend para desfazer.
