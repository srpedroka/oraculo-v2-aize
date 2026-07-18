# Preflight operacional O0

Data: 2026-07-18

Ambiente: producao, somente leitura e backup manual

Empresa: Gaam/Aize
Estado do gate: **pausado**

## Resumo executivo

A producao responde e sua infraestrutura declarada esta coerente: 31 Edge Functions, 54 migrations, frontend HTTP 200, headers de seguranca e segredos fora do Git. Um backup manual pre-piloto foi criado, verificado no Storage interno e replicado externamente. O piloto funcional O1 ainda nao deve comecar porque o pacote de qualidade aprovado permanece fora de producao, o CI mais recente da `main` esta vermelho, o webhook do WhatsApp nao recebe evento recente e o snapshot incremental disparado pela auditoria do backup ainda precisa concluir.

Nenhum plano, KPI, membro, configuracao ou dado operacional foi alterado neste preflight.

## Evidencias

### Codigo e producao

- `git pull --rebase`: branch atualizada, sem divergencia remota antes do trabalho O0.
- `pnpm run production:verify`: aprovado.
- Edge Functions: 31 declaradas e 31 publicadas, com `verify_jwt` conforme `supabase/config.toml`.
- Migrations: 54 locais e 54 em producao.
- Frontend: HTTP 200, CSP, cache e headers esperados.
- Segredos: nenhum segredo detectado no Git pelo verificador de producao.
- A branch de qualidade esta 54 commits a frente da `main`; as correcoes Q4/Q5 ainda nao foram publicadas em producao.
- Ultimo CI observado na `main`: `Quality and build` verde, `Local Supabase integration` vermelho e `CI required` vermelho. A causa exata foi o primeiro caso de `quick-update-guard.test.ts`, que atingiu o timeout fixo em 30.002 ms; os outros dois casos do arquivo passaram. A branch alinha o timeout desses testes de worker a 60 s, sem mudar as assercoes de seguranca ou o runtime. A execucao anterior da `main` estava verde; a PR deve comprovar a correcao no ambiente local completo do CI.
- A primeira execucao da PR `#10` aprovou `Quality and build` e encontrou uma divergencia real no fechamento mensal: banco `current=50%`, mas documento sem baseline/atual. O aplicador passa a capturar o valor anterior do objetivo antes da mutacao e canonicaliza baseline 40%, atingido/current 50% e meta 60%; o teste de integracao exige os tres campos.

### Recuperacao

- Backup manual criado em 18/07/2026 14:58:41.
- Pacote: 646 registros, 113 KB, status verificado e replica externa concluida.
- Ultimo exercicio externo: 15/07/2026 16:52:43, pacote validado em 1,7 s.
- Politica: backup diario e snapshots por marco ativos; RPO 30 minutos; RTO 4 horas.
- A auditoria `backup_created`, gravada depois da conclusao do pacote, abriu uma nova requisicao incremental em 18/07/2026 14:58:43. Isso e esperado: `administrative_audit_events` faz parte do pacote e o cron seguinte deve criar o snapshot de evento e limpar a requisicao. O gate so fica verde depois dessa confirmacao.

### WhatsApp

- Evolution/Evo Go: instancia `oraculo` conectada ao numero configurado.
- URL esperada do webhook inclui o `orgId` correto.
- Fila: zero pendentes; falhas na ultima hora: zero.
- Ultimo evento recebido: 13/07/2026 15:30:30.
- Ultimo envio confirmado: 13/07/2026 15:30:44.
- Alertas ativos: webhook sem evento confirmado e nenhuma entrada recente. Um teste inbound real, autorizado no momento da acao, e necessario antes do O1.

### IA e baseline

- OpenAI: chave armazenada e mascarada; planejamento em `gpt-5.4`, validado.
- xAI: chave armazenada e mascarada; diario e background em Grok 4.3.
- Grok 4.5 permanece disponivel no catalogo, sem troca automatica de modelo.
- Probe manual do Grok 4.3 aprovado em 18/07/2026 15:00:07. O probe usa um ping e no maximo um token de saida; custo estimado inferior a US$ 0,0001 e nao registrado no ledger estrategico.
- Uso mensal exibido no app: 192 chamadas e US$ 2,86; politica da empresa em observacao, sem bloqueio automatico.
- Baseline recuperavel: 646 registros no backup, 30 historicos disponiveis para resgate e 5 objetivos de Evolucao ativos. A tela de Documentos mostrou pelo menos 30 itens na primeira pagina; a contagem completa permanece coberta pelo pacote, nao foi inferida pela paginacao.

## Novo ciclo financeiro

O ciclo anterior foi encerrado em US$ 17,352811. O historico continua imutavel no ledger. Em 18/07/2026 foi aberto um novo ciclo de testes com:

- limite autorizado de consumo: US$ 20;
- aviso: US$ 15 de gasto novo;
- parada preventiva: US$ 19 de gasto novo;
- consumo estrategico inicial do ciclo: US$ 0;
- compras, recargas, upgrades ou assinaturas: continuam exigindo autorizacao explicita separada imediatamente antes da cobranca.

## Pendencias para aprovar O0

1. Commitar e enviar o checkpoint O0, abrir PR para executar o CI completo da branch e corrigir qualquer falha real.
2. Obter CI verde e revisar o diff de producao; merge e release continuam dependentes de autorizacao explicita do owner.
3. Confirmar que o cron limpou a requisicao incremental do backup dentro do RPO.
4. Publicar o pacote aprovado somente pelo workflow protegido, depois da autorizacao do owner.
5. Publicar `operational-health` corrigida: a branch agora espera 54 migrations e o teste deriva esse numero dos arquivos locais, enquanto a Function atual de producao ainda espera 49.
6. Executar um teste inbound real do WhatsApp e confirmar evento, fila, outbox e resposta sem duplicacao.

Somente depois dos seis itens verdes o O1 pode criar um plano real pelo app.
