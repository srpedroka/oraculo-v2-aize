# Plano mestre integrado de evolucao do Oraculo

Data: 2026-07-19

Status: **ATIVO - Plano 3 concluido; ciclo real R1 aguardando autorizacao**

Atualizacao de 2026-07-20: o release acumulado UX-C0/UX-C1 foi autorizado,
validado no CI #101, mesclado em `330190a` e publicado no deploy Netlify
`6a5de9e76733af06c6887d56`. A verificacao de producao e os smokes publico e
autenticado ficaram verdes, sem backend, dados, WhatsApp ou IA paga. O progresso
permanece 39% geral e 40% no Plano 3; publicacao nao cria pontuacao adicional.

Atualizacao UX-C2 de 2026-07-20: o caminho critico do gestor foi simplificado
no draft `6a5dfa113c90387d0905fc6e`, com Dashboard, origem anual, desdobramento
trimestral, Documentos, navegacao e configuracoes validados em desktop/mobile.
Nao houve backend, dados ou IA paga. O owner aprovou o gate em 2026-07-20; o
progresso passa para 41% geral e 60% no Plano 3. Producao permanece inalterada.

Atualizacao UX-C3 de 2026-07-20: o painel do Oraculo passou a mostrar contexto,
fase e proposta dos seis rituais, com uma confirmacao principal, ajuste,
descarte e sucesso ligado ao documento canonico. A Function `oracle-session`
foi publicada somente no staging; repeticoes pelo app e WhatsApp devolvem o
mesmo documento sem nova mutacao. O draft e
`https://6a5e2b72df0f2fded70554e3--oraculo-v2-aize.netlify.app`. O gate do owner
foi aprovado em 2026-07-20; o progresso passa para 43% geral e 80% no Plano 3.
Producao nao foi alterada e continua em gate separado.

Atualizacao UX-C4 de 2026-07-20: foco, teclado, dialogs, viewport dinamico,
safe area, alvos de toque e contraste AA foram aplicados ao caminho critico no
draft `https://6a5e39c470f0f2420ba96122--oraculo-v2-aize.netlify.app`.
Desktop 1280x720, celulares 390x844/430x932 e altura reduzida de 430x520
passaram E2E, Axe e inspecao visual. Nao houve backend, dado de producao ou IA
paga. O owner aprovou o gate em 2026-07-20; o progresso passa para 45% geral e
100% no Plano 3. Producao segue inalterada.

Este documento passa a ser a autoridade unica para a ordem de execucao. Os
planos anteriores continuam versionados como memoria, evidencia e especificacao
detalhada, mas nao devem ser executados fora da sequencia definida aqui.

Painel oficial de porcentagens:
`plans/2026-07-19-painel-progresso-geral.md`.

O presente documento governa conteudo, ordem e gates. O painel governa o status
percentual e aponta para os oito planos especificos em `plans/especificos/`.
Toda fatia aprovada deve atualizar os dois no mesmo ciclo.

## 1. Decisao de produto

O Oraculo ja possui a base funcional, tecnica e estrategica necessaria para
comecar a ser usado. O risco atual nao e faltar ideia de evolucao. O risco e
investir tempo em evolucoes que parecam boas sem saber onde gestores reais
travam, desconfiam ou desistem.

A ordem oficial passa a ser:

1. entender as friccoes do produto atual;
2. calibrar o design essencial, sem criar funcionalidade;
3. realizar uma revisao semestral completa do Plano Estrategico Anual, usando as
   evidencias e os resultados dos dois primeiros trimestres;
4. liberar o beta operacional em producao para todos os gestores;
5. encontrar e corrigir problemas durante o uso real, sem esperar perfeicao;
6. validar a operacao completa por area, app e WhatsApp;
7. concluir o acabamento restante orientado pelo uso;
8. puxar evolucoes futuras uma a uma, somente quando o gatilho aparecer.

Essa ordem preserva o trabalho anterior, reduz retrabalho e evita que o programa
de UX vire um redesign longo antes do primeiro contato real com gestores.

## 2. Fontes integradas

O plano incorpora integralmente:

- `plans/2026-07-16-qualidade-estrategica-operacional.md`: qualidade estrategica,
  Mapa A concluido e validacao operacional O0-O8;
- `plans/2026-07-18-pre-piloto-design-revisao-anual.md`: design do caminho
  critico, revisao estrategica, observacao de gestores e O1 oficial;
- `plans/2026-07-18-programa-ux-oraculo.md`: pesquisa U-P0/U-P1/U-P2 e execucao
  de usabilidade U-E0/U-E5;
- `plans/2026-07-18-backlog-evolucao-design.md`: backlog H3 EV1-EV12;
- `docs/STRATEGIC_QUALITY_STANDARD.md`: rubricas e falhas criticas;
- `docs/OPERATIONAL_PILOT_O0.md` e `docs/OPERATIONAL_PILOT_O1.md`: evidencias
  operacionais ja observadas.

Nenhum detalhe desses documentos e cancelado. Quando este plano resume uma
fatia, o documento de origem continua sendo a especificacao complementar. Em
caso de conflito, este plano decide a ordem e os gates; o documento de origem
preserva o detalhamento tecnico.

## 3. Estado de partida

### Concluido

- hardening tecnico de integridade, seguranca, RLS, filas, backup e recuperacao;
- Mapa A Q0-Q6 de qualidade estrategica;
- regressao estrategica final 40/40;
- O0 de preflight, backup e WhatsApp real;
- limpeza do ensaio trimestral descartavel;
- preservacao verificada de 1 Plano Estrategico Anual e 30 historicos;
- CI obrigatorio verde na `main`.

### Ainda nao iniciado oficialmente

- nenhum plano trimestral da O1 oficial;
- nenhuma revisao semestral real deste novo ciclo;
- nenhum teste de usabilidade com gestor;
- nenhuma fatia do programa H1;
- nenhuma evolucao H3.

## 4. Analise de sobreposicao e decisao

### 4.1 D0 e U-P0

`D0` auditava o caminho de planejamento/revisao. `U-P0` auditava o app inteiro.
Viraram uma unica fase `UX-P0`:

- cobertura ampla do app;
- aprofundamento obrigatorio no caminho critico do piloto;
- inventario KEEP / SIMPLIFICAR / FUNDIR / CORTAR;
- nenhuma mudanca de codigo.

