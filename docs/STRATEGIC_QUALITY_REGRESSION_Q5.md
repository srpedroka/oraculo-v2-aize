# Regressao estrategica Q5

Data: 2026-07-17  
Ambiente: staging `bijbdsvejdzhpgyiykpi`  
Status: **Q5A e Q5B completas; Q5C com 4 aprovacoes; Q4V aprovada e retomada incremental preparada**

## Objetivo

Repetir exatamente as 40 rodadas generativas e os nove casos deterministas da Q3 depois das correcoes Q4, usando Grok 4.3 como condutor e Grok 4.5 como judge. A aprovacao exige zero falha critica, todas as notas aplicaveis a partir de 80, media conjunta a partir de 85, cobertura das 15 entregas, regressao maxima de cinco pontos por dimensao, mediana de turnos ate 25% maior e custo acumulado abaixo de US$ 20.

## Preparacao

- O runner passou a isolar progresso, relatorios e idempotencia da Q5 sem sobrescrever a Q3.
- A baseline Q3 foi conferida com 40 combinacoes unicas; a falha tecnica historica continua preservada como parte do antes.
- Os modelos da Q5 conferem com os modelos registrados na Q3.
- O preflight confirmou staging acessivel e nenhuma organizacao sintetica pendente.
- A matriz determinista terminou com oito `pass`, um `pending-human` de UX e zero `fail`.

## Resultado da tentativa

A execucao foi interrompida automaticamente no segundo de 40 casos pagos. Continuar consumindo IA nao mudaria o gate ja reprovado e esconderia dois defeitos objetivos.

### Q2A-ANNUAL-VAGUE-ASPIRATION-001 R1

- execucao e cleanup: aprovados;
- falha critica: nenhuma;
- Plano Anual: **96,25**;
- Conducao: **57,50**, abaixo do minimo 80;
- causa apontada pelo judge: diagnostico curto e sem desafio; a entrega ficou forte porque o gestor sintetico forneceu o plano completo, nao porque a conducao ajudou a construir ou testar as decisoes;
- custo de geracao: US$ 0,032928;
- custo do judge: US$ 0,014442;
- total: US$ 0,047369.

### Q2A-ANNUAL-VAGUE-ASPIRATION-001 R2

- a sessao recebeu o bloco completo de fatos e falhou na chamada seguinte com `400/INTERNAL_ERROR`;
- nenhuma proposta foi criada e o judge nao foi chamado;
- a organizacao, o usuario e a chave descartavel foram removidos;
- custo de geracao antes da falha: US$ 0,015293.

Os logs sanitizados do staging confirmaram `oracle-session`, operacao `message`, duracao aproximada de 28 segundos e `INTERNAL_ERROR`. O sistema nao registra prompt, resposta do provedor ou segredo nos logs, portanto o codigo atual ainda nao distingue rejeicao do provedor, envelope invalido apos reparo ou outra falha interna segura.

## Custo e residuos

| Item | Valor |
|---|---:|
| Geracao Q5 | US$ 0,048220 |
| Judge Q5 | US$ 0,014442 |
| Total Q5 | US$ 0,062662 |
| Acumulado antes | US$ 2,890842 |
| Acumulado depois | US$ 2,953504 |
| Limite autorizado | US$ 20,00 |

O preflight final confirmou zero organizacao sintetica pendente. Producao, Netlify, banco real, WhatsApp real e Evolution nao foram alterados.

## Retorno focado ao Q4

Antes de repetir a Q5:

1. corrigir a conducao anual vaga para explorar a tensao real entre crescimento, margem e capacidade, com uma pergunta curta que ajude o gestor a escolher ou desafiar uma prioridade;
2. evitar menus genericos como resultado/prazo/responsavel/acao quando os fatos ja apontam uma decisao estrategica mais util;
3. classificar a falha interna de IA com codigo tecnico sanitizado, sem expor resposta do provedor;
4. definir retry somente para falha comprovadamente transitoria e manter falha fechada para envelope ou validacao;
5. reproduzir os dois cenarios em smoke descartavel no staging, com custo, ausencia de gravacao prematura e cleanup;
6. reiniciar a Q5 inteira somente depois desses checks passarem.

Os dois artefatos pagos permanecem privados em `.agents-private`, junto com o ledger. Eles nao devem ser apagados nem promovidos a resultado aprovado.

## Tentativa corretiva Q4G

Em 2026-07-17, a correcao Q4G foi implementada e publicada **somente no staging**:

- a abertura anual vaga passou a oferecer caminhos contextuais de receita, margem e capacidade, em vez do menu generico de campos;
- timeout, indisponibilidade e rate limit do provedor passaram a ter codigos sanitizados e uma unica repeticao; rejeicoes de validacao, autenticacao, modelo ou formato nao repetem;
- 358 testes unitarios, 39 testes do padrao estrategico, lint, build/orcamento e secret scan passaram localmente;
- somente `oracle-session` foi publicada no staging; producao, frontend, banco e WhatsApp real nao foram alterados.

O smoke pago repetiu exatamente `Q2A-ANNUAL-VAGUE-ASPIRATION-001` R1. As duas respostas iniciais ficaram contextuais, mas a chamada que recebeu o plano anual completo excedeu o timeout de 60 segundos do runner. O retry agora pode se somar a uma segunda chamada de reparo adaptativo, portanto o limite externo terminou primeiro com `This operation was aborted`. Nao houve proposta, confirmacao ou judge; o gate permaneceu bloqueado.

| Item | Valor |
|---|---:|
| Smoke Q4G | US$ 0,032266 |
| Acumulado antes | US$ 2,953504 |
| Acumulado depois | US$ 2,985771 |
| Limite autorizado | US$ 20,00 |

O cleanup final confirmou zero organizacao sintetica pendente e removeu a chave descartavel junto com a empresa. Nao repetir o smoke antes de limitar a repeticao transitoria a **uma por requisicao completa**, considerando tambem a tentativa de reparo adaptativo, e harmonizar esse teto com o timeout externo sem simplesmente ampliar espera para o usuario. A Q5 continua pausada.

### Segunda correcao e smoke

A repeticao passou a usar um unico budget de retry por requisicao, primeira chamada de ate 40 segundos e teto total de 52 segundos. A segunda rodada provou que o cliente nao aborta mais: o servidor encerrou de forma controlada com `400/AI_PROVIDER_TIMEOUT`. Mesmo assim, nao houve proposta ou judge, pois a primeira geracao longa foi seguida por uma tentativa de reparo do envelope e esgotou o tempo seguro.

| Item | Valor |
|---|---:|
| Segundo smoke Q4G | US$ 0,027390 |
| Acumulado antes | US$ 2,985771 |
| Acumulado depois | US$ 3,013161 |
| Limite autorizado | US$ 20,00 |

O cleanup voltou a confirmar zero organizacao sintetica pendente. Nao houve terceira chamada paga.

Naquele momento, uma terceira correcao foi preparada **somente localmente**: quando a proposta completa ja existe e os defeitos sao apenas de estado adaptativo, fase ou texto da confirmacao, o servidor preserva a proposta e normaliza o envelope deterministicamente. Defeitos semanticos ou de conteudo trimestral/mensal continuam no reparo por IA. A versao local passou 361 testes unitarios, lint, build/orcamento e secret scan antes do gate final. Producao permaneceu inalterada e a Q5 continuou pausada.

### Gate final Q4G

Depois de autorizacao explicita, a normalizacao deterministica foi publicada somente no staging e o terceiro smoke repetiu o mesmo caso anual. Resultado:

- Conducao: **85**;
- Plano Anual: **100**;
- media conjunta: **92,50**;
- zero falha critica e dez checks deterministas verdes;
- exatamente um pedido de confirmacao e uma confirmacao enviada;
- zero gravacao antes da confirmacao;
- banco e documento canonico coerentes com a proposta;
- judge somente leitura e cleanup completo.

| Item | Valor |
|---|---:|
| Geracao final Q4G | US$ 0,026826 |
| Judge final Q4G | US$ 0,013666 |
| Terceiro smoke Q4G | US$ 0,040492 |
| Total das tres rodadas Q4G | US$ 0,100148 |
| Acumulado final do plano | US$ 3,053653 |
| Limite autorizado | US$ 20,00 |

