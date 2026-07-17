# Regressao estrategica Q5

Data: 2026-07-17  
Ambiente: staging `bijbdsvejdzhpgyiykpi`  
Status: **bloqueada na Q5A; nenhuma nova chamada paga deve ser feita antes da correcao focada no Q4**

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