### 4.2 D1 e U-E0/U-E5

`D1` e as ondas U-E compartilham tokens, hierarquia, feedback, conversa,
confirmacao, mobile e navegacao. Para evitar um programa longo antes de ouvir o
gestor, a execucao foi dividida:

- **calibracao pre-teste:** fundacao e caminho critico;
- **acabamento pos-evidencia:** restante do app e cortes maiores.

Todos os itens U-E0/U-E5 continuam no plano. Apenas a ordem mudou.

### 4.3 U1/U2, O1-O7 e o beta coletivo

O plano anterior isolava um gestor em clone e deixava os demais para o fim. A
decisao do owner e usar o proprio beta coletivo como fonte de evidencia:

- todos os gestores atuais recebem acesso depois da revisao semestral;
- cada gestor trabalha na propria area e com dados reais;
- as tecnicas de observacao de U1/U2 continuam valendo;
- O1-O7 deixam de ser uma fila que bloqueia novos participantes e viram jornadas
  de validacao executadas dentro do beta;
- clone/staging continua sendo usado para reproduzir e corrigir defeitos, nao
  como ambiente principal dos gestores.

O beta aceita encontrar erros. Ele nao aceita iniciar com P0 conhecido nem
continuar quando houver risco de perda de dados, vazamento entre empresas,
permissao indevida ou mutacao destrutiva.

### 4.4 R1 vira Revisao Semestral do Plano Estrategico Anual

R1 nao e mais a revisao de um objetivo isolado. Ela passa a revisar o plano
anual inteiro com base no primeiro semestre:

- resultados de T1 e T2;
- KPIs, metas e tendencias disponiveis;
- objetivos, projetos, acoes e evidencias;
- fechamentos, check-ins e aprendizados;
- contexto dos documentos historicos relevantes;
- desvios, causas confirmadas, riscos e decisoes pendentes.

A saida principal e um Resumo Estrategico do Semestre, seguido de uma proposta
consolidada para manter, reforcar, ajustar, despriorizar ou substituir pontos do
plano anual. Nada muda silenciosamente: fatos sem evidencia sao marcados como
lacuna e todos os ajustes materiais entram em uma unica conferencia final.

Isso amplia o escopo funcional da revisao atual. Antes da execucao real, R1A
deve provar em staging que o condutor, o contexto e o documento suportam o plano
inteiro sem perder o limite de uma confirmacao e sem sobrescrever o original.

### 4.5 H1 dividido antes e depois do beta

O programa de UX original colocava U-E0/U-E5 inteiras antes do uso real. Essa
ordem foi alterada para atender a decisao do owner:

- pesquisa completa antes do teste;
- calibracao essencial antes do teste;
- todos os gestores cedo;
- correcoes P0/P1;
- restante de H1 orientado pelas evidencias.

O gate H1 continua existindo. Uma fatia so e considerada encerrada quando seu
escopo foi entregue, rejeitado ou adiado com evidencia documentada.

## 5. Principios inviolaveis

1. Mesmo usuario, mesmas tarefas, menos esforco.
2. Nenhuma funcionalidade nova durante H1.
3. Nenhuma migration durante H1, salvo bug de seguranca aprovado separadamente.
4. Nenhuma nova superficie de produto durante H1.
5. Todos os gestores participam cedo, depois da calibracao e da revisao semestral.
6. O owner valida a revisao semestral e autoriza a abertura coletiva do beta.
7. Proposta de negocio exige uma unica confirmacao.
8. Nenhum erro pode ser silencioso ou apagar o rascunho.
9. WhatsApp e app devem preservar o mesmo contexto operacional.
10. Plano anual e historicos oficiais nao podem ser usados como massa descartavel.
11. IA avaliadora nunca grava nem corrige dados.
12. H3 permanece congelado ate que o uso dispare um gatilho.
13. Nenhuma compra, credito, assinatura ou upgrade sem autorizacao explicita.
14. Cada fatia pode ser ajustada no caminho sem perder a rastreabilidade.
15. Erro de usabilidade faz parte do beta; erro de seguranca, isolamento ou perda
    de dados pausa imediatamente o fluxo afetado.

## 6. Protocolo de toda fatia

Antes de executar:

1. apresentar o problema;
2. explicar o que muda para o usuario;
3. explicar o que nao muda;
4. listar arquivos, ambientes e dados afetados;
5. estimar custo de IA e qualquer outro custo;
6. definir testes, gate e rollback;
7. aguardar aprovacao explicita.

Depois de implementar:

1. rodar testes proporcionais ao risco;
2. rodar lint e build quando houver codigo;
3. validar desktop e mobile quando houver UI;
4. publicar primeiro em staging;
5. realizar revisao critica independente do diff;
6. obter aprovacao do owner navegando no staging;
7. publicar apenas o runtime afetado;
8. fazer smoke de producao;
9. atualizar changelog, plano e handoff;
10. fazer commit, push e esperar CI obrigatorio verde.

## 7. Mapa integrado

```text
FUNDACAO CONCLUIDA
Hardening -> Qualidade Q0-Q6 -> O0 -> limpeza
                         |
                         v
H1A PESQUISA DE USABILIDADE
UX-P0 -> UX-P1 -> UX-P2
                         |
                         v
H1B CALIBRACAO MINIMA PRE-TESTE
UX-C0 -> UX-C1 -> UX-C2 -> UX-C3 -> UX-C4
                         |
                         v
VALIDACAO ESTRATEGICA
R1A prontidao -> R1B revisao semestral real
                         |
                         v
BETA COLETIVO EM PRODUCAO
B0 preflight -> B1 todos os gestores
                         |
                         v
JORNADAS O1-O7 + B2 TRIAGEM CONTINUA
                         |
                         v
H1C ACABAMENTO ORIENTADO PELA EVIDENCIA
UX-R0 -> UX-R1 -> UX-R2
                         |
                         v
PORTAO H2 + O8 OPERACAO ASSISTIDA
                         |
                         v
H3 EVOLUCAO POR GATILHO
EV1...EV12, uma de cada vez
```

## 8. H1A - Pesquisa de usabilidade

## UX-P0 - Auditoria unica de friccao