O preflight final confirmou zero organizacao sintetica pendente. A Q4G esta aprovada. Producao, Netlify, banco, WhatsApp real e Evolution permaneceram inalterados. A Q5 pode ser reiniciada apenas em um ciclo novo e comparavel, preservando as tentativas anteriores como calibracao e mediante novo briefing/autorizacao paga.

## Q4H e reinicio comparavel

A Q4H ampliou o smoke para os cinco riscos anuais antes de reiniciar a regressao. O runtime passou a:

- transformar receita, margem e capacidade em trade-off explicito, sem repetir o mesmo menu;
- desafiar meta recorrente pelo aprendizado e pela mudanca de abordagem;
- aceitar o bloco completo de um gestor experiente sem entrevista campo a campo;
- explicitar na sintese quando quatro objetivos e quatro projetos ja ocupam a capacidade;
- corrigir deterministicamente apenas a sintese/confirmacao de uma proposta valida, sem regenerar o plano nem criar timeout adicional;
- construir evidencia deterministica das saidas canonicas para o judge.

Depois das rodadas diagnosticas preservadas no ledger, o smoke aprovado passou os cinco casos, sem falha critica, check reprovado ou residuo. Notas minimas observadas: Conducao 88,75, Plano Anual 97,50 e Saida Derivada 100. Custo do smoke aprovado: **US$ 0,263934**; acumulado antes do reinicio Q5: **US$ 4,040358**.

## Resultado Q5A

A Q5 foi reiniciada como baseline `2026-07-17.q5-regression-r3`, preservando 12 medicoes anteriores como calibracao. A matriz determinista passou em oito casos e manteve UX como `pending-human`. As dez rodadas anuais Q5A completaram sem erro tecnico e com cleanup.

| Rubrica | Media | Minimo | Maximo |
|---|---:|---:|---:|
| Plano Anual | 99,75 | 97,50 | 100 |
| Conducao | 94,13 | 85,00 | 100 |
| Saida Derivada | 100 | 100 | 100 |
| Media conjunta | 97,96 | - | - |

Um judge marcou como fabricacao a expressao `plano de 2027`, embora `2027` fosse o periodo canonico informado ao iniciar a sessao. O protocolo passou a enviar `sessionScope` ao avaliador e o unico relatorio afetado foi reavaliado sem regenerar o plano, acessar o banco ou apagar o parecer anterior. O rejudge aprovou o caso e ficou registrado em `judgeHistory`.

| Item | Valor |
|---|---:|
| Geracao Q5A | US$ 0,338124 |
| Judges Q5A, incluindo rejudge | US$ 0,166162 |
| Total Q5A | US$ 0,504286 |
| Acumulado do plano | US$ 4,544644 |
| Limite autorizado | US$ 20,00 |

Gate Q5A: **10/10 medicoes, zero erro tecnico, zero falha critica, zero check reprovado**. Producao, Netlify, banco real, WhatsApp real e Evolution nao participaram deste ciclo.

## Bloqueio Q5B

A Q5B foi autorizada para 16 medicoes trimestrais, mas a primeira rodada de `Q2B-QUARTERLY-VAGUE-PROBLEM-001` bloqueou o gate e encerrou a ampliacao do teste:

| Rubrica | Nota |
|---|---:|
| Conducao | 75,00 |
| Plano Trimestral | 92,50 |
| Media conjunta | 83,75 |

O plano final permaneceu no Comercial/T3, registrou corretamente a excecao por ausencia de plano anual, preservou indicador, baseline, alvo, fonte, prazo, dono, acoes, risco, aprendizado e backlog. Os dez checks deterministas passaram; nao houve falha critica, gravacao prematura, confirmacao duplicada, divergencia ou residuo da rodada medida.

O defeito esta na conducao: depois da abertura vaga `melhorar o Comercial`, o Oraculo ofereceu cedo demais o menu generico `resultado, prazo, responsavel ou primeira acao`, sem explorar dor, causa e impacto. A proposta tambem deixou a cadencia vazia apesar de o bloco confirmado informar revisao e acompanhamento semanais.

O runner atual interrompia automaticamente apenas `execution-error`, nao `qualityGate=blocked`. A execucao foi cancelada manualmente enquanto preparava a segunda rodada. Isso deixou uma unica organizacao sintetica, removida pelo comando restrito `cleanup-stale`; o preflight posterior confirmou zero fixture pendente e acumulado de **US$ 4,578120**. O ledger registrou **US$ 0,033476** para a rodada completa. Como a segunda chamada foi abortada antes de gerar relatorio, eventual custo parcial so pode aparecer no faturamento do provedor e nao foi somado artificialmente ao ledger.

Antes de retomar a Q5B, a correcao focada deve: fazer a primeira pergunta trimestral vaga investigar dor/causa/impacto; aproveitar uma cadencia explicitamente informada sem inventar; e tornar o runner fail-fast tambem para gate de qualidade bloqueado, depois de persistir relatorio, custo e cleanup. Nao iniciar nova rodada paga nem alterar producao sem briefing e autorizacao.

## Correcao Q4I

A Q4I foi implementada e publicada **somente no staging** em 2026-07-17. O runtime trimestral agora:

- transforma uma abertura vaga em caminhos concretos para diagnosticar situacao, causa, impacto e mudanca desejada;
- nao deixa a ausencia de plano anual interromper o diagnostico do problema da area;
- pede causa ou gargalo quando dor e impacto ja estao claros, antes de saltar para alinhamento ou campos operacionais;
- preserva uma cadencia somente quando o gestor informa ao mesmo tempo uma acao de acompanhamento e uma frequencia explicita, evitando inventar rotina a partir de mencoes como "relatorio semanal".

O runner passou a persistir progresso e interromper a fase tanto em erro de execucao quanto em gate de qualidade bloqueado. A parada acontece somente depois de relatorio, custo e cleanup; um rejudge tambem atualiza o estado resumido de qualidade da medicao.

O smoke pago repetiu exatamente `Q2B-QUARTERLY-VAGUE-PROBLEM-001` e passou:

| Rubrica | Nota |
|---|---:|
| Conducao | 96,25 |
| Plano Trimestral | 97,50 |
| Media conjunta | 96,88 |

Foram aprovados os dez checks deterministas, sem falha critica, gravacao prematura, confirmacao duplicada, divergencia ou residuo. A proposta preservou `revisar semanalmente as excecoes ate 30/09/2027` como cadencia explicita.

| Item | Valor |
|---|---:|
| Smoke Q4I | US$ 0,034506 |
| Acumulado antes | US$ 4,578120 |
| Acumulado depois | US$ 4,612626 |
| Limite autorizado | US$ 20,00 |

Depois do preflight limpo, a Q5B foi reiniciada como baseline `2026-07-17.q5-regression-r4`. A tentativa bloqueada continua arquivada para auditoria; as dez medicoes Q5A e a matriz deterministica foram preservadas. Nenhuma nova rodada Q5B foi iniciada. Producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

## Execucao Q5B r4

A nova Q5B foi autorizada e iniciada em 2026-07-17. O fail-fast aprovado na Q4I encerrou a fase na quarta de 16 medicoes, antes de abrir a quinta chamada:

| Caso | Rodada | Conducao | Plano Trimestral | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| Problema trimestral vago | 1 | 100 | 97,50 | aprovada | US$ 0,034386 |
| Problema trimestral vago | 2 | 96,25 | 97,50 | aprovada | US$ 0,040394 |
| CRM como atividade | 1 | 93,75 | 97,50 | aprovada | US$ 0,036889 |
| CRM como atividade | 2 | 86,25 | 90,00 | erro tecnico | US$ 0,042293 |

A conversa e o plano da rodada bloqueada ficaram acima dos limites e nao tiveram candidato de falha critica. O erro ocorreu somente ao confirmar a gravacao: `Plano trimestral exige vinculo anual existente ou excecao explicita`.

