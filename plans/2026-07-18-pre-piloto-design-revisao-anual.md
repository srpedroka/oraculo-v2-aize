# Plano pre-piloto: design, revisao anual e O1 assistida

Data: 2026-07-18

Status: **proposto; limpeza A0 concluida; proximas fases aguardam briefing e aprovacao do owner**

Plano-mestre: `plans/2026-07-16-qualidade-estrategica-operacional.md`

## 1. Objetivo

Preparar a O1 oficial sem transformar o piloto em uma experiencia burocratica ou
usar conteudo descartavel como dado real. A sequencia combina:

1. polimento de design focado nos rituais de planejamento e revisao;
2. revisao real de um objetivo do Plano Estrategico Anual existente;
3. teste assistido de usabilidade com um gestor em ambiente isolado;
4. correcao das friccoes comprovadas;
5. O1 oficial com dados escolhidos explicitamente pelo owner.

O plano nao recria o hardening, nao repete a regressao estrategica aprovada e nao
autoriza contato com gestor, deploy ou chamada paga sem o briefing aplicavel.

## 2. Fontes oficiais e limites

As unicas fontes empresariais autorizadas para os proximos testes sao:

- o Plano Estrategico Anual oficial;
- os documentos historicos preservados;
- a escolha explicita do owner em cada ritual.

O ensaio trimestral anterior foi descartado. Area, periodo, pessoa, objetivo,
acoes e proposta daquele ensaio nao podem ser inferidos ou reutilizados.

Limites permanentes:

- revisao anual faz microajustes em objetivo existente; nao replaneja a empresa;
- nenhum judge ou agente grava dados;
- toda gravacao de negocio exige uma unica confirmacao humana;
- teste com gestor ocorre primeiro em clone isolado;
- producao recebe somente a revisao anual autorizada e, mais tarde, a O1 oficial;
- documentos historicos e Plano Estrategico Anual nunca sao removidos por cleanup;
- compra, recarga, assinatura ou upgrade exige autorizacao explicita separada.

## 3. Experiencia desejada

O fluxo deve parecer uma conversa clara e leve:

- o gestor entende em que ritual, empresa, area e periodo esta;
- o Oraculo pergunta apenas o que falta e aproveita o que ja foi dito;
- a tela mostra progresso sem virar formulario comprido;
- antes de gravar, o usuario ve exatamente o que muda e o que permanece;
- existe um unico comando principal de confirmacao;
- erro recuperavel nao apaga o rascunho nem prende a interface;
- documento final tem o mesmo conteudo aprovado na conversa.

## 4. Ordem de execucao

| Ordem | Fase | Ambiente | Dados reais | IA paga | Saida |
| ---: | --- | --- | --- | --- | --- |
| 1 | A0 - Limpeza | Producao + repositorio | Somente descarte autorizado | Nao | Base limpa |
| 2 | D0 - Diagnostico de design | Producao, somente leitura | Sim | Nao | Mapa de friccoes |
| 3 | D1 - Polimento de design | Local + staging | Fixtures | Nao | UI aprovada |
| 4 | R1 - Revisao anual controlada | Producao | Sim | Sim | Objetivo revisado |
| 5 | U1 - Ensaio assistido | Clone isolado | Copia protegida | Sim | Relatorio de uso |
| 6 | U2 - Correcoes do ensaio | Local + staging | Fixtures | Conforme defeito | Gate de usabilidade |
| 7 | O1 - Piloto oficial | Producao | Sim | Sim | Plano trimestral oficial |
| 8 | O2 em diante | Conforme plano-mestre | Sim | Conforme fase | Validacao operacional |

## 5. A0 - Limpeza e redefinicao do baseline

### Resumo para o owner

Remove somente o ensaio descartavel e impede sua retomada. Nao muda funcao do app
e nao altera o Plano Estrategico Anual nem os documentos historicos.

### Trabalho

1. Inventariar sessoes, conversas, mensagens, objetivos, acoes, projetos e
   documentos ligados exclusivamente ao ensaio.
2. Calcular contagens e fingerprints dos dados oficiais.
3. Excluir por IDs exatos em uma unica transacao com assertions.
4. Revalidar os fingerprints antes do commit.
5. Remover copias locais antigas com sufixo ` 2.ts` somente depois de comparar
   com o Git.
6. Marcar a O1 oficial como nao iniciada em todos os documentos ativos.

### Resultado em 2026-07-18

- limpeza de producao concluida;
- 1 Plano Estrategico Anual e 30 historicos preservados;
- todos os IDs descartaveis zerados;
- 8 copias locais antigas removidas;
- custo US$ 0.

### Gate A0

Concluido. O novo trabalho parte apenas das fontes oficiais.

## 6. D0 - Diagnostico de design

### Resumo para o owner antes de executar

Esta fase apenas observa o app. Nao muda tela, fluxo ou dado. Ela identifica onde
o usuario perde contexto, repete confirmacao ou nao entende o proximo passo.

### Telas e estados

