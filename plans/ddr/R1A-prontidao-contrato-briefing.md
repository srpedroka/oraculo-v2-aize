# Briefing R1 - Ciclo real controlado da Revisao Semestral

Data: 2026-07-20

Status: **GATE TECNICO APROVADO - RELEASE AUTORIZADO EM 2026-07-20**

Progresso atual: **Plano geral 52,5% | Plano 4 50%**

Marco tecnico se R1A for aprovada: **Plano geral 52,5% | Plano 4 50%**

Marco do ciclo real se R1B for aprovada: **Plano geral 60% | Plano 4 100%**

Resultado do gate: **R1A aprovada; progresso oficial 52,5% geral e 50% no
Plano 4. A R1B real em producao permanece pendente.**

## 1. Resumo para o owner

Por decisao do owner, a prova principal sera pratica e usara o Plano Estrategico
Anual, os relatorios e as evidencias reais do primeiro semestre. O owner
conversara com o Oraculo no fluxo normal e avaliara tanto a conducao quanto os
documentos produzidos.

A R1A continua existindo, mas vira um preflight tecnico curto: inventaria o
contexto real somente em leitura, adapta o motor e prova seguranca no staging.
Ela nao tenta substituir a avaliacao humana com uma empresa ficticia. Logo
depois, mediante gate de release explicito, a R1B executa a revisao real com o
owner em producao.

O ciclo deve entregar dois resultados ligados e distintos dentro de um unico
pacote canonico, evitando versoes divergentes entre canais:

1. secao `Revisao Semestral do Plano Estrategico Anual`, com o que aconteceu em T1/T2;
2. secao `Plano Estrategico do Segundo Semestre`, com prioridades, ajustes e
   decisoes para julho-dezembro, sempre derivada da revisao aprovada.

## 1.1 Diagnostico observado no WhatsApp real

Uma conversa real do owner em 2026-07-20 comprovou quatro limites do runtime
atual:

1. `revisar o plano estrategico anual` e classificado como criacao de plano
   `strategic`, porque o roteador do WhatsApp nao oferece `strategic_review`;
2. a abertura recebida e uma frase fixa do condutor de plano anual, antes de o
   modelo interpretar o contexto completo do pedido;
3. com uma sessao ativa, uma pergunta natural como `posso compartilhar um
   arquivo?` e enviada diretamente ao motor da sessao, antes da classificacao
   de documento ou de interrupcao; quando a resposta estruturada e recusada, o
   usuario recebe um fallback generico fixo do codigo;
4. o contexto organizacional comum usa no maximo cinco historicos, com ate 1.600
   caracteres por documento, e nao consolida T1/T2, KPIs, acoes, check-ins,
   fechamentos e evidencias de todas as areas.

Conclusao: trocar apenas o modelo nao resolve. O modelo hoje recebe a sessao
errada, contexto incompleto e pouca liberdade de conversa. A R1 deve corrigir
roteamento, interrupcoes naturais, pacote semestral e fallbacks antes da prova
real.

## 1.2 Principio AI-first aprovado pelo owner

O guia estrategico orienta a IA; nao e um script executado pelo sistema. A
fronteira passa a ser:

- a IA possui entendimento, conversa, perguntas, sintese e retomada;
- o servidor possui permissao, escopo, IDs, integridade, proposta, confirmacao,
  transacao, idempotencia e auditoria;
- a fase atual e contexto para a IA, nao um campo obrigatorio do turno;
- toda mensagem passa primeiro pela interpretacao conversacional, mesmo quando
  existe sessao ativa;
- perguntas laterais, pedido de ajuda, correcao, pausa e oferta de arquivo podem
  suspender e retomar o ritual sem perder estado;
- guardas bloqueiam apenas conteudo ou mutacao insegura; nao trocam uma resposta
  pertinente por pergunta generica;
- mensagens puramente transacionais, como erro tecnico ou sucesso confirmado
  pelo banco, podem ser deterministicas, mas ficam claramente separadas da voz
  estrategica do Oraculo.

Contrato recomendado por turno: uma unica chamada principal devolve a resposta
natural e um bloco lateral estruturado com intencao, acao conversacional,
atualizacao de estado e eventual proposta. O usuario ve a conversa; o servidor
valida somente o bloco operacional antes de qualquer gravacao.

## 2. Mudanca funcional explicita

Hoje `strategic_review` foi desenhada para propor pequenos ajustes sobre um
plano existente. Depois da R1A, o ritual devera:

1. produzir primeiro um diagnostico do semestre inteiro com dados reais;
2. separar fatos, interpretacoes, lacunas e recomendacoes;
3. mostrar a origem material das conclusoes relevantes;
4. perguntar somente quando a ausencia mudar uma decisao;
5. propor em lote o que manter, reforcar, alterar, despriorizar, substituir ou
   complementar para o segundo semestre;
6. permitir ajustes do owner sem reiniciar a conversa;
7. pedir uma unica conferencia e uma unica confirmacao;
8. preservar integralmente o plano anual original ate essa confirmacao;
9. gerar o novo planejamento do segundo semestre como versao derivada, sem
   apagar ou reescrever silenciosamente o plano anual original.