Estado em 2026-07-19: auditoria concluida em producao somente leitura, desktop e
mobile, e aprovada pelo owner. DDR em
`plans/ddr/UX-P0-auditoria-friccao.md`. O gate soma 40 pontos ao Plano 2 e leva
o plano geral a 29%.

### Objetivo

Descobrir onde o produto atual e dificil, confuso, cansativo ou inseguro, sem
alterar o app.

### Cobertura

- primeiro acesso e entendimento da empresa;
- Dashboard;
- Plano Estrategico;
- Revisao Estrategica;
- Planos Trimestrais;
- painel do Oraculo;
- proposta, ajuste, confirmacao, sucesso e erro;
- Documentos e PDF;
- Areas e coordenadores;
- Execucao e fechamento;
- KPI e importacao;
- Arquivo;
- Configuracoes, membros, IA, WhatsApp e backups;
- app e WhatsApp;
- owner e coordenador;
- desktop e celular.

### Metodo

1. Executar as tarefas existentes em staging ou somente leitura.
2. Para cada passo responder:
   - o usuario sabe onde esta?
   - sabe o que fazer?
   - entende o texto?
   - recebe feedback?
   - consegue se recuperar de erro?
   - o que compete por atencao sem merecer?
3. Medir cliques, turnos, espera, scroll e retornos.
4. Classificar cada elemento como KEEP, SIMPLIFICAR, FUNDIR ou CORTAR.
5. Separar friccao observada de preferencia estetica.
6. Incorporar O0/O1 e incidentes anteriores como evidencia.

### Saidas

- DDR `plans/ddr/UX-P0-auditoria-friccao.md`;
- inventario por fluxo;
- severidade P0/P1/P2;
- matriz impacto x esforco;
- lista exata do caminho critico pre-teste;
- hipoteses a levar ao gestor, sem apresenta-las como fatos.

### Gate

Owner aprova o inventario e o caminho critico. Zero codigo e zero custo de IA.

## UX-P1 - Sistema de design minimo

Estado em 2026-07-19: inventario, tokens e contratos de componentes concluidos
sem alterar runtime e aprovados pelo owner. DDR em
`plans/ddr/UX-P1-design-system.md` e fonte visual em `docs/DESIGN_SYSTEM.md`.
O gate soma 30 pontos ao Plano 2 e leva o plano geral a 32%.

### Objetivo

Definir a linguagem visual das telas existentes antes de alterar componentes.

### Trabalho

- auditar Tailwind e `src/components/ui/`;
- fixar paleta neutra, marca e semanticas de saude;
- definir tipografia, espacamento, raios, sombras e motion;
- definir estados de botao, card, badge, status, tabela, lista e formulario;
- definir contraste AA e foco por teclado;
- limitar verde, ambar e vermelho a estados semanticos;
- rejeitar dark extremo, contraste baixo e decoracao de dashboard.

### Saidas

- DDR `plans/ddr/UX-P1-design-system.md`;
- rascunho de `docs/DESIGN_SYSTEM.md`;
- tokens finais prontos para Tailwind;
- inventario de componentes que serao reutilizados ou fundidos.

### Gate

Owner aprova a direcao visual. Nenhum layout muda nesta fase.

## UX-P2 - Interacao atual com a IA

### Objetivo

Especificar como a capacidade existente da IA aparece na interface, sem mudar o
que ela sabe fazer.

### Estados obrigatorios

- disponivel;
- pensando;
- resposta recebida;
- proposta pendente;
- ajustando;
- gravando;
- sucesso;
- erro recuperavel;
- sessao retomada;
- sessao expirada ou descartada.

### Decisoes

- contexto persistente de ritual, empresa, area, periodo e ano;
- proposta visualmente separada da conversa;
- bloco antes/depois quando houver revisao;
- uma confirmacao primaria;
- ajustar e descartar como comandos secundarios;
- erro humano na tela e codigo tecnico recolhido;
- retry preservando proposta e idempotencia;
- textos equivalentes e naturais no WhatsApp.

### Saida

DDR `plans/ddr/UX-P2-interacao-ia.md`.

### Gate

Fluxo completo aprovado pelo owner antes de alterar `OraclePanel`.

## 9. H1B - Calibracao minima antes dos gestores

Esta fase nao executa o programa inteiro de acabamento. Ela entrega apenas o
necessario para que os gestores avaliem o produto, e nao defeitos visuais
obvios ja conhecidos.

## UX-C0 - Fundacao visual

Origem: U-E0.

### Trabalho

- aplicar tokens aprovados no Tailwind;
- consolidar Button, Card, Badge, Status, tabela/lista e formulario;
- manter os layouts e rotas atuais;
- remover estilos locais contraditorios apenas quando cobertos pelo componente;
- documentar componentes e estados.

### Testes

- regressao visual dos componentes;
- contraste e foco;
- unitarios;
- lint e build;
- bundle;
- screenshots desktop/mobile.

### Gate

Fundacao consistente sem alterar tarefa, dado ou navegacao.

## UX-C1 - Feedback critico e estados vazios

Origem: U-E1, primeira subfatia.

### Escopo pre-teste

- login e primeiro acesso;
- painel do Oraculo;
- inicio e retomada de sessao;
- proposta e confirmacao;
- Planos Trimestrais;
- Plano Estrategico e Revisao;
- Documentos;
- erros de leitura e gravacao.

### Trabalho

- feedback em ate 1 segundo;
- salvando, sucesso e erro visiveis;
- retry seguro;
- rascunho preservado;
- nenhuma mensagem tecnica aberta;
- estados vazios com proximo comando claro;
- bloquear duplo clique sem bloquear recuperacao.

### Gate

Nenhuma acao critica e silenciosa; falhas simuladas sao recuperaveis.

## UX-C2 - Clareza do caminho do gestor

Origem: D1, U-E2 e U-E3, somente caminho critico.

### Telas

- navegacao principal;
- Dashboard como chegada;
- Plano Estrategico como origem;
- Planos Trimestrais como tarefa;
- painel do Oraculo como condutor;
- Documentos como comprovacao.

### Trabalho

- hierarquia visual e microcopy;
- contexto secundario discreto;
- status pequenos e semanticos;
- resumo antes do detalhe;
- numeros existentes sempre com meta/tendencia quando disponiveis;
- eliminar ruido comprovado;
- preservar todas as tarefas atuais;
- nenhum novo painel, pagina ou objeto.