O staging possuia plano anual da area, `main_annual_objective_id` e objetivo estrategico vinculados. A proposta confirmou `annualAlignment.status = linked`, `linkedStrategicObjectiveIds` e o titulo correto do objetivo superior, mas devolveu `annualObjectives = []`. O aplicador procurou o pai pelo array da proposta ou pelo titulo e nao usou como fallback final o `main_annual_objective_id` canonico ja salvo em `area_plans`. A primeira rodada do mesmo caso passou porque o modelo repetiu o objetivo em `annualObjectives`; essa redundancia estocastica nao pode ser requisito de integridade.

| Item | Valor |
|---|---:|
| Q5B r4 executada | US$ 0,153962 |
| Acumulado antes | US$ 4,612626 |
| Acumulado depois | US$ 4,766588 |
| Limite autorizado | US$ 20,00 |

O cleanup da rodada bloqueada removeu empresa, usuario e chave descartavel; o preflight posterior confirmou zero organizacao de avaliacao pendente. Nao houve repeticao paga. A proxima correcao deve resolver o pai anual existente por ID canonico validado na mesma empresa/area/ano, sem criar objetivo, inventar vinculo ou acrescentar pergunta ao gestor. Depois disso, um smoke isolado deve repetir somente `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002` antes de reiniciar a Q5B.

## Correcao tecnica Q4J

A Q4J implementou o fallback canonico sem alterar a conversa. O pai anual existente so pode ser reutilizado quando:

- o ID vem de `area_plans.main_annual_objective_id` da mesma area e ano;
- `objectives` confirma mesma empresa, mesma area, nivel `area_annual`, periodo anual correto e registro ativo;
- o `parent_id` estrategico esta entre os IDs confirmados da proposta ou o titulo anual normalizado coincide;
- a proposta nao declarou excecao anual.

O aplicador nao cria um novo objetivo para compensar a omissao e continua falhando fechado diante de referencia de outra area, ano ou empresa. A validacao local passou 382 testes unitarios, lint, build/bundle e secret scan. Depois do deploy apenas de `oracle-session` no staging, a integracao real passou 7/7: caso feliz, idempotencia, concorrencia, rollback, fallback canonico, recusa de outra area e recusa de outra empresa.

### Smoke Q4J bloqueado

O smoke isolado repetiu `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002`. A falha tecnica original desapareceu: confirmacao, banco e documento foram concluídos, e o Plano Trimestral recebeu **95**. O gate geral permaneceu bloqueado:

| Rubrica | Nota |
|---|---:|
| Conducao | 65,00 |
| Plano Trimestral | 95,00 |
| Media conjunta | 80,00 |

Nao houve candidato de falha critica nem check deterministico reprovado. O defeito foi conversacional: apos `Nosso objetivo do trimestre e implantar um CRM`, a resposta ofereceu o menu generico `resultado, prazo, responsavel ou primeira acao`. O condutor possui a instrucao de tratar CRM como meio, mas o contrato adaptativo ainda nao bloqueia deterministicamente essa abertura de atividade; por isso o comportamento varia entre rodadas.

| Item | Valor |
|---|---:|
| Smoke Q4J | US$ 0,035877 |
| Acumulado antes | US$ 4,766588 |
| Acumulado depois | US$ 4,802465 |
| Limite autorizado | US$ 20,00 |

O cleanup e o preflight final confirmaram zero organizacao descartavel. O progresso Q5B r4 nao foi reiniciado e nenhuma segunda chamada paga foi feita. A proxima correcao deve tornar deterministico o desafio de uma atividade trimestral: pedir qual resultado empresarial, adocao ou mudanca mensuravel ela precisa produzir, mantendo a atividade como acao. Somente depois de novo smoke aprovado a Q5B pode ser arquivada e reiniciada como `r5`.

## Correcao Q4K

A Q4K adicionou ao contrato adaptativo a regra que antes existia apenas no prompt: quando a abertura trimestral traz uma atividade curta como `implantar CRM`, a resposta deve reenquadra-la como meio e perguntar por resultado empresarial, adocao, efeito ou mudanca mensuravel. O menu generico de campos e bloqueado; uma resposta contextual boa continua sendo aceita sem reescrita. O fallback possui uma unica pergunta e nao acrescenta etapa ao ritual.

Validacao local: 383 testes unitarios, lint, build/bundle e secret scan. Depois do deploy somente de `oracle-session` no staging, o smoke repetiu `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002`:

| Rubrica | Nota |
|---|---:|
| Conducao | 81,25 |
| Plano Trimestral | 93,75 |
| Media conjunta | 87,50 |

A primeira pergunta apos `implantar um CRM` tratou CRM como acao e pediu o resultado mensuravel para reduzir surpresa no funil. Confirmacao, banco, documento e os checks deterministas passaram; nao houve candidato de falha critica ou residuo.

| Item | Valor |
|---|---:|
| Smoke Q4K | US$ 0,049289 |
| Acumulado antes | US$ 4,802465 |
| Acumulado depois | US$ 4,851754 |
| Limite autorizado | US$ 20,00 |

Com o preflight limpo, `restart-after-correction Q4K` arquivou as quatro medicoes Q5B r4 como calibracao e abriu `2026-07-17.q5-regression-r6`. Permanecem oficiais as dez medicoes Q5A e os nove resultados deterministas; Q5B voltou a zero. Nenhuma medicao r6 foi iniciada. Producao, frontend, banco real e WhatsApp real permaneceram inalterados.

## Execucao Q5B r6

A Q5B r6 foi autorizada para 16 medicoes e interrompida pelo fail-fast na oitava. As duas rodadas do problema vago, CRM como atividade e equivalencia de area passaram; a primeira rodada de meta repetida tambem passou. A segunda rodada de meta repetida bloqueou:

| Rubrica | Nota |
|---|---:|
| Conducao | 75,00 |
| Plano Trimestral | 88,75 |
| Media conjunta | 81,88 |

Nao houve falha critica, erro tecnico ou check deterministico reprovado. O plano preservou baseline 9%, alvo 5%, fonte, prazo, dono, acoes, risco, aprendizado, backlog, cadencia e vinculo anual. O defeito foi a conducao:

- a primeira resposta escreveu `Manter reduzir retrabalho para 5%` e ofereceu tres hipoteses antes de conhecer o historico;
- o gestor informou dois ciclos anteriores em 11% e 9%, a causa confirmada e uma nova abordagem com checklist e auditoria semanal;
- a resposta seguinte ignorou que baseline e indicador ja estavam claros e perguntou ambos novamente;
- a confirmacao final ficou generica, sem explicitar o aprendizado e a mudanca de abordagem.

| Item | Valor |
|---|---:|
| Medicoes Q5B r6 executadas | 8 de 16 |
| Aprovadas | 7 |
| Bloqueadas | 1 |
| Custo parcial Q5B r6 | US$ 0,300678 |
| Acumulado antes | US$ 4,851754 |
| Acumulado depois | US$ 5,152432 |
| Limite autorizado | US$ 20,00 |

O fail-fast encerrou antes da nona chamada. Cleanup e preflight confirmaram zero organizacao descartavel. A proxima correcao deve ser isolada: diante de meta repetida com historico, usar a trajetoria anterior, a causa e a nova abordagem; perguntar o que muda e qual evidencia provará o aprendizado; nunca reentrevistar indicador/baseline ja confirmados. Depois de smoke isolado aprovado, as oito medicoes r6 podem ser arquivadas e a Q5B reiniciada novamente, preservando custo e relatorios.

## Correcao Q4L

A Q4L transformou a orientacao de memoria trimestral em contrato verificavel:

- meta recorrente precisa reconhecer historico/recorrencia antes de perguntar o que muda;
- respostas truncadas como `manter reduzir` sao recusadas;
- depois de trajetoria, causa e nova abordagem confirmadas, indicador e baseline nao podem ser perguntados novamente;
- se a IA ainda omitir a memoria, o fallback recupera literalmente a frase de trajetoria fornecida pelo gestor e pergunta somente pela evidencia intermediaria;
- a sintese final nao duplica baseline/alvo e separa acoes que mudam a abordagem de foco de aprendizado;
- a confirmacao mostra fonte, prazo, responsavel, cadencia e quantidade de acoes, com uma unica pergunta para gravar.

