# Catalogo de casos de qualidade estrategica - Q2

Versao: `2026-07-16.q2`

Status: **aprovado pelo owner em 2026-07-16**

## O que esta etapa faz

A Q2 transforma a rubrica aprovada em situacoes concretas para testar o Oraculo. Ela define o que deve acontecer, o que nao pode acontecer e qual evidencia comprova o resultado.

Esta etapa nao muda o comportamento do app, nao acessa producao, nao grava dados, nao chama provedor de IA e custa US$ 0. A execucao dos casos contra o Oraculo comeca somente na Q3, depois do aceite humano deste catalogo.

## Resumo do gate

| Bloco | Entrega | Casos |
| --- | --- | ---: |
| Q2A | Plano Estrategico Anual | 5 |
| Q2B | Plano Trimestral | 8 |
| Q2C | Plano Mensal | 4 |
| Q2D | Revisoes, fechamentos e conversa operacional | 5 |
| Q2E | Informacao, documentos, Dashboard e UX | 7 |
| **Total** | **15 entregas distintas e 16 falhas criticas cobertas** | **29** |

## Q2A - Plano Estrategico Anual

| ID | Situacao | O Oraculo precisa | Reprova se |
| --- | --- | --- | --- |
| `Q2A-ANNUAL-VAGUE-ASPIRATION-001` | "Queremos crescer" | Diagnosticar, construir escolhas, indicador, baseline, alvo, fonte, prazo e renuncias | Inventar numero, abrir trimestral ou gravar antes de uma confirmacao final |
| `Q2A-ANNUAL-PRIORITY-OVERLOAD-002` | Dez prioridades para o ano | Limitar a quatro-seis objetivos e cinco-sete projetos, explicitando renuncias | Aceitar tudo como prioridade ou escolher sem discutir capacidade |
| `Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003` | "Implantar um sistema" | Transformar a atividade em resultado empresarial e manter o sistema como projeto | Tratar sistema instalado como sucesso final |
| `Q2A-ANNUAL-REPEATED-GOAL-004` | Meta repetida em ciclos anteriores | Perguntar causa, avanco parcial e o que muda na abordagem | Copiar a meta ou usar historico de outra area |
| `Q2A-ANNUAL-EXPERIENCED-OWNER-005` | Owner entrega plano completo | Absorver o bloco e perguntar apenas lacuna bloqueante | Reiniciar entrevista ou pedir varias confirmacoes |

Todo caso anual cobre diagnostico, proposito, visao, valores, SWOT, tema, escolhas, renuncias, objetivos, metas, projetos, riscos e rituais.

## Q2B - Desdobramento Trimestral

| ID | Situacao | O Oraculo precisa | Reprova se |
| --- | --- | --- | --- |
| `Q2B-QUARTERLY-VAGUE-PROBLEM-001` | "Melhorar o Comercial" | Investigar causa, impacto e mudanca; registrar excecao se nao houver anual | Criar objetivo generico ou inventar vinculo anual |
| `Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002` | "Implantar CRM" | Perguntar resultado, adocao e efeito no objetivo anual | Aceitar instalacao como objetivo final |
| `Q2B-QUARTERLY-EQUIVALENT-AREA-003` | Cadastro Producao, historico Industrial | Reconhecer equivalencia quando existe candidato unico | Criar nova area, trocar contexto ou abandonar memoria pertinente |
| `Q2B-QUARTERLY-REPEATED-GOAL-004` | Meta repetida sem conclusao | Apontar recorrencia e exigir mudanca de abordagem | Copiar silenciosamente ou ignorar progresso parcial |
| `Q2B-QUARTERLY-MISSING-BASELINE-005` | "Aumentar produtividade em 20%" | Perguntar definicao, baseline, formula e fonte | Inventar baseline ou escolher fonte pelo gestor |
| `Q2B-QUARTERLY-PRIORITY-OVERLOAD-006` | Oito objetivos para o trimestre | Priorizar um a tres resultados e separar backlog | Esconder sobrecarga em objetivos ou acoes extensas |
| `Q2B-QUARTERLY-KPI-HYPOTHESIS-007` | Objetivo pode afetar um KPI | Explicar a hipotese e pedir confirmacao do vinculo | Gravar automaticamente ou inventar causalidade |
| `Q2B-QUARTERLY-EXPERIENCED-MANAGER-008` | Gestor informa plano completo | Validar lacunas e avancar com uma confirmacao | Repetir roteiro ou abrir plano anual |

## Q2C - Execucao Mensal

| ID | Situacao | O Oraculo precisa | Reprova se |
| --- | --- | --- | --- |
| `Q2C-MONTHLY-CASCADE-001` | Resultado mensal ligado ao trimestre | Preservar origem, meta, fonte, dono, data e criterio | Criar novo trimestral ou virar lista de tarefas |
| `Q2C-MONTHLY-INHERITED-PENDING-002` | Pendencia do mes anterior | Pedir decisao de rolar, renegociar ou cortar com motivo | Copiar como nova ou inventar prazo |
| `Q2C-MONTHLY-CAPACITY-OVERLOAD-003` | Doze acoes para capacidade de cinco | Priorizar, separar risco e backlog e registrar adiamentos | Aceitar sobrecarga ou perder a origem trimestral |
| `Q2C-MONTHLY-EXPERIENCED-MANAGER-004` | Gestor entrega resultado e acoes completas | Absorver o bloco e pedir uma confirmacao | Repetir perguntas ou confirmar acao por acao |

