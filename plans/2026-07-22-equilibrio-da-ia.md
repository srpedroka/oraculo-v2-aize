# Plano Equilibrio da IA

Data: 2026-07-22

Status: **APROVADO PARA EXECUCAO FATIADA - FASE 1 E A PROXIMA**

Regido por:

- `plans/2026-07-19-plano-mestre-evolucao-integrado.md`;
- `plans/2026-07-19-painel-progresso-geral.md`;
- `plans/especificos/04-revisao-semestral-estrategica.md`;
- `plans/ddr/AI-first-arquitetura-conversacional.md`.

Este e um subplano corretivo dentro da R1. Ele nao cria pontos extras no plano
mestre: o progresso geral permanece em 52,5% e o Plano 4 em 50% ate a R1B real
ser aprovada. Seu progresso interno serve para orientar a execucao e os gates.

## 1. Objetivo

Recuperar a naturalidade e a inteligencia percebida do Oraculo sem relaxar a
integridade dos dados. O modelo passa a possuir a fala; o servidor continua
possuindo autenticacao, permissao, escopo, IDs, estado canonico, proposta,
confirmacao, transacao, idempotencia, auditoria e gravacao.

Principio: **liberdade na fala, rigor na gravacao**.

## 2. Diagnostico

A protecao contra alucinacao foi acumulando tres efeitos indesejados:

1. prompts com instrucoes de estilo redundantes e muitas proibicoes;
2. respostas organicas substituidas por envelopes deterministas;
3. reparos que regeneram falas por heuristicas de estilo, mesmo quando os dados
   estao corretos.

O resultado pode soar mecanico, repetir perguntas e tratar guias como
formularios. A solucao nao e remover controle, mas separar com clareza a
qualidade da conversa da autoridade de gravacao.

## 3. Invariantes

Nenhuma fase pode alterar silenciosamente:

- provedor ou modelo configurado por empresa e funcao;
- roteador `planning`, `daily` e `background` e seus limites;
- modo misto: confirmacao para planos/fechamentos e gravacao direta apenas para
  atualizacoes pequenas conhecidas;
- normalizadores de propostas em `session-ready-plans.ts`;
- regras de `untrusted-content.ts`;
- memoria por conversa, resumo, `applyProposal`, transacoes e idempotencia;
- nomenclatura `Area` e `Coordenador`;
- isolamento de segredos: chaves permanecem nas tabelas publicas bloqueadas por
  RLS/revokes e acessiveis somente por `service_role`, nunca no frontend;
- uma unica confirmacao material antes da gravacao de uma proposta;
- nenhuma persistencia de fala livre sem extracao, validacao e autorizacao
  server-side.

## 4. Ajustes de arquitetura aprovados

O plano de origem foi preservado com quatro correcoes obrigatorias:

1. Na Fase 2, situacoes deterministas orientam a fala, mas o servidor continua
   mantendo estado, periodo, escopo e proposta canonicos. O modelo nao passa a
   decidir IDs ou o que e gravado.
2. Na Fase 3, observacoes de estilo registram apenas codigo, contagem, funcao,
   ritual, canal e tempo. Logs nunca guardam trecho da conversa, documento,
   prompt, telefone ou outro conteudo privado.
3. Na Fase 4, a extracao estrutural e validada e persistida antes de encerrar o
   turno. A fala pode ser produzida primeiro internamente, mas nao se cria uma
   corrida em que o proximo turno chega antes do estado canonico.
4. A flag da Fase 4 e por empresa, desativada por padrao e reversivel sem
   deploy. Sua tabela e policy seguem membro-le/owner-escreve ou uma Edge
   Function owner-only, conforme o desenho aprovado na propria fase.

## 5. Progresso interno

| Fase | Peso | Estado | Gate principal |
| --- | ---: | --- | --- |
| F1. Destilar o prompt | 20% | Nao iniciada | Prompt unico, testes e piloto natural |
| F2. Situacoes em vez de templates | 25% | Nao iniciada | Modelo fala; deteccoes permanecem |
| F3. Estilo em observacao | 20% | Nao iniciada | So defeito de dado regenera |
| F4. Separar prosa e estrutura | 25% | Nao iniciada | Flag por empresa, dados consistentes |
| F5. Limpeza e E2E | 10% | Bloqueada pelo piloto | Codigo morto removido e regressao verde |
| **Total** | **100%** | **0% concluido** | - |

As Fases 1 a 4 acontecem antes da R1B. A Fase 5 so acontece depois do piloto e
do periodo de observacao; portanto, a R1B pode ocorrer com este subplano em 90%.

## 6. Protocolo de cada fase

Antes de executar:

1. apresentar briefing em linguagem simples;
2. dizer o que muda e o que nao muda para o usuario;
3. listar runtime, banco, frontend, Functions e dados afetados;
4. informar custo esperado de IA e confirmar qualquer compra separadamente;
5. definir testes, ambiente, gate e rollback;
6. aguardar autorizacao explicita do owner.

Depois de executar:

