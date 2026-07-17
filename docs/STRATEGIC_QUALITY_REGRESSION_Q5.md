# Regressao estrategica Q5

Data: 2026-07-17  
Ambiente: staging `bijbdsvejdzhpgyiykpi`  
Status: **Q5A aprovada; Q5B bloqueada no primeiro caso**

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
