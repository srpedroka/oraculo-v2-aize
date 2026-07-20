# DDR UX-C2 - Contexto e caminho critico do gestor

Data: 2026-07-20

Status: **APROVADA PELO OWNER EM 2026-07-20**

Progresso antes do gate: **Plano geral 39% | Plano 3 40%**

Progresso apos o gate: **Plano geral 41% | Plano 3 60%**

## 1. Resumo funcional

A UX-C2 nao cria novas tarefas. Ela torna o caminho existente mais evidente:

1. Dashboard mostra a situacao atual sem pintar de verde o que ainda nao foi
   avaliado.
2. Plano Estrategico deixa claro que e a origem anual da estrategia.
3. Planos Trimestrais mostram o desdobramento por area e sua origem anual.
4. O Oraculo permanece disponivel como condutor, sem perder capacidades.
5. Documentos ficam apresentados como comprovacao do que foi confirmado.

## 2. O que mudou

- navegacao agrupada por Visao geral, Planejamento, Acompanhamento, Memoria e
  Administracao;
- abas acessiveis por teclado e seletor explicito quando ha muitas secoes no
  celular;
- hierarquia e microcopy de Dashboard, Plano Estrategico, Planos Trimestrais,
  Areas e Documentos;
- uma acao primaria por contexto, removendo chamadas duplicadas em vazios;
- resumo antes do detalhe, SWOT vazio omitido e listas mais compactas;
- status semantico `Sem avaliacao` quando nao existe prazo avaliavel;
- metas sem duplicacao de `Meta:`;
- perfil da empresa com texto, listas e links legiveis;
- auditoria administrativa com nomes humanos e detalhe tecnico recolhido.

## 3. O que nao mudou

- nenhuma pagina, permissao, regra de negocio ou objeto novo;
- nenhum schema, migration, Edge Function, WhatsApp ou dado de empresa;
- nenhuma gravacao automatica ou chamada paga de IA;
- producao continua em `https://oraculo-v2-aize.netlify.app` com UX-C0/C1.

## 4. Evidencias

- draft: `https://6a5dfa113c90387d0905fc6e--oraculo-v2-aize.netlify.app`;
- deploy Netlify: `6a5dfa113c90387d0905fc6e`;
- 541/541 testes unitarios;
- lint, build e bundle inicial de 135,1 KB gzip, abaixo de 200 KB;
- secret scan: 570 arquivos, zero segredo de alta confianca;
- jornada autenticada de staging: desktop e mobile verdes, incluindo menu
  movel, rotas criticas, ausencia de overflow e cleanup descartavel;
- `production:verify` em modo somente leitura: 31 Functions, 54/54 migrations,
  HTTP 200, CSP, cache e segredos verdes;
- smoke publico do draft: desktop e mobile verdes.

A primeira repeticao simultanea do E2E encontrou o staging ainda carregando a
pagina Arquivo apos 15 segundos. O teste sequencial, com tolerancia adequada a
rede, passou nos dois dispositivos. Nao houve erro funcional nem dado residual.

## 5. Custo, risco e retorno

- custo de IA/API: **US$ 0**;
- compra ou nova cobranca: nenhuma;
- risco de rollback: somente frontend;
- retorno: basta retirar o draft ou reverter o commit local; banco e backend
  nao precisam de rollback.

## 6. Gate do owner

O owner deve percorrer o draft e confirmar se consegue responder, sem
explicacao externa:

1. Onde estou?
2. Qual e a tarefa desta tela?
3. De onde vem a prioridade trimestral?
4. Onde encontro o resultado confirmado?

O owner aprovou o gate em 2026-07-20. A UX-C2 soma 20 pontos ao Plano 3 e 2
pontos ao geral. O aceite nao autoriza automaticamente producao nem a execucao
da UX-C3; ambos permanecem sujeitos a briefing e autorizacao separados.