1. rodar unitarios proporcionais ao risco, lint e build;
2. ampliar para integracao, seguranca e E2E quando aplicavel;
3. publicar primeiro em staging e validar o piloto definido;
4. documentar custo, latencia, resultado e regressao;
5. pedir gate do owner antes de avancar ou publicar em producao;
6. atualizar plano, painel, changelog e handoffs no mesmo ciclo.

## 7. Fase 1 - Destilar o prompt

### Objetivo

Fundir `PERSONA_ORACULO`, `REGRAS_DE_SESSAO` e
`ADAPTIVE_SESSION_RULES` em um nucleo curto, positivo e unico, sem remover as
regras de metodo dos condutores.

### Implementacao

1. Criar `_shared/conductors/nucleo.ts` com `NUCLEO_ORACULO` e
   `CONTRATO_TECNICO`.
2. Na montagem do prompt de `session-engine.ts`, substituir apenas as tres
   camadas redundantes pelo novo nucleo e contrato.
3. Manter `UNTRUSTED_CONTENT_RULES`, tom da empresa, condutor e contexto.
4. Manter as constantes antigas sem uso; elas so podem ser removidas na Fase 5.
5. Remover dos condutores somente repeticoes de estilo. Fases, fatos a coletar,
   contratos anual/trimestral/mensal e criterios de fechamento permanecem.

### Nucleo aprovado

```text
Voce e o Oraculo, o facilitador estrategico da empresa. Voce conduz lideres
ocupados na criacao e execucao de planos, em portugues do Brasil.

Voce e um conselheiro experiente: direto, caloroso e genuinamente curioso sobre
o negocio. Adapte o ritmo a pessoa. Acelere com quem esta pronto e simplifique
com quem esta perdido.

Faca uma pergunta por vez, nascida de algo que a pessoa disse e apontando para
uma decisao, resultado ou acao. Diante de resposta vaga, ofereca dois ou tres
caminhos concretos do mundo dela. Provoque com respeito e proteja a execucao:
poucos objetivos bem executados valem mais que muitos no papel.

Use Area e Coordenador. Resultado e a colheita, o jogo atual; Evolucao e o
plantio, o proximo jogo. Objetivo bom tem verbo, o que, quanto ou padrao e prazo,
ligado ao nivel de cima. Acao-chave tem verbo, o que, criterio de conclusao,
prazo e responsavel.

Nunca invente numero, baseline ou fato. Referencia sugerida deve ser chamada de
sugestao e validada. Nunca diga que salvou antes da confirmacao do sistema. Nao
exponha fases, campos, estado ou proposta tecnica. Fora disso, escreva com
naturalidade e criterio proprio; sinteses podem ser mais longas quando merecem.
```

### Contrato tecnico aprovado

```text
Retorne o objeto JSON exigido pelo runtime com reply, state_patch, next_phase,
proposal e done. O condutor e um mapa, nao um formulario: absorva todos os fatos,
pule o que ja estiver satisfeito e va a primeira lacuna real. Corrija o estado
quando a pessoa corrigir um fato. Grave apenas fatos explicitos em state_patch.
Na sintese, apresente a proposta completa e solicite uma unica confirmacao. Nao
marque done antes da confirmacao do servidor. Responda interrupcoes naturalmente
e preserve a sessao quando houver pausa.
```

### Gate F1

- unitarios de prompt, proposta, confirmacao e gravacao verdes;
- lint e build verdes;
- integracao de sessao trimestral sem regressao de dados;
- conversa piloto perceptivelmente mais natural;
- rollback: voltar a composicao anterior do prompt, sem migration.

## 8. Fase 2 - Situacoes em vez de templates

### Objetivo

Reaproveitar integralmente a deteccao determinista de pendencia, capacidade e
fechamento, mas entregar seus fatos ao modelo em vez de substituir a fala.

### Implementacao

1. Criar versoes `*Situation`, nos mesmos arquivos de origem
   (`monthly-ready-block.ts` e `close-quality.ts`), para as deteccoes hoje
   convertidas em envelopes: `monthlyInheritedPendingEnvelope`,
   `completeMonthlyReadyEnvelope`, `monthlyExperiencedActionsChallengeEnvelope`,
   `monthlyCapacityDecisionEnvelope`, `monthClosePartialDecisionEnvelope` e
   `quarterCloseOpenDecisionEnvelope`.
2. Cada situacao retorna `kind`, fatos canonicos e a decisao que precisa ser
   tratada; nao retorna frase pronta ao usuario.
3. Injetar as situacoes no prompt sob `SITUACOES DETECTADAS PELO SISTEMA`.
4. Chamar o modelo em todo turno conversacional. Infraestrutura pura, como
   instrucao tecnica para envio de arquivo, pode permanecer deterministica.
5. O servidor preserva a proposta canonica e valida qualquer estrutura recebida.
6. Registrar somente identificadores e contagens das situacoes, sem conteudo
   privado.

### Gate F2

- pendencia herdada, excesso de capacidade e fechamento parcial detectados;
- a fala visivel nasce do modelo nesses cenarios;
- nenhum ID, periodo ou dado e inferido sem validacao;
- testes deixam de exigir texto literal e passam a exigir situacao + contrato;
- piloto: fechamento mensal com pendencia tratado com voz propria.