Validacao local: 387 testes unitarios, catalogo estrategico, lint, build/bundle e secret scan verdes. Somente `oracle-session` foi publicada no staging.

### Primeiro smoke preservado

| Rubrica | Nota |
|---|---:|
| Conducao | 77,50 |
| Plano Trimestral | 92,50 |
| Media conjunta | 85,00 |

O plano estava verificavel, mas a conversa ainda nao citava os ciclos 11% e 9%, abriu com `Manter reduzir` e o resumo duplicou `9% para 5%`. O gate bloqueou sem falha critica, erro tecnico ou residuo. Custo: **US$ 0,045706**.

### Smoke final aprovado

| Rubrica | Nota |
|---|---:|
| Conducao | 100,00 |
| Plano Trimestral | 96,25 |
| Media conjunta | 98,13 |

A conversa reconheceu que a meta estava voltando, recuperou literalmente os dois ciclos anteriores, confirmou causa e nova abordagem, perguntou pela evidencia intermediaria e fechou com baseline 9%, alvo 5%, fonte, prazo, dono, acoes, aprendizado e cadencia em uma unica confirmacao. Todos os checks tecnicos passaram, sem candidato de falha critica; cleanup e preflight confirmaram zero organizacao descartavel.

| Item | Valor |
|---|---:|
| Primeiro smoke Q4L | US$ 0,045706 |
| Smoke final Q4L | US$ 0,044093 |
| Custo total Q4L | US$ 0,089799 |
| Acumulado antes | US$ 5,152432 |
| Acumulado depois | US$ 5,242231 |
| Limite autorizado | US$ 20,00 |

`restart-after-correction Q4L` preservou as oito medicoes Q5B r6 como calibracao e abriu `2026-07-17.q5-regression-r7`. Permanecem oficiais dez resultados Q5A e nove deterministas; Q5B esta zerada. Producao, frontend, banco real e WhatsApp real permaneceram inalterados.

## Execucao Q5B r7

A Q5B r7 foi autorizada para 16 medicoes e interrompida automaticamente na sexta, antes da setima chamada. As duas rodadas do problema trimestral vago e de CRM como atividade passaram. A equivalencia entre a area solicitada `Industrial` e a unica area cadastrada `Producao` tambem passou na primeira rodada, mas bloqueou na segunda:

| Caso | Rodada | Conducao | Plano Trimestral | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| Problema trimestral vago | 1 | 96,25 | 97,50 | aprovada | US$ 0,042462 |
| Problema trimestral vago | 2 | 95,00 | 97,50 | aprovada | US$ 0,034899 |
| CRM como atividade | 1 | 91,25 | 96,25 | aprovada | US$ 0,037766 |
| CRM como atividade | 2 | 96,25 | 97,50 | aprovada | US$ 0,037168 |
| Area equivalente | 1 | 81,25 | 96,25 | aprovada | US$ 0,036735 |
| Area equivalente | 2 | 70,00 | 97,50 | bloqueada | US$ 0,037602 |

O comportamento funcional principal ficou correto: nao criou uma area `Industrial`, permaneceu na area `Producao`, manteve empresa, T3 2027 e objetivo anual aplicavel, gravou somente depois de uma confirmacao e gerou banco/documento coerentes. Os dez checks deterministas passaram, sem falha critica, erro tecnico, gravacao prematura, confirmacao duplicada, divergencia ou residuo.

O defeito ficou isolado na qualidade da conducao. Depois de o gestor sintetico fornecer um bloco quase completo, o Oraculo absorveu os fatos e fechou um plano forte, mas nao fez nenhum desafio curto sobre meta, capacidade, risco ou consistencia das acoes. Tambem nao recuperou historico pertinente. O judge atribuiu **70** a Conducao, **97,50** ao Plano Trimestral e **83,75** de media conjunta.

| Item | Valor |
|---|---:|
| Medicoes Q5B r7 executadas | 6 de 16 |
| Aprovadas | 5 |
| Bloqueadas | 1 |
| Geracao Q5B r7 | US$ 0,158098 |
| Judges Q5B r7 | US$ 0,068534 |
| Total Q5B r7 | US$ 0,226632 |
| Acumulado antes | US$ 5,242231 |
| Acumulado depois | US$ 5,468862 |
| Limite autorizado | US$ 20,00 |

O fail-fast impediu a setima chamada. O preflight final confirmou staging acessivel, zero organizacao sintetica pendente e os modelos `xai/grok-4.3` no condutor e `xai/grok-4.5` no judge. Producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

Antes de reiniciar a Q5B, a Q4M deve tornar verificavel um desafio estrategico curto quando um bloco pronto ainda nao demonstra que meta e abordagem foram testadas. A pergunta deve aproveitar o fato mais relevante e escolher somente uma dimensao util, como capacidade, risco, evidencia intermediaria ou consistencia da acao. Nao deve reentrevistar campos completos, criar etapa extra quando o bloco ja foi criticamente validado, inventar memoria nem tornar a equivalencia de area uma duvida para o gestor. Depois da correcao local, repetir apenas `Q2B-QUARTERLY-EQUIVALENT-AREA-003` em smoke pago e limpo; somente um smoke aprovado permite arquivar as seis medicoes r7 e abrir uma nova baseline Q5B.

## Correcao Q4M

A Q4M tornou verificavel o desafio estrategico de um bloco trimestral quase completo. Antes de aceitar a proposta, o contrato agora verifica se a conversa ja testou uma dimensao util da decisao. Quando ainda nao testou:

- faz uma unica pergunta curta sobre capacidade, risco, evidencia intermediaria ou consistencia das acoes;
- parte da meta e dos fatos ja confirmados, sem reentrevistar indicador, baseline, area ou periodo;
- nao reabre uma equivalencia de area segura nem inventa memoria;
- permite seguir para a sintese no turno seguinte, sem criar uma segunda entrevista;
- impede que a mesma checagem seja exigida novamente quando a conversa ja a realizou.

A validacao local final passou 389 testes unitarios, catalogo estrategico, lint, build/bundle e secret scan em 476 arquivos. O runner `eval:strategic:q4m` repete somente `Q2B-QUARTERLY-EQUIVALENT-AREA-003` e nao altera o progresso oficial da Q5B. Somente `oracle-session` foi publicada no staging.

### Smoke aprovado

A transcricao preservou `Industrial` como alias da unica area `Producao`, manteve T3 2027 e o objetivo anual aplicavel. Depois do bloco completo, o Oraculo perguntou: qual evidencia intermediaria mostraria, antes do fechamento, que as acoes estavam mudando o resultado de 82% para 92%. No turno seguinte, fechou o plano sem nova entrevista e pediu uma unica confirmacao.

| Rubrica | Nota |
|---|---:|
| Conducao | 87,50 |
| Plano Trimestral | 97,50 |
| Media conjunta | 92,50 |

Os dez checks deterministas passaram: escopo, proposta, tipo, ausencia de gravacao prematura, confirmacao 1/1, banco, documento canonico, judge somente leitura e cleanup. Nao houve falha critica, erro tecnico ou residuo.

| Item | Valor |
|---|---:|
| Geracao Q4M | US$ 0,044161 |
| Judge Q4M | US$ 0,011958 |
| Total Q4M | US$ 0,056119 |
| Acumulado antes | US$ 5,468862 |
| Acumulado depois | US$ 5,524982 |
| Limite autorizado | US$ 20,00 |

O preflight final confirmou zero organizacao sintetica pendente e os modelos esperados. Producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados. A Q5B r7 continua preservada ate um comando explicito de reinicio; a proxima baseline prevista e `2026-07-17.q5-regression-r8`, somente depois de briefing e autorizacao paga.

## Execucao Q5B r8

Depois de autorizacao explicita, `restart-after-correction Q4M` preservou as seis medicoes r7 e abriu `2026-07-17.q5-regression-r8`. A fase parou automaticamente na quarta de 16 medicoes, antes da quinta chamada:

| Caso | Rodada | Conducao | Plano Trimestral | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| Problema trimestral vago | 1 | 91,25 | 95,00 | aprovada | US$ 0,060160 |
| Problema trimestral vago | 2 | 87,50 | 95,00 | aprovada | US$ 0,051483 |
| CRM como atividade | 1 | 97,50 | 97,50 | aprovada | US$ 0,055386 |
| CRM como atividade | 2 | - | - | erro tecnico | US$ 0,026403 |

A conversa bloqueada fez corretamente o reenquadramento de CRM como meio, preservou o alvo de 40% para 85%, fonte, adocao e responsavel. Ao receber o bloco completo, a primeira geracao tentou montar a proposta; a Q4M a recusou para exigir o desafio estrategico. A segunda geracao interna nao terminou dentro do teto total de 52 segundos e a Function devolveu `400/AI_PROVIDER_TIMEOUT`. Nenhuma proposta, confirmacao, gravacao ou judge foi executado nessa rodada.

O cleanup removeu empresa, usuario e chave descartavel. O preflight final confirmou staging limpo e acumulado de **US$ 5,718412**. O custo parcial Q5B r8 foi **US$ 0,193431**; o fail-fast impediu a quinta chamada. Producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

A proxima correcao Q4N deve manter a pergunta aprovada pela Q4M, mas elimina-la do caminho de reparo por IA: quando um bloco completo ainda nao recebeu desafio, o servidor deve adiar a proposta e construir deterministicamente a unica pergunta contextual antes de aceitar nova geracao. Assim, a mesma requisicao nao consome uma segunda chamada ao provedor nem compete com o timeout. A regra continua sem reentrevista, sem reabrir area e sem gravar antes da confirmacao. Depois de testes locais e deploy apenas no staging, repetir somente `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002`; nao reiniciar a Q5B automaticamente.

## Correcao Q4N

A Q4N foi aprovada somente no staging em 2026-07-17. Quando o primeiro envelope de um bloco trimestral completo ja contem proposta, mas a conversa ainda nao fez o desafio estrategico, o servidor agora:

1. preserva os fatos canonicos extraidos;
2. adia a proposta localmente e mantem a sessao aberta;
3. faz a mesma pergunta curta sobre evidencia intermediaria;
4. aceita uma nova proposta no turno seguinte, sem chamar novamente o provedor dentro da resposta que gerou o desafio.

O smoke repetiu apenas `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002` R2. O CRM foi reenquadrado como meio; o alvo de 40% para 85%, a fonte semanal, a adocao e o vinculo anual foram preservados. A conversa perguntou qual evidencia antecipada provaria a mudanca e depois apresentou o plano com duas acoes e uma unica confirmacao.

| Evidencia | Resultado |
|---|---:|
| Conducao | 93,75 |
| Plano Trimestral | 95,00 |
| Media conjunta | 94,38 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Reparos `quarterly_complete_block_unchallenged` | 0 |
| Custo de geracao | US$ 0,042371 |
| Custo do judge | US$ 0,011800 |
| Total Q4N | US$ 0,054171 |
| Acumulado do plano | US$ 5,772584 |

O relatorio registrou seis chamadas de planejamento ao longo dos quatro turnos do gestor. Duas foram reparos adaptativos de outros motivos, preservados pelo contrato geral; nenhuma decorreu do bloco trimestral completo e nenhuma disputou o timeout da pergunta Q4N. Empresa, usuario e chave descartaveis foram removidos, e o preflight final confirmou staging sem residuos.

A retomada seguinte sera incremental. O comando `resume-after-correction Q4N` arquiva somente a medicao tecnica CRM R2 com erro, mantem as tres medicoes aprovadas da Q5B r8 e deixa o runner repetir a combinacao ausente antes de continuar os casos ainda nao executados. Depois que Q5A-Q5D e os gates finais estiverem aprovados, sera feita uma regressao geral limpa com todos os cenarios; ate la, resultados aprovados nao serao repetidos sem necessidade.

## Retomada Q5B r8 e correcao Q4O

Depois da Q4N, a retomada incremental preservou as tres aprovacoes anteriores e repetiu apenas CRM R2. Essa medicao passou, assim como a primeira rodada de area equivalente. A segunda rodada de area equivalente terminou em erro tecnico e ativou o fail-fast antes do proximo caso:

| Caso | Rodada | Conducao | Plano Trimestral | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| CRM como atividade | 2 | 92,50 | 95,00 | aprovada | US$ 0,047453 |
| Area equivalente | 1 | 81,25 | 97,50 | aprovada | US$ 0,038378 |
| Area equivalente | 2 | - | - | erro tecnico | US$ 0,041001 |

O erro ocorreu quando o segundo envelope de reparo da IA continuou invalido. O runtime encerrava a sessao com `400/INTERNAL_ERROR`, embora pudesse manter com seguranca o estado canonico e uma unica pergunta sem gravar. A Q4O passou a recuperar esse caso localmente: conserva os fatos confiaveis, mantem `done=false`, remove proposta prematura e devolve uma pergunta segura, sem terceira chamada ao provedor.

O primeiro smoke Q4O comprovou a recuperacao tecnica, mas bloqueou qualidade porque o fallback encerrou a conversa sem proposta. O segundo chegou ao plano com notas fortes, porem citou pouco a equivalencia `Industrial`/`Producao` e a memoria historica. A rodada final adicionou esse reconhecimento de forma deterministica e passou:

| Rodada Q4O | Conducao | Plano Trimestral | Media | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| Smoke 1 | 22,50 | 0,00 | 11,25 | bloqueada | US$ 0,065521 |
| Smoke 2 | 75,00 | 93,75 | 84,38 | bloqueada | US$ 0,048270 |
| Smoke final | 91,25 | 95,00 | 93,13 | aprovada | US$ 0,056969 |

Na rodada final, os dez checks deterministas passaram, sem falha critica, gravacao prematura, confirmacao repetida, divergencia ou residuo. Empresa, usuario e chave descartaveis foram removidos. A validacao local passou 397 unitarios, 29 casos do catalogo, lint, build/bundle e secret scan em 478 arquivos. Somente `oracle-session` foi atualizada no staging; producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

| Item | Valor |
|---|---:|
| Custo incremental Q5B antes da Q4O | US$ 0,126832 |
| Custo total Q4O | US$ 0,170760 |
| Acumulado do plano | US$ 6,070176 |
| Limite autorizado | US$ 20,00 |

A proxima retomada executa `resume-after-correction Q4O`, arquiva somente a medicao de area equivalente R2 com erro e preserva as cinco aprovacoes Q5B r8. `phase Q5B` repete primeiro essa combinacao e continua apenas pelos casos ainda ausentes. Em qualquer novo bloqueio, o ciclo permanece: corrigir, testar somente o caso afetado e retomar incrementalmente. A regressao geral limpa, repetindo todos os cenarios, sera executada uma unica vez depois que Q5A-Q5D estiverem integralmente verdes.

## Retomada Q5B e correcao Q4P

A retomada apos Q4O repetiu somente area equivalente R2, que passou, e avancou pelos casos ainda ausentes. As duas rodadas de meta recorrente tambem passaram. O primeiro caso de meta sem baseline bloqueou somente a qualidade da conducao:

| Caso | Rodada | Conducao | Plano Trimestral | Resultado | Custo |
|---|---:|---:|---:|---|---:|
| Area equivalente | 2 | aprovada | aprovada | aprovada | US$ 0,061705 |
| Meta recorrente | 1 | aprovada | aprovada | aprovada | US$ 0,055510 |
| Meta recorrente | 2 | aprovada | aprovada | aprovada | US$ 0,053522 |
| Meta sem baseline | 1 | 52,50 | 96,25 | bloqueada | US$ 0,051027 |

O plano final do caso bloqueado era verificavel e fiel, mas a conversa repetiu o mesmo menu generico duas vezes. Ela nao perguntou qual formula representava produtividade nem apresentou `unidades por hora` e `pedidos concluidos por pessoa` como alternativas. O fail-fast encerrou antes da segunda rodada e o cleanup removeu todos os dados descartaveis.

