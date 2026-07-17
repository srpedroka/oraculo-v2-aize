# Regressao estrategica Q5

Data: 2026-07-17  
Ambiente: staging `bijbdsvejdzhpgyiykpi`  
Status: **Q5A preservada; Q4M aprovada; Q5B r8 aguarda briefing e autorizacao**

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
