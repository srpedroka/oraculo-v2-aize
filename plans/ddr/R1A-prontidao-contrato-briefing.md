# Briefing R1A - Prontidao e contrato da Revisao Semestral

Data: 2026-07-20

Status: **PRONTO PARA APROVACAO - EXECUCAO NAO INICIADA**

Progresso atual: **Plano geral 45% | Plano 4 0%**

Progresso se o gate R1A for aprovado: **Plano geral 52,5% | Plano 4 50%**

## 1. Resumo para o owner

A R1A prepara e prova, somente no staging, uma Revisao Semestral do Plano
Estrategico Anual inteiro. O Oraculo deixara de tratar esse ritual como um
microajuste isolado e passara a consolidar o que aconteceu entre janeiro e
junho, relacionando objetivos anuais, areas, planos T1/T2, execucao mensal,
KPIs, evidencias, projetos e historicos relevantes.

Esta fatia nao executa a revisao real da empresa. Ela cria o contrato, adapta o
motor e testa com dados descartaveis. A revisao real com o owner pertence a R1B
e tera um novo briefing e uma nova autorizacao.

## 2. Mudanca funcional explicita

Hoje `strategic_review` foi desenhada para propor pequenos ajustes sobre um
plano existente. Depois da R1A, o ritual devera:

1. produzir primeiro um diagnostico do semestre inteiro;
2. separar fatos, interpretacoes, lacunas e recomendacoes;
3. mostrar a origem material das conclusoes relevantes;
4. perguntar somente quando a ausencia mudar uma decisao;
5. propor em lote o que manter, reforcar, alterar, despriorizar, substituir ou
   complementar para o segundo semestre;
6. permitir ajustes do owner sem reiniciar a conversa;
7. pedir uma unica conferencia e uma unica confirmacao;
8. preservar integralmente o plano anual original ate essa confirmacao.

Nao muda nesta fatia:

- revisao real da empresa e dados de producao;
- permissoes, papeis, login ou cadastro;
- WhatsApp operacional fora da paridade de saida;
- planos trimestrais e mensais existentes;
- regra de uma confirmacao antes de gravar;
- release em producao.

## 3. Pacote de contexto

O servidor deve montar um recorte janeiro-junho do ano escolhido contendo:

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

O documento canonico deve se chamar `Revisao Semestral do Plano Estrategico
Anual` e permanecer materialmente coerente na tela, PDF e resumo do WhatsApp.

## 5. Fatias internas de execucao

### R1A.1 - Inventario e contrato

- mapear o comportamento atual de `strategic_review`;
- localizar contexto, condutor, proposta, persistencia e documento;
- congelar schemas de entrada, diagnostico, proposta e aplicacao;
- justificar separadamente qualquer migration; a preferencia e nao criar tabela.

### R1A.2 - Montagem segura do contexto

- criar o agregador sem mutacao;
- aplicar recorte de semestre, empresa e ano;
- limitar e ordenar historicos por relevancia;
- marcar lacunas e conflitos;
- testar isolamento e ausencia de contaminacao.

### R1A.3 - Conducao e proposta

- adaptar persona e condutor para uma conversa casual, executiva e objetiva;
- gerar resumo antes do detalhe;
- impedir fabricacao e reentrevista;
- separar diagnostico imutavel da proposta editavel;
- garantir uma unica confirmacao.

### R1A.4 - Aplicacao e documento

- reutilizar sessao, versionamento, auditoria e documentos existentes;
- aplicar somente campos aprovados;
- preservar antes/depois e referencias;
- garantir idempotencia em confirmacao repetida;
- renderizar tela, PDF e WhatsApp com o mesmo conteudo material.

### R1A.5 - Validacao de qualidade no staging

- fixtures completas, incompletas, conflitantes e multi-area;
- duas variacoes por cenario de IA quando houver geracao paga;
- rubricas de Conducao, Revisao Semestral e Saida Derivada;
- teste de banco, documento, idempotencia, isolamento e cleanup;
- jornada autenticada desktop/mobile e inspecao visual;
- lint, build, unitarios, integracao, seguranca e secret scan conforme o risco.

## 6. Falhas criticas

O gate reprova imediatamente se ocorrer:

- mistura entre empresa, area, ano ou semestre;
- conclusao relevante sem fonte ou fato classificado como certeza;
- plano anual alterado antes da confirmacao;
- mudanca fora da proposta confirmada;
- segunda confirmacao para o mesmo lote;
- duplicacao em retry ou retomada;
- perda do plano original, historico ou documento;
- diferenca material entre banco, tela, PDF e WhatsApp;
- vazamento de segredo ou conteudo sensivel em log;
- residuo de teste no staging.

## 7. Testes e gate

Para aprovar R1A:

- todos os testes tecnicos aplicaveis verdes;
- zero falha critica;
- Conducao >= 80;
- Revisao Semestral >= 80;
- Saida Derivada >= 80;
- media das tres rubricas >= 85;
- plano original intacto antes da confirmacao;
- aplicacao deterministica e idempotente depois da confirmacao;
- tela, PDF e WhatsApp coerentes;
- cleanup independente com zero residuo;
- owner aprova estrutura, clareza e utilidade do resultado sintetico.

## 8. Ambiente, custo e seguranca

- execucao: staging, com dados sinteticos e descartaveis;
- producao: somente leitura para inventario estrutural quando indispensavel;
- nenhuma revisao real ou mutacao em producao;
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
- producao: nenhum rollback esperado, pois nao sera alterada;
- se houver migration indispensavel, ela recebe plano de rollback e aprovacao
  proprios antes de ser aplicada.

## 10. Autorizacao solicitada

A aprovacao deste briefing autoriza implementar R1A.1 a R1A.5 no staging e usar
API dentro do ciclo financeiro descrito. Nao autoriza R1B, dados reais, deploy
de producao, compra de creditos ou abertura do beta para gestores.

Frase de gate sugerida:

`Aprovo o briefing R1A e autorizo executar no staging.`