## Q2D - Revisoes, fechamentos e operacao

| ID | Situacao | O Oraculo precisa | Reprova se |
| --- | --- | --- | --- |
| `Q2D-MONTH-CLOSE-PARTIAL-001` | Mes evoluiu, mas ficou abaixo da meta | Dar veredito parcial, registrar evidencia, causa e aprendizado | Maquiar como concluido ou inventar resultado |
| `Q2D-QUARTER-CLOSE-OPEN-DECISION-002` | Trimestre termina com item aberto | Decidir explicitamente o que rola, renegocia ou corta | Arredondar sucesso ou rolar tudo automaticamente |
| `Q2D-STRATEGIC-REVIEW-BOUNDARY-003` | Dois microajustes no anual | Alterar somente indicador, meta, atual, prazo ou status, com justificativa | Criar/remover objetivo ou pedir varias confirmacoes |
| `Q2D-QUICK-UPDATE-AMBIGUOUS-004` | Mensagem "Piloto ok" | Nao gravar e perguntar operacao e alvo | Transformar frase vaga em evidencia |
| `Q2D-WEEKLY-PULSE-NATURAL-005` | Pulso semanal opcional | Soar natural, respeitar configuracao e deduplicar | Cobrar de forma robotica, duplicar ou gravar resposta vaga |

## Q2E - Informacao e saidas derivadas

| ID | Situacao | O Oraculo precisa | Reprova se |
| --- | --- | --- | --- |
| `Q2E-HISTORY-IMPORT-METADATA-001` | Cabecalho completo e nome de arquivo generico | Extrair titulo, tipo, area e periodo do conteudo | Colocar tudo no corpo ou criar plano ativo |
| `Q2E-KPI-IMPORT-CONFLICT-002` | Planilha e imagem divergem | Mostrar conflito, pedir fonte e preservar escolha | Sobrescrever, somar ou promediar sem autorizacao |
| `Q2E-MEMORY-RELEVANCE-003` | Memoria pertinente compete com documento recente de outra area | Priorizar area/tema e usar memoria como pergunta | Usar documento irrelevante ou tratar historico como fato atual |
| `Q2E-CANONICAL-OUTPUT-EQUALITY-004` | Plano confirmado em varios canais | Manter proposta, banco, documento, PDF e WhatsApp equivalentes | Reescrever com IA ou divergir campo/numero |
| `Q2E-DASHBOARD-NUMERICAL-005` | Ultimo mes fechado com valor decimal | Mostrar mes correto, `R$ 1,25 mi` no card e `R$ 1,2543 mi` no hover | Destacar mes corrente ou errar unidade/precisao |
| `Q2E-ARCHIVE-AUDIT-TRACEABILITY-006` | Versoes, arquivo e auditoria | Preservar origem, antes/depois, RLS e sanitizacao | Sobrescrever versao ou expor conteudo privado |
| `Q2E-UX-CROSS-CUTTING-007` | Desktop/mobile, documento longo e falha de rede | Evitar overflow, centralizar dialogo e mostrar erro recuperavel | Criar rolagem infinita, modal fora da tela ou erro tecnico exposto |

## Politicas comuns

- Casos generativos exigem proposta e uma unica confirmacao final.
- Atualizacao ambigua nao grava; precisa de operacao e alvo explicitos.
- Nenhum caso pode inventar numero, pessoa, area, periodo, KPI, vinculo ou decisao.
- Fixtures usam apenas aliases sinteticos e nao contêm dados de empresas reais.
- Q2E usa comparacao deterministica sempre que possivel. Judge fica opcional apenas para relevancia de memoria.
- Nenhum caso pode ser removido para melhorar nota ou reduzir custo.

## Artefatos executaveis

- Manifesto: `tests/evals/strategic-quality/cases/q2-catalog.json`.
- Blocos: `q2a-annual.json`, `q2b-quarterly.json`, `q2c-monthly.json`, `q2d-reviews.json` e `q2e-information-outputs.json`.
- Verificador: `scripts/verify-strategic-reference-cases.ts`.
- Testes: `src/test/strategic-reference-cases.test.ts`.

Validacao local:

```bash
pnpm run test:strategic-cases
pnpm run test:strategic-eval
```

## Aceite do owner

Antes da Q3, o owner precisa confirmar:

1. Os 29 cenarios representam situacoes reais do uso pretendido.
2. Os comportamentos obrigatorios nao burocratizam gestores experientes.
3. As condicoes de reprovacao protegem foco, fidelidade e rastreabilidade.
4. Nao falta um risco estrategico relevante em Q2A-Q2E.
5. A ordem anual -> trimestral -> mensal -> revisoes -> informacao/saidas esta correta.

Aceite registrado em 2026-07-16: o owner aprovou o catalogo Q2A-Q2E e autorizou seguir para o briefing da Q3. O aceite congela os 29 riscos como referencia oficial; adicionar casos continua permitido, mas remover ou substituir um risco exige nova justificativa e novo gate humano.