- Plano Estrategico Anual;
- Planos Trimestrais;
- painel do Oraculo aberto e fechado;
- inicio, andamento, proposta, confirmacao, sucesso e erro de revisao;
- Documentos e visualizacao/impressao do documento canonico;
- desktop e celular.

### Tarefas de avaliacao

1. Encontrar o comando de revisar um objetivo anual.
2. Identificar qual objetivo sera revisado e qual ano esta ativo.
3. Entender o que pode e o que nao pode mudar.
4. Acompanhar o andamento sem precisar reler toda a conversa.
5. Comparar o estado atual com a proposta.
6. Ajustar ou descartar sem perder contexto.
7. Confirmar uma vez.
8. Localizar o documento gerado e reconhecer o que mudou.

### Evidencias

- screenshots desktop e mobile;
- lista de friccoes com severidade P0, P1 ou P2;
- sobreposicoes, cortes, scroll, foco e estados de loading;
- quantidade de cliques e confirmacoes;
- texto que causa duvida;
- contraste, teclado e leitor de tela nos controles principais.

### Gate D0

Escopo de D1 aprovado pelo owner. Nenhuma preferencia estetica vira mudanca sem
uma friccao ou objetivo de uso associado.

## 7. D1 - Polimento de design

### Mudanca funcional esperada

Nenhuma regra de negocio muda. A conducao, os campos permitidos e a gravacao
continuam iguais. Muda apenas a forma de orientar, revisar e confirmar.

### Proposta inicial de design

1. **Contexto persistente e compacto:** cabeçalho do painel com ritual, ano, area
   e periodo quando aplicavel. O texto vem da sessao, nunca da inferencia da IA.
2. **Progresso discreto:** indicador curto como `Contexto > Ajustes > Conferencia`,
   sem transformar a conversa em formulario ou wizard pesado.
3. **Previa comparavel:** bloco unico de `Vai mudar` e `Permanece igual`, com
   antes, depois e motivo por campo alterado.
4. **Uma confirmacao:** botao principal `Confirmar e gravar`; comandos secundarios
   `Ajustar` e `Descartar`. Depois do clique, a mesma proposta nao pede nova
   confirmacao.
5. **Erro recuperavel:** mensagem objetiva, codigo tecnico recolhido, botao de
   tentar novamente e rascunho preservado.
6. **Sucesso rastreavel:** confirmar o que foi salvo e oferecer acesso ao
   documento, sem novo pedido de confirmacao.
7. **Layout responsivo:** painel e dialogos dentro da viewport; scroll interno
   somente no conteudo; foco devolvido ao ponto correto ao fechar.
8. **Cockpit limpo:** bordas, espacamento e motion sutis; sem cards aninhados,
   banners promocionais ou animacao decorativa.

### Implementacao

1. Mapear componentes existentes e reutilizar tokens de design.
2. Prototipar os estados com dados locais.
3. Alterar somente os componentes necessarios.
4. Adicionar testes para estado de proposta, confirmacao unica, erro e retry.
5. Verificar visualmente desktop e mobile com Playwright.
6. Rodar unitarios proporcionais, lint e build.
7. Publicar no staging e apresentar antes/depois ao owner.
8. Publicar frontend em producao somente apos aprovacao explicita.

### Gate D1

- nenhuma sobreposicao ou conteudo fora da viewport;
- contexto correto e visivel;
- proposta compreensivel sem ler o chat inteiro;
- uma confirmacao;
- retry preserva o rascunho;
- navegacao por teclado e contraste adequados;
- owner aprova desktop e mobile.

### Rollback

Reverter somente os componentes de UI. Nenhuma migration ou transformacao de
dados deve fazer parte desta fase.

## 8. R1 - Revisao real de objetivo anual

### Resumo para o owner antes de executar

O owner escolhe um objetivo anual existente e informa um ajuste verdadeiro. O
Oraculo ajuda a deixar a mudanca clara, mostra o antes/depois e grava uma unica
vez. Os demais objetivos e o restante do plano permanecem intactos.

### Preparacao

1. Owner escolhe explicitamente objetivo e mudanca real.
2. Registrar baseline do objetivo, plano, documentos e custo.
3. Confirmar backup protegido e snapshot recente.
4. Abrir sessao `strategic_review` no objetivo escolhido.

### Conducao

1. Receber ajuste e motivo em linguagem natural.
2. Perguntar somente lacunas que bloqueiam a alteracao.
3. Manter a revisao nos campos permitidos pelo produto.
4. Exibir antes, depois, motivo e itens que nao mudam.
5. Pedir uma confirmacao final.
6. Gravar deterministicamente depois da confirmacao.

### O que testar

- objetivo e ano corretos;
- nenhuma troca silenciosa de objetivo;
- pergunta adaptativa, casual e objetiva;
- zero reentrevista do Plano Estrategico Anual;
- um documento `strategic_review`;
- conversa, banco, documento, PDF e WhatsApp coerentes;
- antes/depois e motivo rastreaveis;
- custo registrado;
- nenhuma duplicata;
- historicos preservados e disponiveis como memoria relevante.

### Avaliacao