A Q4P corrige somente essa conducao. Uma meta percentual de produtividade sem medida passa a pedir primeiro o indicador. Se o gestor informar duas fontes candidatas, a resposta cita ambas e pede que ele escolha, sem escolher por ele, inventar baseline ou abrir varias perguntas. O smoke repetiu apenas `Q2B-QUARTERLY-MISSING-BASELINE-005` R1:

| Evidencia | Resultado |
|---|---:|
| Conducao | 100,00 |
| Plano Trimestral | 93,75 |
| Media conjunta | 96,88 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Custo de geracao | US$ 0,041739 |
| Custo do judge | US$ 0,011202 |
| Total Q4P | US$ 0,052941 |
| Acumulado do plano | US$ 6,344882 |

A transcricao aprovada perguntou primeiro qual indicador representa produtividade. No turno seguinte, apresentou exatamente `unidades por hora` e `pedidos concluidos por pessoa`; somente depois da escolha preservou baseline 12, alvo 14,4 e fonte ERP. Houve uma confirmacao, banco/documento coerentes e cleanup completo. Testes focados, catalogo 29/29, lint e build/bundle passaram. Somente `oracle-session` foi publicada no staging; producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

`resume-after-correction Q4P` arquiva apenas a medicao bloqueada de meta sem baseline e preserva 18 aprovacoes oficiais no total, sendo 10 Q5A e 8 Q5B. A fase deve repetir primeiro somente esse caso e continuar pelos sete resultados trimestrais ainda ausentes. A politica permanece fail-fast e incremental ate Q5A-Q5D ficarem verdes; somente depois sera feita a regressao geral limpa.

## Retomada Q5B, recheck Q4Q e correcao Q4R

A retomada Q5B apos Q4P aprovou as duas rodadas de meta sem baseline e a primeira de excesso de prioridades. A segunda rodada de prioridades encerrou em `AI_PROVIDER_TIMEOUT` antes de proposta ou judge:

| Caso | Rodada | Resultado | Custo |
|---|---:|---|---:|
| Meta sem baseline | 1 | aprovada | US$ 0,051856 |
| Meta sem baseline | 2 | aprovada | US$ 0,053480 |
| Excesso de prioridades | 1 | aprovada | US$ 0,039824 |
| Excesso de prioridades | 2 | erro tecnico | US$ 0,028761 |

O R1 do mesmo caso havia passado com Conducao 93,75, Plano Trimestral 92,50 e media 93,13. Por isso, antes de alterar runtime, a Q4Q repetiu somente R2 sem mudanca de codigo. O mesmo timeout reapareceu, custou US$ 0,028440 e provou que a segunda chance do provedor nao possuia tempo util: o request tinha 52 segundos no total, a primeira tentativa podia consumir 40 e o retry recebia menos que o minimo seguro.

A Q4R manteve cada tentativa em no maximo 40 segundos e ampliou apenas a janela total para 90 segundos. Assim, a unica repeticao transitoria ja existente pode receber ate 40 segundos reais; duas falhas ainda encerram sem mutacao e com mensagem segura. O cliente do laboratorio passou a aguardar 105 segundos para observar a resposta da Function. Perguntas, regras de plano, quantidade de retries, banco, confirmacao e permissao nao mudaram.

O smoke Q4R repetiu somente `Q2B-QUARTERLY-PRIORITY-OVERLOAD-006` R2:

| Evidencia | Resultado |
|---|---:|
| Conducao | 83,75 |
| Plano Trimestral | 96,25 |
| Media conjunta | 90,00 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Custo Q4Q bloqueada | US$ 0,028440 |
| Custo Q4R aprovada | US$ 0,040944 |
| Acumulado do plano | US$ 6,588187 |

Testes de orçamento provaram duas janelas completas e falha fechada sem tempo minimo; baseline, retry, catalogo, lint e build/bundle passaram. Somente `oracle-session` foi publicada no staging. Producao, Netlify, migrations, banco real, WhatsApp real e Evolution permaneceram inalterados.

`resume-after-correction Q4R` deve arquivar somente prioridade R2 com erro e preservar 21 aprovacoes totais, sendo 10 Q5A e 11 Q5B. A fase repete essa rodada e, se passar, continua pelos quatro resultados trimestrais ainda ausentes.

## Correcao Q4S: acoes transversais sem duplicacao

A retomada apos Q4R removeu o timeout de prioridade R2, mas a medicao oficial bloqueou qualidade: o modelo copiou as mesmas duas acoes dentro dos tres objetivos. A confirmacao repetiu seis linhas e informou `Execucao: 6 acoes`, embora o gestor tivesse definido somente duas. O caso custou US$ 0,051547 e parou a Q5B por fail-fast.

A Q4S introduz `sharedActions` no contrato trimestral. Quando descricao, dono, prazo e criterio sao identicos em todos os objetivos, o servidor normaliza a acao como transversal. Ela passa a ser contada, confirmada, gravada e renderizada uma unica vez; acoes apenas parecidas ou especificas continuam no objetivo original. Nao houve tabela ou migration nova.

| Evidencia | Resultado |
|---|---:|
| Conducao | 92,50 |
| Plano Trimestral | 96,25 |
| Media conjunta | 94,38 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Teste real de persistencia | 3 objetivos / 1 copia da acao fixture |
| Custo Q4S principal | US$ 0,040024 |
| Custo Q4S sobreposto | US$ 0,040420 |
| Custo Q4S total | US$ 0,080443 |
| Acumulado apos Q4S | US$ 6,720177 |

O resumo aprovado apresenta tres resultados, as duas acoes uma vez e `Execucao: 2 acoes`. O endpoint real de staging confirmou que banco e documento canonico nao duplicam. Foram aprovados 410 testes unitarios, catalogo 29/29, lint, build/bundle e secret scan em 486 arquivos. Uma segunda Q4S ja iniciada continuou em paralelo porque o identificador do terminal longo nao foi preservado; ela tambem passou (Conducao 100 e Plano Trimestral 97,50), mas consumiu US$ 0,040420 adicional. O runner agora usa lock atomico por fase para impedir nova sobreposicao. Somente `oracle-session` foi publicada no staging; producao permanece inalterada e o frontend sera publicado apenas no release autorizado do conjunto.

`resume-after-correction Q4S` deve arquivar somente a medicao oficial bloqueada de prioridade R2, preservar 21 aprovacoes e repetir essa rodada. Depois, Q5B continua apenas pelos quatro resultados ausentes. A regressao geral limpa segue reservada para quando Q5A-Q5D estiverem integralmente verdes.

## Correcao Q4T: hipotese de KPI confirmada e rastreavel

A retomada Q4S aprovou prioridade R2 (Conducao 87,50; Plano Trimestral 88,75; US$ 0,054448). O caso seguinte revelou variacao real na conducao de hipotese de KPI: uma rodada R1 passou, outra execucao R1 sobreposta bloqueou e R2 bloqueou por perguntar genericamente em vez de explicar a hipotese e pedir a escolha. As tres medicoes permanecem no ledger: US$ 0,054424, US$ 0,054453 e US$ 0,053461.

A Q4T exige que a conversa explique que o efeito sobre Margem operacional ainda e hipotese, pergunte explicitamente se o gestor quer vincular e somente entao aceite o vinculo. Nomes humanos sao normalizados para as chaves reais `revenue`, `operating_margin`, `production` ou `cash`; chaves desconhecidas sao recusadas. A ressalva causal segue na proposta, no banco, no documento canonico, na tela/PDF e no WhatsApp. Nao houve migration.

| Evidencia | Resultado |
|---|---:|
| Conducao | 86,25 |
| Plano Trimestral | 97,50 |
| Media conjunta | 91,88 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Persistencia real | `operating_margin` + ressalva + documento |
| Custo Q4T | US$ 0,048241 |
| Acumulado do plano | US$ 6,985203 |