### Gate

Um coordenador consegue dizer onde esta, o que esta fazendo e onde encontra o
resultado sem explicacao verbal do observador.

## UX-C3 - Proposta e confirmacao da IA

Origem: D1, U-E4 e UX-P2.

### Trabalho

- contexto persistente do ritual;
- progresso discreto;
- proposta destacada;
- `Vai mudar` e `Permanece igual` na Revisao;
- antes/depois/motivo por campo;
- uma confirmacao;
- ajustar e descartar;
- sucesso com link para o documento;
- retomada compreensivel;
- paridade de texto no WhatsApp.

### Gate

O usuario entende o que sera gravado sem reler todo o chat e confirma uma vez.

## UX-C4 - Mobile e acessibilidade do caminho critico

Origem: U-E5, primeira subfatia.

### Trabalho

- viewport sem sobreposicao;
- scroll interno coerente;
- modais centralizados na janela;
- teclado aberto sem esconder acao primaria;
- texto sem corte;
- alvos de toque adequados;
- foco restaurado ao fechar;
- contraste AA;
- leitura por teclado e sem mouse.

### Gate

Jornada critica completa em desktop e dois tamanhos de celular.

## 10. R1 - Revisao Semestral do Plano Estrategico Anual

R1 deixa de ser a revisao isolada de um objetivo anual. Passa a ser a revisao
do Plano Estrategico Anual inteiro a partir das evidencias, resultados e contexto
acumulados nos dois primeiros trimestres.

Essa mudanca e funcional: a revisao existente foi desenhada para microajustes.
Antes de usar dados reais, e necessario provar que o condutor, o contexto e o
documento canonico suportam a leitura do semestre completo sem sobrescrever o
plano original nem inventar conclusoes.

Decisao do owner em 2026-07-20: a prova de qualidade principal sera feita na
pratica, com o Plano Anual e os relatorios reais do primeiro semestre. R1A vira
um preflight tecnico curto, com inventario real somente em leitura e seguranca
validada no staging. R1B usa o Oraculo em producao com o owner e deve entregar a
Revisao Semestral e o Plano Estrategico do Segundo Semestre. Testes sinteticos
continuam apenas como protecao tecnica e nao substituem a avaliacao real.

Decisao complementar do owner: a experiencia passa a seguir a arquitetura
AI-first de `plans/ddr/AI-first-arquitetura-conversacional.md`. Guias orientam a
IA e nao executam a conversa como formulario; o servidor mantem autoridade
sobre gravacao e seguranca. A Revisao Semestral sera a primeira prova vertical.
O rollout aos demais rituais deve ocorrer antes do beta coletivo, mas sua
distribuicao em pontos sera apresentada separadamente para nao alterar o plano
silenciosamente.

## R1A - Prontidao e contrato da revisao semestral

### Pacote de contexto

O Oraculo deve montar, sem gravar alteracoes:

- Plano Estrategico Anual canonico, objetivos, projetos e responsaveis;
- planos trimestrais de T1 e T2, por area, com seus vinculos anuais;
- planos mensais, check-ins, fechamentos, compromissos e aprendizados;
- KPIs com metas, realizados, unidade, fonte e tendencia mensal;
- evidencias relacionadas aos objetivos e acoes;
- documentos historicos relevantes para explicar decisoes ou recorrencias;
- lacunas de informacao, divergencias e itens sem evidencia suficiente.

O recorte temporal e janeiro a junho do ano revisado. Conteudo fora desse
periodo pode servir apenas como contexto explicitamente identificado.

### Estrutura minima da saida

1. contexto e escopo do semestre;
2. resumo executivo dos resultados;
3. leitura por objetivo anual: esperado, realizado, evidencias e confianca;
4. KPIs: meta, atingido, tendencia e desvios relevantes;
5. projetos e acoes: avancos, atrasos, bloqueios e dependencia;
6. aprendizados, causas confirmadas, riscos e decisoes pendentes;
7. pontos do plano que devem ser mantidos ou reforcados;
8. ajustes propostos: alterar, despriorizar, substituir ou complementar;
9. prioridades recomendadas para o segundo semestre.

Fato ausente deve aparecer como `evidencia insuficiente`, nunca como suposicao.
A IA pode interpretar e recomendar, mas precisa apontar a origem material de
cada conclusao relevante.

### Experiencia e gravacao

- conversa natural, executiva e objetiva;
- perguntas somente para lacunas que mudem uma conclusao ou decisao;
- resumo primeiro, detalhes por objetivo depois;
- proposta consolidada dos ajustes, separada do diagnostico;
- owner pode ajustar a proposta antes de gravar;
- uma unica conferencia final e uma unica confirmacao;
- nenhuma mutacao antes da confirmacao;
- documento canonico `Revisao Semestral do Plano Estrategico Anual`;
- plano anual original preservado, com versao e auditoria do antes/depois.

### Implementacao minima

1. inventariar os limites atuais de `strategic_review`;
2. ampliar apenas condutor, montagem de contexto, proposta e documento exigidos;
3. reutilizar `planning_sessions`, `plan_documents`, versionamento e auditoria;
4. evitar tabela nova; migration exige justificativa e briefing proprio;
5. testar primeiro com fixtures no staging;
6. publicar somente depois da aprovacao do owner.

### Testes de R1A

- periodo T1/T2 correto, sem misturar outro ano;
- cobertura de todas as areas e objetivos anuais aplicaveis;
- nenhuma contaminacao entre empresa, area ou documento;
- rastreabilidade das conclusoes ate evidencias reais;
- lacunas declaradas sem fabricacao;
- uma proposta e uma confirmacao;
- plano original intacto antes da confirmacao;
- aplicacao deterministica somente dos ajustes aprovados;
- banco, documento, tela, PDF e WhatsApp materialmente coerentes;
- tentativa repetida sem duplicacao;
- custo e uso de IA registrados.

### Gate R1A

Staging verde, estrutura aprovada pelo owner, rubricas individuais >= 80, media
>= 85 e zero falha critica.