Nao muda nesta fatia:

- permissoes, papeis, login ou cadastro;
- WhatsApp operacional fora da paridade de saida;
- planos trimestrais e mensais existentes;
- regra de uma confirmacao antes de gravar;
- liberacao para os demais gestores, que pertence ao beta coletivo.

## 3. Pacote de contexto

O servidor deve montar, a partir da empresa real do owner e sem mutacao, um
recorte janeiro-junho do ano escolhido contendo:

- Plano Estrategico Anual canonico, objetivos, projetos e responsaveis;
- planos trimestrais T1/T2 de todas as areas e seus vinculos anuais;
- planos mensais, check-ins, fechamentos, compromissos e aprendizados;
- KPIs com meta, atingido, unidade, fonte e tendencia;
- evidencias ligadas a objetivos e acoes;
- documentos historicos realmente pertinentes;
- lacunas, conflitos, itens sem evidencia e dados fora do periodo identificados.

Cada item deve manter IDs e referencias suficientes para rastreabilidade, sem
misturar empresa, area, ano ou documento. Conteudo fora do semestre pode ser
usado apenas quando identificado como contexto historico.

## 4. Saida minima

1. contexto e escopo do semestre;
2. resumo executivo dos resultados;
3. leitura por objetivo anual com esperado, realizado, evidencia e confianca;
4. KPIs com meta, atingido, tendencia e desvio;
5. avancos, atrasos, bloqueios e dependencias de projetos e acoes;
6. aprendizados, riscos, causas confirmadas e decisoes pendentes;
7. pontos a manter ou reforcar;
8. ajustes propostos para o segundo semestre;
9. prioridades recomendadas;
10. lista explicita de `evidencia insuficiente` onde faltarem fatos.

O documento canonico deve se chamar `Revisao Semestral e Plano do Segundo
Semestre <ano>` e conter as duas secoes com titulos proprios. A fonte unica
garante coerencia material na tela, PDF e resumo do WhatsApp.

## 5. Fatias internas de execucao

### R1A.1 - Inventario real somente em leitura

- mapear o comportamento atual de `strategic_review`;
- localizar o Plano Anual e os documentos de T1/T2 da empresa escolhida;
- conferir areas, periodos, vinculos, lacunas e volume sem expor o conteudo em
  log, commit ou artefato de teste;
- gerar backup, contagens e fingerprints antes de qualquer release;
- apresentar ao owner o que o Oraculo conseguira ler e o que estiver faltando;

### R1A.2 - Contrato e implementacao

- localizar contexto, condutor, proposta, persistencia e documento;
- congelar schemas de entrada, diagnostico, proposta e aplicacao;
- incluir o contrato do `Plano Estrategico do Segundo Semestre`;
- distinguir deterministicamente criacao anual de revisao semestral no app e
  no WhatsApp;
- aceitar pausa, pergunta sobre o processo e oferta de arquivo sem tratar a
  mensagem como resposta ao campo atual;
- associar o arquivo importado a revisao ativa somente depois da confirmacao do
  owner e retomar a conversa no mesmo ponto;
- substituir o fallback generico por recuperacao contextual que reconhece o
  pedido real do usuario;
- fazer a IA interpretar o turno antes de a sessao ativa decidir o caminho;
- transformar fases em cobertura recomendada e permitir salto, pausa, correcao
  e retomada definidos pela conversa;
- separar resposta visivel de comando operacional, validando estritamente a
  gravacao sem reescrever mecanicamente a fala;
- limitar cada turno a uma chamada principal e no maximo um reparo interno para
  controlar custo, latencia e variacao;
- justificar separadamente qualquer migration; a preferencia e nao criar tabela.

### R1A.3 - Montagem segura do contexto

- criar o agregador sem mutacao;
- aplicar recorte de semestre, empresa e ano;
- limitar e ordenar historicos por relevancia;
- marcar lacunas e conflitos;
- testar isolamento e ausencia de contaminacao.

### R1A.4 - Conducao e proposta

- adaptar persona e condutor para uma conversa casual, executiva e objetiva;
- gerar resumo antes do detalhe;
- impedir fabricacao e reentrevista;
- separar diagnostico imutavel da proposta editavel;
- garantir uma unica confirmacao.

### R1A.5 - Aplicacao e documentos

- reutilizar sessao, versionamento, auditoria e documentos existentes;
- aplicar somente campos aprovados;
- preservar antes/depois e referencias;
- garantir idempotencia em confirmacao repetida;
- renderizar revisao e novo planejamento na tela, PDF e WhatsApp com o mesmo
  conteudo material.

### R1A.6 - Preflight tecnico no staging

- fixtures tecnicas minimas para isolamento, lacunas, conflitos e multi-area;
- testes sinteticos validam seguranca e contrato, nao substituem a prova real;
- teste exato: iniciar revisao semestral, perguntar se pode enviar arquivo,
  receber autorizacao natural, importar e retomar sem perder a sessao;