O primeiro veredito automatico da Q4T foi aprovado pelo judge, mas o smoke local marcou falso negativo porque aceitava somente a expressao literal `nao comprovado`; o transcript usou `ainda sendo hipotese`. O guard passou a reconhecer ambas sem relaxar a exigencia de pergunta, KPI e escolha explicita. O mesmo relatorio pago foi revalidado por US$ 0. A suite passou 419 unitarios, catalogo 29/29, lint, build/bundle, secret scan e integracao real no staging. O lock por fase impede duas Q5/Q4T simultaneas.

`resume-after-correction Q4T` arquiva somente KPI R2 bloqueada e preserva 23 aprovacoes totais, sendo 10 Q5A e 13 Q5B. `phase Q5B` repete KPI R2 e, se passar, executa apenas as duas rodadas ainda ausentes do gestor experiente. Qualquer nova falha segue correcao + smoke focado + retomada incremental. A regressao geral limpa continua reservada para depois de Q5A-Q5D integralmente verdes.

## Q5B completa e correcao Q4U: continuidade mensal

A retomada Q4T repetiu somente KPI R2, que passou por US$ 0,054676. As duas rodadas ainda ausentes do gestor experiente tambem passaram por US$ 0,035430 e US$ 0,029382. A Q5B terminou com 16/16 medicoes oficiais verdes; custo oficial da fase US$ 0,797116. Nenhum trimestral aprovado foi repetido.

Na Q5C, as duas rodadas de cascata mensal passaram. A primeira rodada de pendencia herdada preservou origem, motivo, decisao e prazo, mas tratou `integracao do CRM` como resultado em vez de acao; deixou a mudanca de 40% para 55% escondida, nao definiu acompanhamento/compromisso seguinte e resumiu somente o nome da atividade. Conducao ficou em 86,25, Plano Mensal 78,75 e media 82,50; custo US$ 0,034121. O fail-fast impediu R2 e os casos seguintes.

A Q4U normaliza apenas pendencias herdadas com decisao explicita. A atividade permanece em `actions`; quando indicador, baseline e alvo ja existem, o resultado mensal passa a expressar a mudanca mensuravel. Origem, motivo, bloqueio, prazo, criterio, acompanhamento e proximo compromisso sao derivados somente dos fatos confirmados. A confirmacao final mostra tudo isso uma vez, sem criar reuniao ou frequencia. Nao houve migration.

| Evidencia | Resultado |
|---|---:|
| Conducao | 82,50 |
| Plano Mensal | 97,50 |
| Media conjunta | 90,00 |
| Checks deterministas | 10/10 |
| Falhas criticas | 0 |
| Persistencia real | resultado + acao + origem + prazo + documento |
| Custo Q4U | US$ 0,034245 |
| Acumulado do plano | US$ 7,242402 |

A validacao passou 425 testes unitarios, catalogo 29/29, lint, build/bundle, secret scan e integracao real no staging. Somente `oracle-session` foi publicada no staging; producao e frontend publicado permanecem inalterados.

`resume-after-correction Q4U` arquiva somente a pendencia herdada R1 bloqueada e preserva 28 aprovacoes totais: 10 Q5A, 16 Q5B e 2 Q5C. `phase Q5C` repete essa rodada e continua apenas pelos cinco resultados mensais ausentes. Novos problemas seguem o mesmo ciclo. A regressao geral limpa permanece reservada para depois de Q5A-Q5D integralmente verdes.

## Correcao Q4V: capacidade mensal sem loop

A retomada Q4U aprovou as duas rodadas de pendencia herdada. O caso de capacidade bloqueou na R1: o plano final chegou a cinco acoes, mas o Oraculo repetiu a pergunta generica `o que destrava` depois de receber a divisao de capacidade, ignorou o historico de sete acoes abertas e nao conduziu a renuncia. Conducao 21,25, Plano Mensal 0 e custo US$ 0,081840 na medicao oficial bloqueada; fail-fast impediu R2 e o caso mensal seguinte.

A Q4V reconhece somente blocos mensais estritamente completos. Datas, indicador, baseline, alvo, fonte, dono e uma a cinco acoes precisam estar explicitos; o vinculo trimestral so e aceito quando existe um unico candidato seguro na mesma empresa, area e trimestre. Antes do bloco final, a mensagem de capacidade recebe resposta deterministica: lembra o excesso anterior, confronta doze demandas com cinco vagas, preserva a divisao tres para resultado e duas para risco, registra o backlog e pede as cinco acoes com prazo e criterio. Nada e gravado antes da confirmacao.

A primeira medicao Q4V comprovou Plano Mensal 96,25, mas bloqueou Conducao 56,25 porque a pergunta generica anterior ainda existia; custou US$ 0,033466. Depois da transicao focada, o smoke final passou com Conducao 91,25, Plano Mensal 97,50, media 94,38, zero falha critica e custo US$ 0,022743. A jornada real do endpoint passou sem chamada de IA: memoria, proposta, confirmacao unica, objetivo, cinco acoes, pai trimestral e documento foram conferidos, e a organizacao descartavel foi removida.

| Medicao | Resultado |
| --- | --- |
| Q5C preservada | 30 aprovacoes: Q5A 10, Q5B 16, Q5C 4 |
| Q4V final | Conducao 91,25; Plano Mensal 97,50; media 94,38 |
| Custo Q4V | US$ 0,056209 nas duas tentativas |
| Acumulado | US$ 7,450188 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

`resume-after-correction Q4V` arquiva somente a capacidade mensal R1 bloqueada e preserva as 30 aprovacoes. `phase Q5C` repete essa rodada e, se passar, executa apenas capacidade R2 e as duas rodadas mensais ainda ausentes. A mesma politica vale para novos defeitos. A regressao geral limpa continua reservada para depois de Q5A-Q5D integralmente verdes.

## Q5C completa e correcao Q4W: fechamento mensal parcial

A retomada Q4V repetiu somente capacidade R1 e continuou pelos tres resultados ausentes; todos passaram. A Q5C terminou com 8/8 medicoes oficiais verdes. O primeiro caso Q5D, fechamento mensal parcial R1, atualizou e gravou corretamente, mas fez uma pergunta generica depois de ja conhecer duas acoes concluidas, uma pendencia de fornecedor, aprendizado e confianca. A saida derivada perdeu a meta e o aprendizado estruturados e renderizou a pendencia como `[object Object]`. O fail-fast impediu R2 e os demais casos.

A Q4W absorve os fatos completos e pergunta somente o novo prazo da integracao. O veredito cita 50% contra meta 60% e nao marca a pendencia como concluida. A normalizacao da proposta preserva `current`, `target`, aprendizado e proximo periodo. Documento canonico, tela e WhatsApp formatam decisao, motivo e prazo e exibem confianca, bloqueio e compromisso seguinte.

| Evidencia | Resultado |
|---|---:|
| Q5 preservada | 34 aprovacoes: Q5A 10, Q5B 16, Q5C 8 |
| Conducao Q4W | 97,50 |
| Revisao/Fechamento Q4W | 100,00 |
| Saida Derivada Q4W | 81,25 |
| Media conjunta | 92,92 |
| Teste real | confirmacao, objetivo, 3 acoes, evidencia, check-in, documento e cleanup |
| Custo Q4W | US$ 0,032662 |
| Acumulado | US$ 7,653772 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

`resume-after-correction Q4W` deve arquivar somente o fechamento mensal parcial R1 bloqueado e preservar as 34 aprovacoes. `phase Q5D` repete primeiro esse caso e continua apenas pelas cinco medicoes generativas ausentes. Em nova falha, o ciclo permanece correcao + smoke isolado + retomada incremental. A regressao geral limpa repetindo todos os cenarios sera executada uma unica vez quando Q5A-Q5D estiverem integralmente verdes.

## Correcao Q4X: fechamento trimestral com rolagem seletiva

A retomada Q4W aprovou fechamento mensal R1/R2. O fechamento trimestral R1 reconheceu 78% contra meta 80%, mas perguntou genericamente o que destravaria a integracao, ignorou a dependencia recorrente desde o segundo mes e deixou a confirmacao sem resumo suficiente. A proposta poderia rolar o objetivo inteiro e duplicar a acao em vez de selecionar somente a integracao. O fail-fast preservou 36 aprovacoes e impediu as tres medicoes seguintes.

