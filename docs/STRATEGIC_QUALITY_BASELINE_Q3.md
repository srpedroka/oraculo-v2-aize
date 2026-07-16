# Baseline de qualidade estrategica - Q3

Data: 2026-07-16

Status: **baseline executada; gate automatico reprovado; revisao humana qualitativa concluida**

## Escopo

A Q3 mediu a versao atual do Oraculo no Supabase de staging, com organizacoes e usuarios sinteticos removidos depois de cada rodada. Producao, WhatsApp real, frontend, banco e Edge Functions nao foram alterados nem publicados.

- 20 casos generativos executados duas vezes: 40 rodadas.
- 39 medicoes completas e 1 erro tecnico de `oracle-session`.
- 9 casos deterministas executados uma vez.
- Grok 4.3 como condutor e Grok 4.5 como judge somente leitura.
- Nenhuma resposta foi descartada para melhorar a nota.

Uma primeira calibracao com 10 rodadas revelou que o catalogo dizia que campos estavam completos sem fornecer seus valores ao gestor sintetico. Essas rodadas, mais uma tentativa tecnica interrompida, foram preservadas como calibracao; o teste oficial recebeu dados sinteticos concretos e versionados. Nenhum custo foi apagado.

## Resultado

| Rubrica | Rodadas | Media | Minimo | Maximo | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| Plano Anual | 9 | 96,25 | 93,75 | 100,00 | aprovado na entrega |
| Conducao | 39 | 44,97 | 5,00 | 81,25 | reprovado |
| Saida derivada | 12 | 51,15 | 0,00 | 86,25 | reprovado |
| Plano Trimestral | 16 | 31,56 | 0,00 | 95,00 | reprovado |
| Plano Mensal | 8 | 7,19 | 0,00 | 57,50 | reprovado |
| Revisao e Fechamento | 6 | 75,63 | 41,25 | 93,75 | reprovado |

Media conjunta observada: **51,13**, abaixo do gate de 85. Cada rubrica tambem precisa atingir 80.

O contraste principal e objetivo: quando o Plano Anual chega a proposta, a entrega e forte; a conducao ainda e rigida e o desdobramento inferior frequentemente nao conclui o estado da sessao.

## Checagens objetivas

- Plano Anual: 9/10 rodadas geraram proposta; as 9 confirmacoes finais passaram.
- Plano Trimestral: 6/16 geraram proposta; 5 confirmacoes passaram e 1 rodada repetiu a confirmacao.
- Plano Mensal: 1/8 gerou proposta e confirmou corretamente.
- Revisoes/fechamentos: 5/6 geraram proposta e confirmaram corretamente.
- 19/40 rodadas nao chegaram a proposta mesmo depois de o gestor fornecer os fatos completos.
- Uma rodada anual falhou tecnicamente; a segunda rodada do mesmo caso respondeu, mostrando variabilidade.

Os candidatos do judge ainda exigem validacao humana: fabricacao (11), alinhamento (4), nivel errado (3), escopo errado (3), verificabilidade (3) e atividade aceita como objetivo (1). Eles nao sao tratados como vereditos humanos automaticos.

## Casos deterministas

Passaram: atualizacao rapida ambigua, pulso semanal/deduplicacao, importacao historica, conflito de KPI, memoria relevante, saidas canonicas, Dashboard numerico e arquivo/auditoria.

O E2E de recuperacao de erro passou em desktop e mobile, sem overflow e sem violacoes criticas/graves de acessibilidade. A UX permanece no gate humano para avaliar composicao e naturalidade, nao integridade tecnica.

## Causas priorizadas para Q4

1. **Estado da sessao:** progressao por fases nao absorve bem blocos completos; e a causa dominante das 19 propostas ausentes.
2. **Conducao/prompt:** repete perguntas, explora pouco trade-off e nem sempre reconhece informacao ja fornecida.
3. **Roteamento/alinhamento:** candidatos a troca de nivel, escopo e vinculo incorreto precisam de verificacao humana e guardas deterministas.
4. **Validacao final:** proteger a unica confirmacao e impedir proposta incompleta antes de gravar.
5. **Confiabilidade:** diagnosticar o erro generico de `oracle-session` e reduzir variabilidade entre rodadas equivalentes.

## Revisao humana do owner

O owner confirmou em 2026-07-16 que a conducao e o principal defeito. A conversa precisa se adaptar tanto ao gestor que entrega um bloco completo quanto ao gestor que responde pouco. Quando faltar informacao, a proxima pergunta deve partir da resposta anterior, abrir duas ou tres possibilidades concretas e sempre aproximar a conversa de uma decisao ou acao executavel.

O tom desejado e casual, tranquilo e objetivo, sem parecer entrevista, formulario ou consultoria excessivamente formal. O owner tambem priorizou a recuperacao dos planos trimestrais e mensais, a avaliacao das saidas derivadas e um polimento menor em revisoes e fechamentos. Nenhuma nota humana numerica foi inferida.

A evidencia separa causa e efeito:

- somente 6/16 rodadas trimestrais chegaram a proposta; quando chegaram, a nota media do plano foi 84,17;
- somente 1/8 rodadas mensais chegou a proposta; portanto, a nota 7,19 e dominada pela falha de progressao da conversa;
- 4/12 saidas derivadas receberam zero porque nenhuma proposta existiu; entre as oito com proposta, a media foi 76,72;
- entre os cinco fechamentos/revisoes que chegaram a proposta, a media foi 82,50.

Assim, a Q4 deve corrigir primeiro estado e conducao, depois lacunas especificas dos planos e das saidas. O briefing funcional esta em `docs/STRATEGIC_QUALITY_CORRECTIONS_Q4.md` e ainda precisa de aprovacao antes de alterar runtime.

## Custo

- Acumulado antes da Q3: US$ 0,437777.
- Geracao oficial: US$ 0,760501.
- Judge oficial: US$ 0,464974.
- Baseline oficial: US$ 1,225475.
- Calibracao preservada: US$ 0,287393.
- Incremento total da Q3: **US$ 1,512869**.
- Acumulado final do plano: **US$ 1,950646 de US$ 20**.

Nenhuma compra, recarga, assinatura ou deploy foi feito.

## Evidencia privada

Transcricoes e propostas sanitizadas ficam fora do Git em `.agents-private/`. O pacote cego para o owner e `.agents-private/strategic-q3-human-review.md`; ele omite notas e falhas do judge. O resumo estruturado e `.agents-private/strategic-q3-baseline-summary.json`.
