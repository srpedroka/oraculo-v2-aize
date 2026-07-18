# Piloto operacional O1

Data: 2026-07-18

Ambiente: producao para observacao inicial; staging descartavel para a correcao

Empresa do piloto: Gaam/Aize

Estado do gate: **conducao concluida; causa da confirmacao identificada e correcao aprovada no staging**

## Resumo executivo

O baseline do Comercial T3 2026 foi confirmado sem objetivo trimestral e sem documento canonico do periodo. Ao iniciar a conversa real no app, a sessao avancou no servidor, mas a mensagem e a resposta nao apareceram no painel. O piloto foi interrompido imediatamente; nenhum plano, objetivo, acao, KPI, membro ou configuracao foi gravado. A mensagem, a resposta e o uso de IA permaneceram na conversa arquivada como evidencia tecnica.

A causa foi reproduzida no codigo: uma `planning_session` ativa ainda apontava para um episodio de `conversations` ja arquivado. `oracle-session` reutilizava esse ID, enquanto o frontend exibia somente a conversa ativa mais recente. O estado estrategico avancava na conversa antiga e ficava invisivel.

A correcao preserva o estado da sessao e, antes da primeira mensagem, valida status, limite ocioso de quatro horas, empresa, pessoa e canal. Vinculo ausente, arquivado, vencido ou fora de escopo e trocado pela conversa ativa. Nenhum roteiro, regra de qualidade, confirmacao ou conteudo do plano foi alterado.

A PR #11 foi mesclada em `9f8287a` e o release protegido #32 publicou somente `oracle-session` em producao. A retomada real passou: mensagem e resposta apareceram no episodio ativo, a conversa permaneceu no Comercial T3 2026 e chegou a uma proposta unica. Antes de confirmar, o owner ajustou o vinculo para o objetivo anual canonico da area e preservou a terceira acao de migracao da base.

A confirmacao unica retornou HTTP 400 em 579 ms e nao gravou objetivo, acao ou documento. O frontend nao tratava a rejeicao do `callEdgeFunction`, por isso mantinha o botao em `Gravando...` indefinidamente mesmo com a Function ja encerrada. A recuperacao de UI foi publicada pelo merge `214faf0` e pelo deploy Netlify `6a5bf6b8c530a4c144469509`. Ao repetir somente a confirmacao, o painel liberou o botao e exibiu a causa exata: `Plano trimestral exige uma área`.

A sessao pendente era um registro legado com `area_id = null`, anterior ao bloqueio atual que exige uma area ao iniciar qualquer ritual trimestral, mensal ou de fechamento. Como o frontend prioriza propostas pendentes, essa sessao antiga continuou visivel mesmo depois de o owner entrar pelo Comercial. A correcao nao infere a area pelo texto: o painel bloqueia a gravacao, pede uma escolha explicita entre as areas permitidas e chama `bind_area`. O servidor valida pessoa, empresa, papel, area ativa, tipo e status da sessao; preserva proposta e conversa; aceita repetir o mesmo vinculo; e recusa trocar uma area ja vinculada.

## Evidencias

- Baseline de producao: Comercial, T3 2026, objetivo anual de reorganizacao da area; zero objetivo trimestral e zero documento canonico do periodo.
- Tentativa interrompida antes de proposta ou confirmacao; nenhum dado de plano ou configuracao foi gravado.
- Teste unitario: 8 cenarios de conversa ativa, ausente, arquivada, vencida e fora de escopo.
- Suite local: 520/520 testes unitarios, lint, build e bundle verdes.
- Staging: `oracle-session` publicada no projeto descartavel, sem migration ou frontend.
- Regressao real: sessao apontando para episodio arquivado foi religada ao episodio ativo antes da mensagem; 1/1 aprovado e cleanup concluido.
- Producao: CI da `main` `29660743221` verde; release protegido `29660983334` verde, com migration ignorada e somente `oracle-session` publicada.
- Retomada real: conversa visivel no episodio ativo, escopo Comercial T3 2026 preservado e proposta unica preparada.
- Confirmacao real: uma tentativa, HTTP 400 em 579 ms, zero gravacao e proposta pendente preservada; log estruturado `00391ed0-5dde-4f4e-996b-a7df46d8d697`.
- Recuperacao de frontend: erro da Function passa a aparecer no painel e libera retry seguro; 520/520 unitarios, lint, build e bundle verdes.
- Causa exata exposta em producao: `Plano trimestral exige uma área`; a segunda tentativa de confirmacao tambem terminou sem mutacao e manteve a proposta pendente.
- Recuperacao de area: 520/520 unitarios, lint, build e bundle verdes; a checagem Deno nao encontrou erro novo nos arquivos alterados e manteve registradas as referencias de tipagem legadas.
- Staging: 3/3 integracoes verdes. A sessao legada preservou proposta e conversa ao receber uma area explicita, repetiu o mesmo vinculo com sucesso e recusou a troca posterior por outra area. Cleanup da empresa descartavel concluido.
- Tentativa real invisivel: uma chamada de planejamento `gpt-5.4`, 8.882 tokens e US$ 0,023930; nenhuma chamada de judge.
- IA no teste da correcao: nenhuma chamada; custo US$ 0.
- Consumo acumulado do novo ciclo: US$ 0,025465 de US$ 20; aviso em US$ 15 e parada preventiva em US$ 19.

## Proximo gate

1. Revisar a correcao por PR/CI e publicar `oracle-session` + frontend apos autorizacao explicita de producao.
2. No painel, vincular explicitamente a proposta existente a area Comercial; nao reconstruir nem reconduzir o plano.
3. Confirmar uma unica vez e verificar 1 objetivo trimestral, 3 acoes, pai anual canonico e 1 documento, sem duplicatas.
4. Medir o custo real do O1, atualizar o ledger e seguir para o gate O2.

Enquanto a correcao nao estiver publicada, o O1 permanece pausado e nenhum dado precisa de rollback.
