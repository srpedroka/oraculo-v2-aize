# Briefing de correcoes de qualidade estrategica - Q4

Data: 2026-07-16

Status: **briefing aprovado; Q4A, Q4B e Q4C concluidas e validadas no staging; Q4D aguarda briefing**

## O que vai mudar para o gestor

O Oraculo continuara fazendo uma pergunta por vez, mas deixara de percorrer um roteiro visivel ou rigido. Cada resposta sera tratada como um bloco de fatos: o sistema aproveita tudo o que ja foi informado, identifica somente a proxima lacuna que muda uma decisao e faz uma pergunta curta que conduz a uma acao.

Quando o gestor responder pouco, o Oraculo nao repetira a pergunta. Ele oferecera duas ou tres possibilidades concretas, sem decidir pela pessoa. Exemplo:

- antes: "Qual e o principal desafio da sua area hoje?" repetido mesmo depois de novas informacoes;
- depois: "Quando voce diz que as vendas precisam melhorar, o maior problema hoje e gerar oportunidades, converter as existentes ou aumentar o ticket? Qual desses mudaria mais o trimestre?";
- proximo movimento: a resposta escolhida vira uma pergunta de resultado, meta ou primeira acao, nunca conversa solta.

Quando o gestor entregar dados completos, o Oraculo absorvera o bloco, apontara no maximo uma lacuna realmente bloqueante e apresentara a sintese com uma unica confirmacao. O tom sera casual, tranquilo e objetivo, sem expor nomes de fases, chaves tecnicas ou linguagem de formulario.

## Onde a Q3 ficou baixa

### Conducao

Na escala de 0 a 4, os menores criterios foram desafio estrategico 1,08; qualidade das perguntas 1,33; naturalidade 1,59; fidelidade 1,92; diagnostico 1,95 e fechamento 1,95. O motor frequentemente repetiu perguntas, exigiu campos nao bloqueantes e nao reconheceu blocos completos.

### Plano trimestral

A media geral foi 31,56 porque apenas 6/16 rodadas chegaram a proposta. As seis propostas existentes tiveram media 84,17. O principal defeito e a progressao da sessao; depois aparecem cadencia de gestao, risco e aprendizado. O diagnostico fixo de "3 forcas e 3 gargalos" virou barreira e o plano anual foi tratado como bloqueio mesmo quando a excecao deveria ser registrada.

### Plano mensal

Somente 1/8 rodadas chegou a proposta. Existe tambem um erro concreto de contexto: ao receber um periodo mensal diferente do mes corrente, `plan-context.ts` nao deriva o trimestre correspondente e pode afirmar que nao existe objetivo trimestral. A fase `relembrar` exige `base_confirmada` mesmo quando o gestor ja informou objetivo, meta, fonte, responsavel e acoes. A unica proposta gerada ainda omitiu a cadencia e ficou em 57,50.

### Saidas derivadas

A media 51,15 nao significa, sozinha, que o PDF ou o documento estejam ruins. Quatro das doze avaliacoes zeraram porque a conversa nao produziu proposta. As oito com proposta ficaram em 76,72; os pontos mais fracos foram versao/trilha, fidelidade entre canais e ausencia de evidencia completa de PDF/WhatsApp no laboratorio. As checagens deterministicas de documento canonico passaram. A Q4 deve melhorar a rastreabilidade e tambem fazer o laboratorio comparar as saidas reais, sem atribuir ao renderizador uma falha de conducao.

### Revisao e fechamento

Cinco das seis rodadas com proposta tiveram media 82,50. O polimento e localizado: distinguir `parcial` de `em risco`, preservar titulo e periodo, explicitar aprendizado e terminar com confianca, bloqueio e compromisso seguinte quando aplicavel.

## Fatias de implementacao

### Q4A - Motor adaptativo de sessao

- Definir estado canonico por ritual e validar no servidor quais fatos ja estao completos.
- Permitir pular fases satisfeitas por uma unica resposta.
- Selecionar a primeira lacuna realmente bloqueante; nunca pedir campo apenas porque aparece no roteiro.
- Classificar a resposta como vaga, parcial ou completa para escolher pergunta guiada, pergunta direta ou sintese.
- Bloquear repeticao semantica da ultima pergunta e manter uma unica confirmacao final.
- Adicionar testes que reproduzem os loops da Q3 antes da correcao.

Estado em 2026-07-16: concluida no staging. O novo `_shared/session-adaptive.ts` exige classificacao `vague|partial|ready`, valida os fatos declarados contra o estado real da sessao, impede avancar sem evidencia, bloqueia regressao e repeticao semantica e recusa proposta prematura. Uma resposta invalida recebe uma unica tentativa de reparo; se continuar invalida, o servidor usa resposta curta e deterministica sem mutar plano. O smoke `pnpm run eval:strategic:q4a` aprovou 15/15 checks com bloco completo, resposta vaga e anti-loop, sem gravacao prematura e com cleanup. Custo incremental da Q4A, incluindo as rodadas diagnosticas: US$ 0,093434; acumulado do plano: US$ 2,044079. Somente `oracle-session` foi publicada no staging; producao, frontend e WhatsApp real nao mudaram.

