# DDR UX-C3 - Proposta e confirmacao da IA

Data: 2026-07-20

Status: **EXECUTADA NO DRAFT/STAGING - GATE DO OWNER PENDENTE**

Progresso antes do gate: **Plano geral 41% | Plano 3 60%**

Progresso se aprovada: **Plano geral 43% | Plano 3 80%**

## 1. Resumo funcional

A UX-C3 preserva os seis rituais existentes e torna explicito o que esta sendo
conduzido, o que sera gravado e onde o resultado ficou salvo:

1. o cabecalho mostra ritual, empresa, area, periodo, fase e progresso;
2. a proposta concentra a decisao sem exigir releitura de todo o chat;
3. existe uma unica acao primaria: `Confirmar e gravar`;
4. ajuste e descarte sao caminhos secundarios claros e recuperaveis;
5. o sucesso devolve o documento canonico e oferece `Abrir documento`;
6. repetir a confirmacao pelo app ou WhatsApp devolve o mesmo documento sem
   duplicar dados.

## 2. O que mudou

- selecao explicita entre sessoes ativas, sem uma proposta antiga substituir
  silenciosamente o contexto atual;
- mensagens filtradas pela conversa ligada a sessao selecionada;
- contexto humano para plano anual, trimestral, mensal, revisao estrategica,
  fechamento mensal e fechamento trimestral;
- previa estruturada para os seis rituais;
- Revisao Estrategica separa `Vai mudar` e `Permanece igual`;
- anexos longos viram recibos compactos;
- respostas usam texto seguro e legivel, sem HTML bruto;
- `Ajustar` abre o campo `O que voce quer mudar?` sem inventar uma resposta;
- descarte exige uma confirmacao curta antes de encerrar o rascunho;
- durante envio, gravacao e erro, o trabalho permanece visivel e recuperavel;
- confirmacao repetida retorna o documento da sessao ja concluida e nao executa
  nova mutacao;
- enquanto o backend de producao ainda nao devolve o documento na resposta, o
  frontend reencontra o documento pelo `session_id` e mantem acesso a
  Documentos; depois do release, abre diretamente o documento retornado;
- atalhos gerais do painel ficam recolhidos durante uma conducao ativa.

## 3. O que nao mudou

- nenhum ritual, prompt de conducao, permissao ou regra estrategica nova;
- nenhuma migration, tabela ou politica RLS;
- nenhuma gravacao automatica sem confirmacao humana;
- o WhatsApp continua textual e natural, usando os mesmos fatos e a mesma
  regra server-side do app;
- producao permanece inalterada;
- nenhuma chamada paga de IA foi necessaria.

## 4. Evidencias

- branch: `codex/ux-c3-proposal-confirmation`;
- draft Netlify: `https://6a5e2b72df0f2fded70554e3--oraculo-v2-aize.netlify.app`;
- deploy Netlify: `6a5e2b72df0f2fded70554e3`;
- `oracle-session` publicado somente no staging `bijbdsvejdzhpgyiykpi`;
- 554/554 testes unitarios;
- 132 testes de integracao aprovados, com 2 skips opt-in esperados;
- 15 testes focados de painel/repeticao aprovados;
- jornada autenticada desktop/mobile aprovada e dados descartaveis removidos;
- inspecao visual desktop e mobile sem corte, sobreposicao ou overflow;
- lint e build verdes; bundle inicial de 135,1 KB gzip, abaixo de 200 KB;
- secret scan: 574 arquivos, zero segredo de alta confianca;
- `production:verify` do draft verde: 31 Functions, 54/54 migrations, HTTP 200,
  CSP, cache e segredos fora do Git;
- smoke publico do draft aprovado em desktop e mobile;
- teste real de staging confirmou: primeira gravacao, repeticao pelo app e
  repeticao pelo WhatsApp devolvem o mesmo documento e deixam contagens de
  objetivos, acoes, documentos e uso de IA inalteradas.

## 5. Custo, risco e retorno

- custo de IA/API: **US$ 0**;
- compra ou nova cobranca: nenhuma;
- risco de frontend: restrito ao painel lateral do Oraculo e consultas das
  conversas ativas;
- risco de backend: resposta de confirmacao passa a incluir o documento
  canonico; a gravacao transacional existente nao mudou;
- rollback: retirar o draft e reverter a Function de staging; producao nao
  precisa de rollback porque nao foi alterada.

## 6. Gate do owner

No draft, o owner deve confirmar se:

1. entende qual ritual, area e periodo estao ativos;
2. entende o que sera gravado sem reler toda a conversa;
3. encontra uma unica confirmacao principal;
4. consegue pedir ajuste sem perder a proposta;
5. entende que descartar nao grava;
6. encontra o documento depois do sucesso.

A fatia continua valendo zero ate esse gate ser aprovado. Se aprovada, soma 20
pontos ao Plano 3 e 2 pontos ao geral. O aceite do draft nao autoriza producao;
release continua sendo um gate separado.