Status em 2026-07-20: R1A tecnicamente aprovada. O modelo de sessao agora e
AI-first, `strategic_review` possui roteamento proprio, interrupcoes naturais
preservam o estado, arquivos entram como contexto transitorio e o recorte
janeiro-junho agrega T1/T2, areas, KPIs, evidencias, check-ins e documentos. A
confirmacao real de banco preservou o plano anual sem ajuste explicito e foi
idempotente. O pacote canonico unico possui duas secoes, Revisao do Primeiro
Semestre e Plano do Segundo Semestre, mantendo tela, PDF e WhatsApp coerentes.
O teste pago opt-in foi pulado sem custo por ausencia da chave temporaria; por
decisao do owner, a prova qualitativa ocorre na R1B real em producao. Progresso:
Plano 4 em 50% e geral em 52,5%.

## R1B - Execucao real com o owner

### Preparacao

1. confirmar ano, empresa e periodo janeiro-junho;
2. gerar backup e fingerprints dos registros afetaveis;
3. registrar contagens e versao do Plano Estrategico Anual;
4. validar integridade do pacote de contexto;
5. explicar o que podera mudar e o que sera apenas analisado.

### Execucao

1. gerar o Resumo Estrategico do Semestre;
2. revisar resultados por objetivo, area e KPI;
3. registrar lacunas, riscos, aprendizados e decisoes pendentes;
4. propor manutencoes e ajustes para o segundo semestre;
5. permitir correcoes do owner sem reiniciar a sessao;
6. apresentar uma conferencia final consolidada;
7. gravar uma vez, somente apos a confirmacao do owner.

### Entregas

- documento canonico da Revisao Semestral;
- resumo executivo do primeiro semestre;
- relacao do que foi mantido, reforcado, alterado, despriorizado ou substituido;
- prioridades e decisoes do segundo semestre;
- lacunas que continuam abertas;
- trilha antes/depois, custo e referencias usadas.

### Gate R1B

- Plano Estrategico Anual e historicos originais preservados;
- nenhuma alteracao alem da proposta confirmada;
- zero duplicata e zero falha critica;
- conducao >= 80, revisao >= 80 e saida derivada >= 80;
- media >= 85;
- owner aprova clareza, fidelidade, utilidade e prioridades do segundo semestre.

### Rollback

Reverter apenas o lote de ajustes confirmado, usando versao e auditoria. Nunca
restaurar a empresa inteira por erro localizado.

## 11. B0 - Preparacao do beta coletivo

Depois de R1B, o app e liberado em producao para todos os gestores aprovados
pelo owner. O objetivo e descobrir friccoes na rotina real cedo, sem fingir que
o produto ja esta perfeito.

### Preflight obrigatorio

1. owner aprova a lista nominal de gestores, areas e papeis;
2. telefones, memberships, responsaveis e permissoes sao conferidos;
3. Plano Anual revisado e historicos permanecem acessiveis;
4. backup, baseline de contagens e fingerprints sao registrados;
5. WhatsApp, filas, outbox, IA, Storage e monitoramento estao saudaveis;
6. cada gestor recebe convite somente por WhatsApp e o link do app;
7. orientacao curta informa objetivo do beta e como relatar uma dificuldade;
8. limitacoes conhecidas sao comunicadas em linguagem simples.

Nao criar uma nova central de suporte para iniciar o beta. O feedback pode usar
o proprio WhatsApp e o registro operacional existente, desde que cada relato
tenha gestor, area, fluxo, horario e resultado observado.

### Gate B0

- zero P0 conhecido;
- P1 conhecido tem contorno claro e ciencia do owner;
- rollback e monitoramento prontos;
- nenhum convite e enviado sem autorizacao explicita do owner.

## 12. B1 - Beta coletivo em producao

### Participantes e ambiente

- todos os gestores autorizados;
- empresa e dados reais;
- cada gestor opera somente a propria area e permissoes;
- app e WhatsApp disponiveis conforme o papel;
- staging e clone ficam reservados para reproduzir e corrigir falhas.

### Primeiras atividades

1. entrar pelo link recebido no WhatsApp;
2. localizar o Plano Estrategico Anual revisado e entender o contexto;
3. criar ou revisar o plano trimestral da propria area;
4. conferir e confirmar a proposta uma vez;
5. localizar o documento gerado;
6. consultar e atualizar a execucao pelo WhatsApp;
7. usar KPI, revisao mensal e fechamento quando aplicavel.

O gestor recebe a tarefa, nao um tutorial detalhado. O observador nao responde
por ele nem corrige a interface durante o uso.

### Medidas por gestor e area

- tarefa iniciada, concluida, abandonada ou resgatada;
- tempo, turnos, pedidos de ajuda e tentativas;
- perda de contexto, pergunta repetida e confirmacao duplicada;
- cliques sem resultado e dificuldade de localizar informacao;
- coerencia entre conversa, banco, documento, Dashboard e WhatsApp;
- utilidade, clareza, naturalidade e confianca de 1 a 5;
- comentario livre: ajudou, cansou, confundiu ou faltou.

Erros seguros fazem parte do beta e nao exigem interromper todos os gestores.
Dados reais nao sao apagados no cleanup; artefato realmente equivocado deve ser
arquivado pela trilha operacional, com auditoria.

## B2 - Triagem e correcao continua

### Classificacao

- **P0:** perda ou exposicao de dado, acesso entre empresas/areas, permissao
  indevida, mutacao destrutiva, mensagem em loop ou bloqueio total do fluxo;
- **P1:** contexto incorreto sem dano, pergunta circular, confirmacao repetida,
  erro sem recuperacao ou interface que exige ajuda material;
- **P2:** texto, espacamento, preferencia ou melhoria sem impacto operacional.

### Regra de continuidade

- P0 pausa imediatamente o fluxo afetado; se houver risco transversal, pausa o
  beta, preserva evidencias e abre incidente;
- P1 pode conviver com o beta quando houver contorno seguro, com correcao rapida
  e teste direcionado;
- P2 entra no acabamento orientado pela evidencia;
- pedido de funcionalidade nao vira codigo automaticamente; vai para H3 ou
  backlog operacional com evidencia.

### Ciclo de correcao

1. registrar gestor, area, fluxo, horario e efeito;
2. reproduzir com fixture ou clone;
3. escrever teste que falha;
4. apresentar briefing e eventual mudanca funcional;
5. corrigir o menor escopo;
6. validar local e staging;
7. publicar com aprovacao do owner quando necessario;
8. repetir apenas o cenario afetado;
9. depois de todos os cenarios verdes, rodar regressao geral.