### Q4B - Conducao e plano trimestral

- Tornar forcas/gargalos proporcionais ao caso, nao uma lista obrigatoria.
- Se o plano anual nao existir, registrar excecao consciente sem mudar de ritual.
- Reenquadrar atividade como meio para um resultado e ajudar a reduzir excesso de prioridades.
- Incluir baseline, alvo, fonte, dono, acoes, riscos, aprendizado e cadencia quando informados.
- Fazer perguntas curtas com opcoes concretas quando o gestor estiver vago.

Estado em 2026-07-16: concluida no staging. `_shared/quarterly-guidance.ts` valida de 1 a 3 resultados, indicador, baseline, alvo, fonte, prazo, dono, acao completa e alinhamento anual real ou excecao justificada. O condutor deixou forcas/gargalos proporcionais, reenquadra atividade como meio e registra trade-offs. A confirmacao nao cria mais pai anual generico e recusa a contradicao de excecao acompanhada por novo vinculo; preserva baseline, fonte, prazo e acoes estruturadas no banco e no documento. Dez testes puros foram adicionados e a suite completa passou 311/311. O smoke `pnpm run eval:strategic:q4b` aprovou 21/21 checks em cinco cenarios antes e depois do reforco final, sempre com cleanup. Rodada final US$ 0,066221; total Q4B US$ 0,124095; acumulado US$ 2,168174. Somente `oracle-session` foi publicada no staging; producao, frontend e WhatsApp real nao mudaram.

### Q4C - Conducao e plano mensal

- Derivar trimestre e ano a partir do periodo mensal solicitado, inclusive passado ou futuro.
- Usar o objetivo trimestral aplicavel sem exigir uma reconfirmacao artificial da base.
- Absorver objetivo e acoes completos em bloco; perguntar apenas a lacuna impeditiva.
- Tratar capacidade e backlog como decisao: manter, adiar, renegociar ou cortar.
- Gravar acompanhamento, confianca, bloqueio e compromisso seguinte no plano mensal.

Estado em 2026-07-16: concluida no staging. O contexto deriva o trimestre do mes solicitado; `_shared/monthly-guidance.ts` valida 1 a 3 resultados, no maximo 5 acoes totais, campos verificaveis, datas dentro do mes, vinculo trimestral real ou excecao justificada e decisao explicita para pendencias. A confirmacao nao cria mais pai trimestral generico e o documento preserva capacidade, backlog, riscos, bloqueios, cadencia e proximo compromisso. O parser mensal aceita tanto `Jul 2026` quanto o formato legado `2026-07`, evitando recusa de sessoes antigas. A primeira rodada detectou fallback generico para pendencia (21/22); apos a correcao deterministica, tres rodadas passaram 22/22. A ultima executou o codigo final republicado no staging, com cleanup completo. Q4C custou US$ 0,169574 nas quatro rodadas; acumulado US$ 2,337748. Somente `oracle-session` foi publicada no staging; producao, frontend e WhatsApp real nao mudaram.

### Q4D - Naturalidade e polimento dos rituais

- Respostas normais com uma a tres frases antes de resumos; listas somente quando ajudam a decidir.
- Variar confirmacoes curtas e remover repeticao mecanica de "Entendi".
- Toda pergunta deve citar o fato que a motivou e indicar a decisao que ela destrava.
- Fechamentos preservam veredito honesto, aprendizado e ponte para o proximo ciclo.
- Nenhum texto tecnico como `base_confirmada`, nomes de fases ou chaves de schema chega ao gestor.

### Q4E - Saidas e rastreabilidade

- Comparar proposta confirmada, banco, documento canonico, resumo WhatsApp e PDF no laboratorio.
- Exibir ou preservar origem, versao e revisao sem poluir o documento executivo.
- Garantir hierarquia anual, trimestral e mensal e igualdade material entre canais.
- Manter precisao numerica e os testes deterministas que ja passaram.

### Q4F - Integracao e aceite tecnico

- Executar testes unitarios por defeito, integracao de sessao/proposta e paridade app/WhatsApp.
- Rodar memoria relevante e irrelevante, area/periodo, confirmacao unica e documento canonico.
- Validar desktop e mobile, lint, build, secret scan e CI.
- Publicar primeiro no staging. Producao e Q5 exigem gates separados.

## Gate da Q4

- Cada falha corrigida possui teste que falhava antes e passa depois.
- Gestor completo chega a sintese sem reiniciar entrevista.
- Gestor vago recebe pergunta guiada que avanca para resultado ou acao.
- Nenhuma conversa repete pergunta ou expoe estado tecnico.
- Trimestral e mensal geram proposta com uma unica confirmacao quando os fatos estao completos.
- Saidas reais sao comparadas entre proposta, banco, documento, PDF e WhatsApp.
- Nenhum dado de producao ou WhatsApp real e usado no desenvolvimento.

Depois do gate tecnico, a Q5 repetira exatamente os casos da Q3 para medir o antes/depois. Chamadas pagas da Q5 continuam dentro do limite acumulado de US$ 20 e exigem briefing de custo e autorizacao explicita.
