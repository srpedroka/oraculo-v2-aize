# DDR - Arquitetura conversacional AI-first do Oraculo

Data: 2026-07-20

Status: **NUCLEO R1A APROVADO - RELEASE AUTORIZADO; PROVA REAL R1B PENDENTE**

## 1. Tese

O Oraculo e um produto de inteligencia estrategica. O usuario precisa sentir
que conversa com uma IA capaz de compreender contexto, desvios, correcoes e
nuances. Os guias existem para melhorar o raciocinio, nao para transformar a
conversa em formulario.

Regra central:

`A IA possui a conversa; o servidor possui a gravacao.`

## 2. Responsabilidade da IA

- interpretar cada turno antes de seguir a sessao ativa;
- entender intencao, contexto, correcao, pausa, retomada e pergunta lateral;
- escolher a proxima pergunta de maior valor, quando uma pergunta for util;
- absorver blocos completos sem reentrevistar;
- explicar raciocinio, lacunas e alternativas com naturalidade;
- sintetizar diagnosticos, propostas e documentos;
- usar os guias como checklist interno de qualidade;
- manter o tom configurado da empresa e a memoria da conversa.

## 3. Responsabilidade do servidor

- autenticar e aplicar RLS/permissoes;
- resolver empresa, area, periodo e IDs reais;
- montar contexto permitido e rastreavel;
- validar schema e referencias de qualquer proposta;
- impedir fabricacao operacional e gravacao prematura;
- exigir uma unica confirmacao para mutacoes;
- executar transacao, idempotencia, versao, auditoria e rollback;
- registrar custo e telemetria sem expor conteudo sensivel.

## 4. Fluxo por turno

1. receber texto, audio ou documento;
2. montar conversa, sessao, memoria e capacidades disponiveis;
3. recuperar o contexto relevante para o pedido atual;
4. chamar a IA uma vez para resposta natural e decisao lateral estruturada;
5. exibir a resposta natural se ela for segura e pertinente;
6. validar separadamente estado, proposta ou comando operacional;
7. se o comando falhar, fazer no maximo um reparo interno com o contexto
   completo, sem substituir a fala por menu generico;
8. gravar somente depois da confirmacao e retornar sucesso factual do banco.

## 5. Papel dos guias

Os guias definem perguntas que podem ser uteis, fatos obrigatorios para uma
proposta e criterios de um bom plano. Eles nao definem:

- a frase inicial;
- uma sequencia fixa de perguntas;
- que toda mensagem deve preencher o campo atual;
- que uma pergunta lateral e fuga de assunto;
- que o mesmo fallback serve para qualquer falha;
- que a sessao ativa vence a intencao explicita do turno.

## 6. Fallbacks permitidos

Podem ser deterministicas apenas mensagens de transporte e seguranca: acesso
negado, arquivo ilegivel, indisponibilidade tecnica, conflito de versao,
confirmacao de banco e operacao recusada. Mesmo nesses casos, o texto deve dizer
o que aconteceu e como continuar.

Fallback estrategico generico e proibido. Se a IA falhar duas vezes, o Oraculo
preserva a sessao e pede para repetir o ultimo pedido, sem fingir que outra
decisao estava em andamento.

## 7. Prova e rollout

1. implementar o nucleo na R1A sob modo especifico da Revisao Semestral;
2. executar a conversa real R1B com o owner;
3. avaliar naturalidade, conducao, fidelidade e documentos;
4. corrigir o nucleo a partir da prova real;
5. migrar, em fatias, anual, trimestral, mensal, fechamento mensal e fechamento
   trimestral antes do beta coletivo;
6. manter app e WhatsApp materialmente equivalentes.

A distribuicao percentual do Plano 4 nao muda neste DDR. Qualquer nova fatia
formal, como uma R1C de rollout, deve redistribuir os 100 pontos existentes e
ser aprovada pelo owner antes de contar progresso.

## 8. Gate conversacional

- zero resposta mecanica desconectada do turno;
- zero palavra magica exigida para interromper, corrigir ou retomar;
- guia coberto sem ordem fixa;
- bloco completo nao e reentrevistado;
- pergunta vaga recebe possibilidades contextualizadas;
- mutacao continua bloqueada ate uma confirmacao;
- respostas naturais nao reduzem isolamento, idempotencia ou rastreabilidade;
- owner reconhece a experiencia como uma conversa inteligente, nao um formulario.

## 9. Custo e latencia

- uma chamada principal por turno;
- no maximo um reparo interno;
- recuperacao de contexto e validacao deterministicas, sem chamada extra quando
  nao houver ganho semantico;
- custo reportado por geracao, avaliacao, caso e ciclo;
- nenhum modelo e trocado automaticamente sem comparacao e aceite.