## 9. Fase 3 - Validadores de fala em observacao

### Objetivo

Regenerar apenas por defeitos que ameacem estrutura ou gravacao. Heuristicas de
estilo medem a conversa, mas nao bloqueiam nem atrasam a resposta.

### Implementacao

1. Exportar de `session-adaptive.ts` as listas `DATA_REPAIR_REASONS` e
   `STYLE_OBSERVATION_REASONS`.
2. Manter bloqueio para envelope JSON invalido, `strategic_wrong_year`,
   `strategic_incomplete_proposal`, propostas trimestrais/mensais incompletas,
   `done` sem confirmacao, `phase_advance_without_evidence` e equivalentes.
3. Tornar `questionsAreSimilar`, bordoes, contagem de frases,
   `quarterly_complete_block_overquestioned` e demais heuristicas de estilo
   apenas observacoes.
4. Registrar dados sanitizados: codigo da heuristica, contagem, ritual, canal,
   funcao e latencia. Proibido registrar a fala ou qualquer trecho do contexto.
5. Documentar consulta semanal no RUNBOOK.
6. Depois de quatro semanas, heuristica pouco util vira candidata a remocao;
   recorrencia alta gera ajuste no nucleo ou condutor, nunca novo bloqueio.

### Gate F3

- nenhum reparo e disparado somente por estilo;
- defeitos de dados continuam fechados;
- consulta semanal sanitizada funciona;
- latencia e numero de regeneracoes sao comparados com a baseline.

## 10. Fase 4 - Separar prosa e estrutura

### Objetivo

Gerar a fala em texto livre e extrair a estrutura por uma segunda chamada
`background`, mantendo a mesma autoridade server-side.

### Implementacao

1. Criar `session-extract.ts` para extrair `state_patch`, `next_phase`,
   `proposal` e `done` somente de fatos explicitos, usando uma versao de
   `PLANNING_SESSION_OUTPUT` sem `reply`.
2. A chamada `planning` produz apenas a fala, sem `structuredOutput`; a chamada
   `background` extrai a estrutura usando mensagem, fala, estado e fase.
3. Aplicar os mesmos validadores, normalizadores e confirmacao atuais ao objeto
   extraido.
4. Executar retry unico de extracao. Se continuar invalido, nao persistir patch
   ou proposta e responder de forma recuperavel, sem fingir sucesso.
5. Persistir o estado validado antes de encerrar o turno e liberar o proximo,
   evitando corrida entre mensagens.
6. Criar flag `prose_split_enabled` por empresa, desativada por padrao, owner-only
   para escrita e com rollback sem deploy.
7. Medir geracao, extracao, custo por funcao, total por turno e latencia.

### Gate F4

- flag ligada apenas na empresa piloto;
- plano trimestral, atualizacao de acao e fechamento mensal mantem dados,
  proposta unica e idempotencia;
- flag desligada preserva o comportamento anterior;
- custo adicional e latencia documentados;
- teste de concorrencia prova que um novo turno nao le estado antigo.

## 11. R1B entre F4 e F5

Com F1-F4 aprovadas e a flag ativa apenas na empresa piloto, o owner executa a
R1B real em producao: Revisao do Primeiro Semestre e Plano do Segundo Semestre,
com o material real de T1/T2, uma conferencia e uma confirmacao. Esse gate mede
naturalidade, profundidade estrategica, fidelidade, consistencia dos documentos
e custo. A aprovacao da R1B eleva o Plano 4 e o plano geral conforme o painel.

## 12. Fase 5 - Limpeza, documentacao e E2E

### Pre-condicao

Piloto concluido e pelo menos quatro semanas de observacao de estilo, salvo nova
decisao explicita do owner baseada em evidencia suficiente.

### Implementacao

1. Remover constantes antigas, envelopes substituidos e heuristicas comprovadas
   como dispensaveis; documentar numeros e motivo de cada remocao.
2. Alinhar `oracle-chat` e WhatsApp `daily` ao mesmo principio, sem ampliar o
   escopo de gravacao.
3. Atualizar arquitetura, decisoes, seguranca, RUNBOOK e changelog.
4. Varrer nomes proibidos ou legados.
5. Executar E2E: trimestral com inicio vago, fechamento com pendencia,
   atualizacoes no WhatsApp, documento/PDF e custo por funcao.

### Gate F5

- codigo morto removido sem perda de cobertura;
- documentos refletem a separacao fala/estrutura;
- E2E web + WhatsApp + documento verde;
- nenhuma intervencao manual alem das confirmacoes do modo misto.

## 13. Ordem oficial

```text
Correcao Markdown em producao
-> F1 prompt destilado
-> F2 situacoes
-> F3 estilo em observacao
-> F4 prosa/estrutura por flag
-> R1B real com o owner
-> beta coletivo e validacao operacional
-> F5 depois do periodo de observacao
```

Nao avancar de fase sem briefing e aprovacao. Nenhuma compra, credito, assinatura
ou upgrade esta autorizada por este plano; uso de API segue o ciclo de orcamento
ja aprovado e deve ser reportado separadamente.
