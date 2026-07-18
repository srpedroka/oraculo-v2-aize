# Piloto operacional O1

Data: 2026-07-18

Ambiente: producao para observacao inicial; staging descartavel para a correcao

Empresa do piloto: Gaam/Aize

Estado do gate: **pausado antes da gravacao; correcao aprovada no staging e publicacao em producao pendente**

## Resumo executivo

O baseline do Comercial T3 2026 foi confirmado sem objetivo trimestral e sem documento canonico do periodo. Ao iniciar a conversa real no app, a sessao avancou no servidor, mas a mensagem e a resposta nao apareceram no painel. O piloto foi interrompido imediatamente; nenhum plano, objetivo, acao, KPI, membro ou configuracao foi gravado. A mensagem, a resposta e o uso de IA permaneceram na conversa arquivada como evidencia tecnica.

A causa foi reproduzida no codigo: uma `planning_session` ativa ainda apontava para um episodio de `conversations` ja arquivado. `oracle-session` reutilizava esse ID, enquanto o frontend exibia somente a conversa ativa mais recente. O estado estrategico avancava na conversa antiga e ficava invisivel.

A correcao preserva o estado da sessao e, antes da primeira mensagem, valida status, limite ocioso de quatro horas, empresa, pessoa e canal. Vinculo ausente, arquivado, vencido ou fora de escopo e trocado pela conversa ativa. Nenhum roteiro, regra de qualidade, confirmacao ou conteudo do plano foi alterado.

## Evidencias

- Baseline de producao: Comercial, T3 2026, objetivo anual de reorganizacao da area; zero objetivo trimestral e zero documento canonico do periodo.
- Tentativa interrompida antes de proposta ou confirmacao; nenhum dado de plano ou configuracao foi gravado.
- Teste unitario: 8 cenarios de conversa ativa, ausente, arquivada, vencida e fora de escopo.
- Suite local: 520/520 testes unitarios, lint, build e bundle verdes.
- Staging: `oracle-session` publicada no projeto descartavel, sem migration ou frontend.
- Regressao real: sessao apontando para episodio arquivado foi religada ao episodio ativo antes da mensagem; 1/1 aprovado e cleanup concluido.
- Tentativa real invisivel: uma chamada de planejamento `gpt-5.4`, 8.882 tokens e US$ 0,023930; nenhuma chamada de judge.
- IA no teste da correcao: nenhuma chamada; custo US$ 0.
- Consumo acumulado do novo ciclo: US$ 0,025465 de US$ 20; aviso em US$ 15 e parada preventiva em US$ 19.

## Proximo gate

1. Commit, push, PR e CI obrigatorio.
2. Revisao e autorizacao explicita do owner para mesclar e publicar somente `oracle-session` em producao.
3. Repetir a abertura do O1 no app.
4. Confirmar que a conversa aparece no episodio ativo.
5. Conduzir o plano trimestral ate uma unica confirmacao e seguir para o gate O2.

Se a publicacao nao for autorizada, o O1 permanece pausado e nenhum dado precisa de rollback.