## 13. H2 - Jornadas de validacao dentro do beta

O1-O7 deixam de ser fases que liberam um gestor por vez. Elas formam uma matriz
de cobertura executada em paralelo no beta B1, com estado por gestor e area:
`nao iniciado`, `em andamento`, `aprovado` ou `com problema`.

## O1 - Plano trimestral oficial por area

- gestor escolhe objetivo anual revisado, area, trimestre, ano e responsavel;
- baseline e backup;
- um unico plano por sessao;
- resultado, baseline, meta, fonte, dono, prazo e poucas acoes;
- proposta unica e confirmacao unica;
- validacao de conversa, banco, documento, rubricas e custo.

Gate: notas >= 80, media >= 85, zero falha critica e aprovacao do gestor.

## O2 - Integridade de plano e documento

- amostrar planos de todas as areas participantes;
- conferir area, periodo, origem anual, responsavel, objetivo, medidas e acoes;
- conferir ausencia de duplicidade e `plan_documents`;
- abrir tela e PDF A4;
- comparar conversa, banco, documento e auditoria.

Gate: igualdade material nas representacoes e nenhuma mistura entre areas.

## O3 - Continuidade pelo WhatsApp

- pedir resumo do plano oficial da propria area;
- confirmar area e periodo;
- consultar status e registrar atualizacao concreta;
- testar mensagem ambigua sem mutacao;
- retomar depois de novo episodio;
- conferir fila, outbox, custo e ausencia de duplicacao.

Gate: contexto correto, resposta natural e somente mutacao explicita.

## O4 - Audio, documento e memoria

- audio curto com alvo operacional;
- transcricao e compreensao;
- documento relacionado e leitura real do conteudo;
- documento de outra area sem contaminacao;
- historico relevante lembrado;
- bruto, URL temporaria e chave de midia nao persistidos.

Gate: conteudo compreendido e fronteiras de area e seguranca respeitadas.

## O5 - KPI, Dashboard e revisao

- sugestao de KPI com justificativa e confirmacao;
- importacao controlada de Meta/Atingido;
- mes, unidade, formato, fonte e historico;
- revisao mensal com confianca, bloqueio e proximo compromisso;
- Dashboard, documento e auditoria coerentes.

Gate: KPI confirmado, valores corretos e revisao util.

## O6 - Consolidacao do beta pelo owner

- cobertura por gestor, area e jornada;
- documentos, PDFs, custos, auditoria e backup pos-beta;
- comparacao de contagens e incidentes;
- problemas de UX classificados em P0/P1/P2;
- rubricas aplicaveis e decisoes de manter, corrigir ou adiar.

Gate: nenhuma area sem diagnostico e nenhuma falha critica aberta.

## O7 - Aceite coletivo da operacao real

- todos os gestores autorizados tiveram oportunidade real de uso;
- ao menos um fluxo principal foi concluido por area aplicavel;
- app e WhatsApp foram exercitados sem o agente responder pelo gestor;
- utilidade e clareza >= 4/5 ou excecao explicita e justificada;
- rubricas >= 80 e zero falha critica aberta;
- owner aprova continuar a operacao assistida.

## 14. H1C - Acabamento orientado pela evidencia

Durante B1/B2 e depois do aceite coletivo O7, o programa H1 restante e
replanejado sem perder o inventario.

## UX-R0 - Feedback e clareza restantes

Preserva o restante de U-E1, U-E2 e U-E3:

- Dashboard;
- Execucao;
- painel do Oraculo;
- Estrategico;
- Trimestrais;
- Documentos;
- Areas;
- Arquivo;
- Configuracoes;
- importacoes;
- administracao.

Entram primeiro as friccoes observadas. Itens sem evidencia permanecem no
inventario e podem ser encerrados como `nao necessario agora`.

## UX-R1 - IA e WhatsApp restantes

Preserva o restante de U-E4:

- estados de painel nao cobertos no caminho critico;
- retomadas e episodios;
- textos do WhatsApp;
- propostas de outros rituais;
- importacoes e fechamentos;
- consistencia entre app e WhatsApp.

## UX-R2 - Navegacao, Configuracoes, mobile e cortes

Preserva o restante de U-E5:

- reorganizar apenas objetos e paginas existentes;
- mobile ponta a ponta;
- fundir ou cortar ruido aprovado;
- redirects de rotas antigas;
- nenhum dado inacessivel;
- nenhuma arquitetura dos sete dominios de EV12 antecipada.

### Gate H1

Cada item U-E0/U-E5 deve estar:

- entregue e validado;
- ou rejeitado com motivo;
- ou adiado com gatilho e owner.

Nao e obrigatorio implementar mudanca sem beneficio comprovado.

## 15. Portao H2

H2 abre quando:

1. R1B estiver aprovada e o Plano Estrategico Anual revisado for a referencia;
2. todos os gestores autorizados tiverem acesso ao beta;
3. O1-O7 tiverem cobertura suficiente entre gestores e areas;
4. um ciclo mensal real for completado no app e no WhatsApp;
5. nao houver P0 aberto e P1 tiver correcao ou aceite explicito do owner;
6. H1 tiver decisao explicita para todos os itens;
7. backups, auditoria e monitoramento estiverem saudaveis;
8. custos estiverem registrados;
9. owner autorizar avaliar H3.

## 16. H3 - Evolucao por evidencia

H3 continua congelado. Cada EV exige:

1. evidencia do gatilho;
2. DDR;
3. blueprint;
4. revisao adversarial;
5. briefing;
6. aprovacao;
7. execucao fatiada;
8. teste com usuario;
9. decisao de manter, ajustar ou remover.

## EV1 - Sala de Comando decisao-first

- **Entrega:** home responde saude, desvio, KPI relevante, bloqueio e decisao.
- **Gatilho:** usuarios abrem o app e nao sabem o que decidir.
- **Fundacao:** KPIs, status, progresso, nudges e propostas pendentes.
- **Pesquisa:** saude explicavel, sinais prioritarios, narrativa, fila e vazio.
- **Dependencia:** EV2 ou componentes de KPI equivalentes.
- **Cuidado:** narrativa de IA exige decisao de custo antes de codigo.

## EV2 - Pagina propria de Indicadores

- **Entrega:** KPI board, drill-down, meta, realizado, variacao, tendencia e
  vinculo com objetivo.