A Q4X usa a memoria da dependencia para desafiar a repeticao da mesma abordagem e pergunta somente escopo reduzido e prazo. A normalizacao preserva atingido, meta, responsavel, prazo original, aprendizado, proximo trimestre e vinculo anual. O contexto trimestral passou a incluir cada acao-chave com seu ID server-side; assim a proposta aponta para a acao confirmada e a persistencia cria somente essa acao no trimestre seguinte, uma vez, com novo escopo e prazo. Acoes concluidas nao sao copiadas.

| Evidencia | Resultado |
|---|---:|
| Q5 preservada | 36 aprovacoes: Q5A 10, Q5B 16, Q5C 8, Q5D 2 |
| Conducao Q4X | 100,00 |
| Revisao/Fechamento Q4X | 93,75 |
| Saida Derivada Q4X | 85,00 |
| Media conjunta | 92,92 |
| Teste real | contexto com ID, rolagem unica, escopo/prazo, banco, documento, WhatsApp e cleanup |
| Custo Q4X final | US$ 0,031324 |
| Acumulado | US$ 7,820758 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

A validacao passou 438 unitarios, catalogo 29/29, integracao real 2/2, lint, build/bundle e secret scan em 504 arquivos. `resume-after-correction Q4X` deve arquivar somente o fechamento trimestral R1 bloqueado e preservar as 36 aprovacoes. `phase Q5D` repete esse resultado e continua apenas por fechamento trimestral R2 e revisao estrategica R1/R2. A regressao geral limpa continua reservada para depois de Q5A-Q5D integralmente verdes.

## Correcao Q4Y: revisao estrategica com diff e saida canonica

A retomada Q4X aprovou fechamento trimestral R1/R2. A revisao estrategica R1 gravou corretamente dois microajustes, mas a confirmacao dizia apenas `2 ajustes` e usava `Posso aplicar?`; o gate tecnico nao a reconheceu e o gestor nao via campo, antes/depois ou limite. A avaliacao tambem recebeu `derivedOutputs` nulo, embora a confirmacao real criasse documento. O fail-fast preservou 38 aprovacoes e nao executou R2.

A Q4Y mantem o ritual enxuto: o gestor fornece os ajustes em bloco, recebe um resumo com campo, antes/depois e base informada e confirma uma vez. O texto deixa claro que os demais objetivos e campos ficam iguais e que nao existe reabertura da estrategia. A projecao pre-confirmacao usa o formato canonico `strategic_review`, com ajustes, antes/depois e rastreabilidade; tela, PDF e WhatsApp derivam dessa mesma estrutura. A mutacao continua ocorrendo somente depois da confirmacao.

| Evidencia | Resultado |
|---|---:|
| Q5 preservada | 38 aprovacoes: Q5A 10, Q5B 16, Q5C 8, Q5D 4 |
| Conducao Q4Y | 96,25 |
| Revisao/Fechamento Q4Y | 83,75 |
| Saida Derivada Q4Y | 96,25 |
| Media conjunta | 92,08 |
| Custo Q4Y | US$ 0,019090 |
| Acumulado | US$ 7,914731 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

A validacao passou 440 unitarios, catalogo 29/29, lint, build/bundle e secret scan em 505 arquivos. `resume-after-correction Q4Y` deve arquivar somente revisao estrategica R1 bloqueada e preservar as 38 aprovacoes. `phase Q5D` repete essa rodada e continua apenas por R2. Quando as duas passarem, Q5A-Q5D estarao verdes e o proximo passo sera a regressao geral limpa de todos os cenarios, conforme decisao do owner.

## Q5 incremental completa e correcao Q4Z na regressao limpa

A retomada Q4Y aprovou Revisao Estrategica R1/R2 e encerrou a rodada incremental Q5 com 40/40 medicoes verdes: Q5A 10, Q5B 16, Q5C 8 e Q5D 6. O custo acumulado chegou a US$ 7,952232. A regressao geral limpa foi entao aberta, zerando a grade ativa e preservando as medicoes anteriores somente como auditoria.

A matriz deterministica passou 8/8. Na Q5A, oito medicoes anuais passaram novamente; o gestor anual experiente R1 bloqueou antes de R2. Uma mensagem generica dizia que quatro objetivos e quatro projetos estavam completos, mas nao continha seus valores. O modelo tentou propor um plano 2026 dentro da sessao 2027, com zero objetivos e zero projetos. O fail-fast interrompeu a regressao, preservando custo e evidencias.

A Q4Z valida server-side toda proposta anual: o ano precisa coincidir com a sessao, os objetivos precisam conter resultado, atual, metrica, alvo, prazo, fonte e responsavel, e contagens explicitamente informadas precisam ser respeitadas. Se o bloco concreto nao veio, a proposta e removida, nada e gravado e o Oraculo pede os valores em uma unica mensagem, sem reiniciar a entrevista.

| Evidencia | Resultado |
|---|---:|
| Q5 incremental | 40/40 verdes |
| Primeira regressao limpa | deterministica 8/8; 8 anuais verdes; bloqueio no 9o |
| Conducao Q4Z | 90,00 |
| Plano Anual Q4Z | 100,00 |
| Saida Derivada Q4Z | 100,00 |
| Media conjunta | 96,67 |
| Custo Q4Z | US$ 0,057392 |
| Acumulado | US$ 8,412568 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

A validacao passou 444 unitarios, catalogo 29/29, lint, build/bundle e secret scan em 506 arquivos. O ciclo aprovado pelo owner agora e estrito: arquivar a tentativa parcial com `restart-clean-after-correction Q4Z`, zerar novamente deterministas e medicoes, repetir Q5A-Q5D inteiras e parar em qualquer nova falha. Depois de uma correcao, roda-se somente seu smoke focal; uma nova regressao integral comeca do zero. Producao permanece inalterada.

## Correcao Q4AA: vinculo trimestral canonico e confronto de prioridades

A regressao limpa reiniciada apos Q4Z passou novamente a matriz deterministica e toda a Q5A, 10/10. Na Q5B, as dez primeiras medicoes passaram. `Q2B-QUARTERLY-PRIORITY-OVERLOAD-006` R1 produziu uma conversa e um plano fortes, mas a confirmacao falhou: o modelo usou o ID do objetivo anual da area no campo reservado ao objetivo estrategico. O servidor recusou corretamente a referencia, o fail-fast impediu R2 e os casos seguintes e o cleanup removeu a empresa descartavel. A rodada bloqueada custou US$ 0,040720.

A Q4AA separa semanticamente os IDs no contexto e resolve a referencia antes da gravacao. A conversao exige que o registro seja um objetivo anual ativo da mesma empresa e area e usa apenas seu pai estrategico; referencias externas, de outra area ou de outro nivel continuam bloqueadas pela validacao existente. O primeiro smoke comprovou a integridade tecnica, mas bloqueou qualidade porque a abertura generica ignorou o excesso e a memoria. A conducao passou entao a confrontar deterministicamente oito objetivos, recuperar o historico de seis prioridades com uma concluida, limitar o trimestre a tres resultados e pedir a escolha do que entra e do que vai ao backlog.

| Evidencia | Resultado |
|---|---:|
| Grade limpa preservada antes do bloqueio | Q5A 10/10; Q5B 10 verdes |
| Primeiro smoke Q4AA | tecnico verde; Conducao 63,75; Plano 97,50; US$ 0,041452 |
| Smoke Q4AA final | Conducao 100; Plano Trimestral 97,50; media 98,75 |
| Custo do smoke final | US$ 0,035514 |
| Custo das duas tentativas Q4AA | US$ 0,076966 |
| Acumulado | US$ 9,532934 / US$ 20 |
| Deploy | somente `oracle-session` no staging; sem migration ou frontend |

A validacao final passou 450 unitarios, catalogo 29/29, lint, build/bundle e secret scan em 507 arquivos. O proximo passo e `restart-clean-after-correction Q4AA`: arquivar toda a grade parcial, zerar deterministas e medicoes e repetir Q5A-Q5D integralmente. Em nova falha, aplica-se novamente smoke focal e novo reinicio completo. Producao permanece inalterada.