- teste exato: `revisar plano anual` nunca abre silenciosamente a criacao anual;
- teste exato: pergunta lateral nao recebe menu generico de resultado, prazo,
  responsavel ou acao;
- variacoes semanticamente equivalentes recebem respostas naturais e chegam ao
  mesmo estado seguro sem exigir palavras magicas;
- o guia cobre as decisoes necessarias sem obrigar a mesma ordem de perguntas;
- guardas recusam proposta insegura sem apagar uma resposta conversacional
  pertinente;
- rubricas de Conducao, Revisao Semestral e Saida Derivada;
- teste de banco, documento, idempotencia, isolamento e cleanup;
- jornada autenticada desktop/mobile e inspecao visual;
- lint, build, unitarios, integracao, seguranca e secret scan conforme o risco.

### R1B.1 - Conversa real com o owner

- publicar somente o pacote aprovado da R1A;
- abrir a revisao no Oraculo com o contexto real de T1/T2;
- deixar o owner responder, corrigir e desafiar a leitura naturalmente;
- observar tempos, perguntas repetidas, referencias erradas e lacunas;
- apresentar revisao e planejamento do segundo semestre antes de gravar.

### R1B.2 - Confirmacao e verificacao real

- owner ajusta a proposta sem reiniciar a sessao;
- uma conferencia final apresenta tudo que sera gravado;
- uma confirmacao grava o lote e as duas secoes do pacote canonico;
- comparar banco, tela, PDF e WhatsApp;
- avaliar a conversa e as saidas pelas rubricas;
- preservar backup, fingerprints, versoes e trilha antes/depois.

## 6. Falhas criticas

O gate reprova imediatamente se ocorrer:

- mistura entre empresa, area, ano ou semestre;
- conclusao relevante sem fonte ou fato classificado como certeza;
- plano anual alterado antes da confirmacao;
- mudanca fora da proposta confirmada;
- segunda confirmacao para o mesmo lote;
- duplicacao em retry ou retomada;
- perda ou sobrescrita do plano original, historico ou documento;
- diferenca material entre banco, tela, PDF e WhatsApp;
- criacao anual aberta quando o pedido era revisao semestral;
- pergunta sobre arquivo absorvida como resposta estrategica;
- fallback generico que ignora o pedido explicito do usuario;
- vazamento de segredo ou conteudo sensivel em log;
- residuo de teste no staging.

## 7. Testes e gate

Para aprovar o preflight R1A:

- todos os testes tecnicos aplicaveis verdes;
- zero falha critica;
- plano original intacto antes da confirmacao;
- aplicacao deterministica e idempotente depois da confirmacao;
- tela, PDF e WhatsApp coerentes;
- cleanup independente com zero residuo;
- owner aprova o pacote que sera publicado para a prova real.

Para aprovar a prova real R1B:

- zero falha critica;
- Conducao >= 80;
- Revisao Semestral >= 80;
- Plano do Segundo Semestre >= 80;
- Saida Derivada >= 80;
- media das quatro rubricas >= 85;
- owner aprova fidelidade, clareza, utilidade e prioridades propostas;
- nenhum dado fora da unica proposta confirmada;
- plano anual e documentos historicos originais preservados.

## 8. Ambiente, custo e seguranca

- R1A: staging para implementacao e testes; producao somente em leitura para o
  inventario real;
- R1B: conversa e confirmacao reais em producao depois de autorizacao explicita
  do release;
- nenhum conteudo real sera copiado para Git, logs ou fixtures;
- nenhuma compra, credito ou assinatura sem autorizacao explicita;
- uso de API pode consumir o ciclo ja autorizado de US$ 20, com aviso ao
  atingir US$ 15 e parada preventiva em US$ 19;
- cada rodada reporta geracao, avaliacao, total do caso, acumulado historico e
  consumo do ciclo;
- estimativa detalhada e apresentada depois do inventario R1A.1, antes dos
  testes pagos.

## 9. Rollback

- codigo: reverter apenas os commits da R1A;
- staging: remover sessoes, documentos e fixtures pelos IDs registrados;
- producao: reverter somente o lote real confirmado, preservando as versoes e
  os documentos anteriores;
- se houver migration indispensavel, ela recebe plano de rollback e aprovacao
  proprios antes de ser aplicada.

## 10. Autorizacao solicitada

A aprovacao deste briefing autoriza executar R1A.1 a R1A.6, incluindo o
inventario real somente em leitura e a implementacao no staging. Depois do gate
tecnico, o owner recebera o relatorio de prontidao e autoriza separadamente o
release e a R1B real. Isso evita publicar uma mudanca nao testada sem transformar
a experiencia do owner em um ensaio artificial.

Nao autoriza ainda mutacao real, deploy de producao, compra de creditos ou
abertura do beta para gestores.

Frase de gate sugerida:

Autorizacoes registradas em 2026-07-20: executar a R1A e publicar todo o pacote
em producao para o owner realizar o teste pratico R1B.