- **Gatilho:** KPI vira rotina e Dashboard nao basta ou origem do numero nao e
  compreendida.
- **Fundacao:** `executive_kpis`, valores mensais, links e importacao.
- **Pesquisa:** inline/dialog, causa, expansao e escada do Caixa.
- **Cuidado:** sem donut ou velocimetro; numero sempre com contexto.

## EV3 - Fila de decisoes pendentes

- **Entrega:** propostas, fechamentos, convites e aprovacoes que aguardam humano.
- **Gatilho:** decisoes se perdem entre app e WhatsApp.
- **Fundacao:** propostas pendentes, nudges, convites e periodos.
- **Pesquisa:** itens derivados, local, resolucao e paridade WhatsApp.
- **Cuidado:** nao transformar o app em workflow burocratico.

## EV4 - Riscos e excecoes

- **Entrega:** desvios de KPI, confianca, atrasos e bloqueios por impacto.
- **Gatilho:** problemas so aparecem no fechamento.
- **Fundacao:** status, prazo, progresso, KPI e nudges.
- **Pesquisa:** definicao, ciclo de vida e explicacao sem inventar causa.
- **Cuidado:** v1 derivada; nova estrutura so com evidencia separada.

## EV5 - Hub de Revisoes e relatorio executivo

- **Entrega:** fechamentos, revisoes, decisoes, aprendizados e relatorio.
- **Gatilho:** rituais viram rotina e diretoria monta relatorio manual.
- **Fundacao:** sessoes, documentos canonicos, check-ins e evidencias.
- **Pesquisa:** lista vs objeto novo, formato, edicao humana e relacao com
  Documentos/Arquivo.
- **Cuidado:** novo documento deve reutilizar o motor canonico.

## EV6 - Mapa estrategico visual

- **Entrega:** pilares -> objetivos -> trimestre -> KPI, com detalhe progressivo.
- **Gatilho:** mais pessoas entram e nao enxergam o vinculo com a estrategia.
- **Fundacao:** hierarquia, links de KPI e projetos.
- **Pesquisa:** view, edicao, progressive disclosure e layout.
- **Cuidado:** nao virar poster bonito sem uso.

## EV7 - Iniciativas, dependencias e marcos

- **Entrega:** projetos como iniciativas de primeira classe, timeline e marcos.
- **Gatilho:** projetos estrategicos reais passam a ser geridos no app.
- **Fundacao:** `strategic_projects` e `key_actions`.
- **Pesquisa:** v1 sem migration, v2 estrutural, area e estados.
- **Cuidado:** dependencias/marcos exigem evidencia forte e fatia propria.

## EV8 - Views salvas e filtros multiatributo

- **Entrega:** filtros, ordenacao, views e painel lateral.
- **Gatilho:** listas crescem e filtros sao repetidos.
- **Fundacao:** listas atuais.
- **Pesquisa:** primeiras listas, views por pessoa/empresa e limite de liberdade.
- **Cuidado:** Oraculo continua opinativo; nao virar planilha configuravel.

## EV9 - Command palette e busca global

- **Entrega:** busca e comandos para objetivos, documentos, areas, pessoas e acoes.
- **Gatilho:** volume torna a navegacao lenta ou usuarios pedem atalho.
- **Pesquisa:** busca local/endpoint, IA e mobile.
- **Cuidado:** mouse-first; medir uso e remover se nao gerar valor.

## EV10 - Narrativas executivas da IA

- **Entrega:** mudanca, causa sustentada e acao recomendada.
- **Gatilho:** usuarios pedem explicacao dos numeros com frequencia.
- **Fundacao:** pulso, fechamentos, evidencias e conversa.
- **Pesquisa:** custo, latencia, evento, cache, citacao e tom.
- **Cuidado:** sem evidencia, a IA deve declarar incerteza ou calar.

## EV11 - Cenarios e decomposicao anual

- **Entrega:** plano, realizado, forecast e poucas alternativas.
- **Gatilho:** ciclo anual real esbarra em limitacao concreta.
- **Pesquisa:** cenario simples, dado novo e leitura derivada.
- **Cuidado:** nao virar ferramenta de FP&A.

## EV12 - Navegacao em sete dominios

- **Entrega:** Comando, Direcao, Trimestre, Execucao, Indicadores, Riscos e
  Revisoes.
- **Gatilho:** pelo menos quatro EVs entregues e menu atual comprovadamente
  apertado.
- **Pesquisa:** arvore real, redirects, onboarding e referencias do WhatsApp.
- **Cuidado:** e a ultima evolucao, nunca a primeira.

### Fora do backlog

- dark mode extremo;
- metodologia totalmente configuravel;
- modelagem financeira profunda;
- donuts, velocimetros e decoracao;
- excesso de aprovacoes.

## 17. O8 - Saida do beta e operacao assistida

Como todos os gestores ja participaram de B1, O8 nao e uma expansao gradual de
usuarios. E a decisao de encerrar o rotulo de beta e assumir a operacao
assistida como rotina oficial.

1. consolidar cobertura, aprendizados e pendencias do beta;
2. zerar P0 e resolver ou aceitar explicitamente cada P1;
3. manter P2 comprovado no acabamento ou backlog, sem bloquear operacao;
4. confirmar cadencia de suporte, revisoes e monitoramento;
5. completar o primeiro ciclo trimestral com todas as areas aplicaveis;
6. comparar resultados e friccoes entre areas;
7. decidir quais gatilhos H3 foram realmente comprovados.

Gate: owner declara a operacao assistida oficial e registra as pendencias que
continuam abertas sem risco critico.

## 18. Metricas unificadas

### Usabilidade

- conclusao da tarefa;
- tempo e turnos;
- pedidos de ajuda;
- erros e retries;
- cliques sem resultado;
- confirmacoes por gravacao;
- capacidade de localizar documento;
- utilidade, clareza, naturalidade e confianca.

### Qualidade estrategica

- rubricas individuais >= 80;
- media >= 85;
- zero falha critica;
- plano superior corretamente vinculado;
- resultado mensuravel;
- poucas prioridades;
- conversa, banco e documento coerentes.

### Operacao