- rubrica de conducao >= 80;
- rubrica de revisao/fechamento >= 80;
- rubrica de saida derivada >= 80;
- media aplicavel >= 85;
- zero falha critica;
- nota simples do owner de 1 a 5 para clareza, naturalidade e confianca.

### Gate R1

Owner reconhece a revisao como util, correta e pouco burocratica. Se houver
divergencia, usar reversao direcionada do proprio fluxo; nunca restaurar a empresa
inteira por erro em um objetivo.

## 9. U1 - Ensaio assistido com gestor

### Resumo para o owner antes de executar

Um gestor testa o fluxo trimestral com uma copia isolada dos dados. Ele pode
explorar e errar sem afetar a empresa oficial. O observador ajuda apenas quando a
pessoa realmente trava e registra onde o produto precisa melhorar.

### Preparacao segura

1. Criar clone a partir de backup verificado.
2. Confirmar que o clone contem Plano Estrategico Anual e historicos.
3. Desativar WhatsApp e automacoes externas no clone.
4. Criar acesso temporario e limitar a uma area de teste.
5. Escolher nominalmente um gestor somente com autorizacao do owner.
6. Explicar que o teste nao altera a operacao oficial.

### Roteiro

1. Gestor entra no app sem treinamento detalhado.
2. Encontra o planejamento trimestral.
3. Escolhe um objetivo anual de origem.
4. Conduz um plano curto com o Oraculo.
5. Revisa a proposta e confirma uma vez.
6. Abre o documento gerado.
7. Explica o que entendeu e onde teve duvida.

O observador nao responde pelo gestor, nao corrige banco e nao melhora a tela no
meio da sessao.

### Medidas

- concluiu ou abandonou;
- tempo total e numero de turnos;
- pedidos de ajuda;
- perguntas repetidas;
- erros de contexto;
- confirmacoes percebidas;
- capacidade de encontrar o documento;
- utilidade, clareza, naturalidade e confianca, de 1 a 5;
- comentario livre: o que ajudou, cansou, confundiu ou faltou.

### Gate U1

- tarefa concluida sem intervencao estrutural;
- zero falha critica;
- notas de utilidade e clareza >= 4/5;
- dados do clone coerentes e cleanup concluido.

## 10. U2 - Correcao das friccoes

### Priorizacao

- **P0:** perda de dado, contexto incorreto, gravacao indevida ou bloqueio total;
- **P1:** confirmacao repetida, pergunta circular, erro sem recuperacao ou fluxo
  que exige ajuda;
- **P2:** texto, espacamento ou detalhe visual sem impacto material.

Corrigir P0 e P1 antes da O1 oficial. P2 entra somente se for pequeno e nao
ampliar o risco.

### Metodo

1. Reproduzir cada problema com fixture.
2. Apresentar briefing funcional e obter aprovacao.
3. Fazer a menor correcao suficiente.
4. Testar apenas cenarios afetados.
5. Quando todos passarem, rodar regressao geral sem repetir chamadas pagas que
   nao forem necessarias.
6. Publicar somente o runtime afetado.

### Gate U2

Todos os P0/P1 resolvidos, testes verdes e owner autoriza a O1 oficial.

## 11. O1 - Piloto oficial

### Escolhas obrigatorias

Imediatamente antes do piloto, o owner define:

- objetivo do Plano Estrategico Anual;
- area ativa;
- trimestre e ano;
- pessoa responsavel, se ja decidida;
- se o plano sera oficial ou somente rascunho.

Nenhum valor vem do ensaio descartado.

### Execucao

1. Registrar baseline e backup.
2. Abrir nova sessao no app.
3. Conduzir um unico plano trimestral.
4. Revisar origem anual, resultado, medida, dono, prazo e poucas acoes.
5. Confirmar uma vez.
6. Verificar persistencia atomica e ausencia de duplicidade.
7. Aplicar rubricas e coletar avaliacao do owner.
8. Seguir para O2 apenas se o gate passar.

### Gate O1

- conversa natural e objetiva;
- plano trimestral >= 80;
- conducao >= 80;
- media aplicavel >= 85;
- zero falha critica;
- uma proposta e uma confirmacao;
- conversa = banco = documento;
- owner aprova a continuidade.

## 12. Financeiro e autorizacoes

- ciclo autorizado: US$ 20;
- consumo antes deste plano: US$ 0,025465;
- aviso: US$ 15;
- parada preventiva: US$ 19;
- toda fase informa custo antes/depois e separa geracao de judge;
- D0, D1 e limpeza nao devem usar IA paga;
- R1, U1 e O1 usam apenas chamadas necessarias;
- nenhuma compra ou nova cobranca sem autorizacao explicita imediatamente antes.

## 13. Briefing obrigatorio por fase

Antes de D0, D1, R1, U1, U2 e O1, apresentar:

1. o que sera feito;
2. o que muda para o usuario;
3. o que permanece igual;
4. ambiente e dados afetados;
5. custo estimado;
6. testes e criterio de aceite;
7. rollback;
8. autorizacao necessaria.

## 14. Proximo passo

Apresentar o briefing D0. Depois da aprovacao, fazer apenas o diagnostico visual e
de usabilidade, sem alterar codigo, dados ou producao.