- fila e outbox saudaveis;
- nenhuma duplicidade;
- RLS e papeis corretos;
- backup protegido;
- auditoria sanitizada;
- custo registrado;
- app e WhatsApp equivalentes;
- cobertura por gestor, area e jornada;
- P0 aberto igual a zero e P1 com responsavel/decisao.

### Design

- contraste AA;
- foco visivel;
- nenhuma sobreposicao;
- viewport mobile;
- feedback em ate 1 segundo;
- nenhum texto tecnico visivel;
- somente componentes do design system.

## 19. Financeiro

- ciclo atual autorizado: US$ 20;
- consumo de partida: US$ 0,025465;
- aviso: US$ 15;
- parada preventiva: US$ 19;
- pesquisa e design sem IA nao devem consumir API;
- geracao e judge devem ser informados separadamente;
- nenhuma compra, credito, upgrade ou assinatura sem autorizacao explicita.

## 20. Ambientes e dados

| Fase | Ambiente | Dado real | Gravacao |
| --- | --- | --- | --- |
| UX-P0/P2 | Staging/leitura | Nao necessario | Nao |
| UX-C0/C4 | Local + staging | Fixture | UI |
| R1A | Staging + inventario de producao em leitura | Fixture/contexto | Nao |
| R1B | Producao | Plano anual e semestre reais | Uma confirmacao |
| B0 | Producao em leitura | Gestores, areas e saude | Nao |
| B1/O1-O7 | Producao monitorada | Sim | Confirmada por papel |
| B2 | Local/staging e fluxo afetado em producao | Fixture antes do real | Controlada |
| UX-R0/R2 | Local + staging | Fixture | UI |
| H3 | Conforme EV | Conforme briefing | Conforme gate |

## 21. Rollback

- UI: reverter bundle/componentes, sem tocar dados;
- R1B: reverter somente o lote confirmado, preservando versoes e auditoria;
- B1: pausar o fluxo afetado, preservar evidencias e manter os demais gestores
  quando nao houver risco transversal;
- O1-O7: arquivar somente artefato divergente pela trilha operacional;
- WhatsApp: preservar fila/outbox e diagnosticar antes de reenviar;
- H3: rollback especifico por EV;
- nunca restaurar a empresa inteira por erro localizado;
- nunca apagar dados reais do gestor como cleanup;
- nunca apagar historicos ou Plano Estrategico Anual em cleanup.

## 22. Matriz de rastreabilidade

| Fonte original | Destino neste plano | Estado |
| --- | --- | --- |
| Q0-Q6 | Fundacao concluida | Preservado |
| O0 | Fundacao concluida | Preservado |
| D0 | UX-P0 | Fundido sem perda |
| D1 | UX-C0/C4 | Dividido por risco |
| R1 | R1A/R1B | Ampliado para revisao semestral do plano inteiro |
| U1 | B1 | Transformado em observacao coletiva em producao |
| U2 | B2 | Preservado como triagem continua |
| O1-O6 | H2 O1-O6 | Preservado como jornadas dentro do beta |
| O7 | O7 coletivo | Ampliado para aceite de todos os gestores |
| O8 | O8 operacao assistida | Transformado em saida do beta |
| U-P0 | UX-P0 | Ampliado pelo D0 |
| U-P1 | UX-P1 | Preservado |
| U-P2 | UX-P2 | Preservado |
| U-E0 | UX-C0 | Preservado |
| U-E1 | UX-C1 + UX-R0 | Dividido antes/depois |
| U-E2 | UX-C2 + UX-R0 | Dividido antes/depois |
| U-E3 | UX-C2 + UX-R0 | Dividido antes/depois |
| U-E4 | UX-C3 + UX-R1 | Dividido antes/depois |
| U-E5 | UX-C4 + UX-R2 | Dividido antes/depois |
| EV1-EV12 | H3 EV1-EV12 | Preservado e congelado |
| Rejeitados H3 | Fora do backlog | Preservado |

## 23. Ordem executavel

| Ordem | Fatia | Mudanca de produto | Usuario real | Gate |
| ---: | --- | --- | --- | --- |
| 1 | UX-P0 | Nao | Nao | Auditoria aprovada |
| 2 | UX-P1 | Nao | Nao | Sistema visual aprovado |
| 3 | UX-P2 | Nao | Nao | Interacao IA aprovada |
| 4 | UX-C0 | Visual | Owner no staging | Fundacao verde |
| 5 | UX-C1 | UX | Owner no staging | Feedback recuperavel |
| 6 | UX-C2 | UX | Owner no staging | Caminho compreensivel |
| 7 | UX-C3 | UX | Owner no staging | Uma confirmacao |
| 8 | UX-C4 | UX | Owner no staging | Mobile/AA verdes |
| 9 | R1A | Suporte a revisao semestral | Owner no staging | Contrato verde |
| 10 | R1B | Revisao semestral real | Owner | Revisao aprovada |
| 11 | B0 | Preparacao e convites | Owner | Preflight verde |
| 12 | B1 | Beta coletivo | Todos os gestores | Uso real iniciado |
| 13 | B2 | Correcoes P0/P1 | Gestores + owner | Triagem continua |
| 14 | O1-O5 | Jornadas operacionais | Gestores por area | Cobertura suficiente |
| 15 | O6 | Consolidacao | Owner | Diagnostico completo |
| 16 | O7 | Aceite coletivo | Todos os gestores | Beta aprovado |
| 17 | UX-R0/R2 | UX comprovada | Gestores validam | H1 encerrado |
| 18 | O8 | Operacao assistida | Todos os gestores | Operacao oficial |
| 19 | EV individual | Evolucao | Conforme gatilho | Valor comprovado |

## 24. Proximo passo

UX-C2, UX-C3, UX-C4 e R1A foram aprovadas. O pacote conjunto recebeu autorizacao
explicita do owner para release em producao em 2026-07-20. A evidencia da
calibracao esta em `plans/ddr/UX-C4-mobile-acessibilidade.md` e o contrato R1A
em `plans/ddr/R1A-prontidao-contrato-briefing.md`. O Plano 3 esta em 100%, o
Plano 4 em 50% e o progresso geral em 52,5%.

Proximo passo: concluir o release protegido e iniciar a R1B em producao. O
owner conduz a revisao real com o Plano Anual e seus relatorios de T1/T2,
avalia a conversa e as duas secoes do pacote antes de uma unica confirmacao.
