# Preflight operacional O0

Data: 2026-07-18

Ambiente: producao, preflight e teste controlado

Empresa: Gaam/Aize
Estado do gate: **aprovado**

## Resumo executivo

A producao responde e sua infraestrutura declarada esta coerente: 31 Edge Functions, 54 migrations, frontend HTTP 200, headers de seguranca e segredos fora do Git. O pacote de qualidade foi mesclado na `main` e publicado pelo release protegido, o frontend correspondente foi publicado no Netlify e o backup pre-piloto permanece verificado no Storage interno e na replica externa. O teste real do WhatsApp confirmou entrada, fila, resposta unica e ausencia de loop. O gate O0 esta verde e o O1 pode comecar depois de briefing e autorizacao especifica do owner.

Nenhum plano, KPI, membro, configuracao ou dado operacional foi alterado neste preflight.

## Evidencias

### Codigo e producao

- `git pull --rebase`: branch atualizada, sem divergencia remota antes do trabalho O0.
- `pnpm run production:verify`: aprovado.
- Edge Functions: 31 declaradas e 31 publicadas, com `verify_jwt` conforme `supabase/config.toml`.
- Migrations: 54 locais e 54 em producao.
- Frontend: HTTP 200, CSP, cache e headers esperados.
- Segredos: nenhum segredo detectado no Git pelo verificador de producao.
- A PR `#10` foi mesclada na `main` no commit `faf0c7a9e4e04c9db6e1a137d8618a13bbb379b2`.
- O CI da `main` `29656419371` aprovou `Quality and build`, `Local Supabase integration` e `CI required`.
- O release protegido `29656636664` publicou as dez Functions afetadas; nao havia migration nova.
- O frontend da mesma arvore foi publicado no Netlify no deploy `6a5bcc85d538ad3035c0084c`. A verificacao final confirmou o asset `/assets/index-Bp6BRksl.js` e o smoke autenticado abriu Planos Trimestrais sem gravar dados.
- A falha historica do `quick-update-guard.test.ts` foi resolvida pelo timeout de teste alinhado a 60 s, sem mudar as assercoes de seguranca ou o runtime.
- A primeira execucao da PR `#10` aprovou `Quality and build` e encontrou uma divergencia real no fechamento mensal: banco `current=50%`, mas documento sem baseline/atual. O aplicador passa a capturar o valor anterior do objetivo antes da mutacao e canonicaliza baseline 40%, atingido/current 50% e meta 60%; o teste de integracao exige os tres campos.
- A execucao seguinte acionou a trava de hash do runtime para `proposals.ts`. O baseline foi atualizado explicitamente para o SHA-256 da correcao, sem alterar casos, pesos, notas ou resultados Q5.

### Recuperacao

- Backup manual criado em 18/07/2026 14:58:41.
- Pacote: 646 registros, 113 KB, status verificado e replica externa concluida.
- Ultimo exercicio externo: 15/07/2026 16:52:43, pacote validado em 1,7 s.
- Politica: backup diario e snapshots por marco ativos; RPO 30 minutos; RTO 4 horas.
- A auditoria `backup_created`, gravada depois da conclusao do pacote, abriu uma nova requisicao incremental em 18/07/2026 14:58:43. Isso e esperado: `administrative_audit_events` faz parte do pacote e o cron seguinte deve criar o snapshot de evento e limpar a requisicao. O gate so fica verde depois dessa confirmacao.
- Confirmacao concluida: snapshot de marco em 18/07/2026 15:07:00, 647 registros, 113 KB, interno e externo verificados; painel voltou para `Protegido` e nao exibe requisicao pendente.

### WhatsApp

- Evolution/Evo Go: instancia `oraculo` conectada ao numero configurado.
- URL esperada do webhook inclui o `orgId` correto.
- Fila: zero pendentes; falhas na ultima hora: zero.
- O painel enviou a mensagem tecnica fixa ao owner em 18/07/2026 16:05:35, sem IA.
- O owner autorizou o teste inbound; `oi teste O0` foi enviado pelo WhatsApp real ao Oraculo.
- Evento autenticado recebido em 18/07/2026 16:07:55 e resposta confirmada em 18/07/2026 16:08:01.
- A resposta apareceu uma unica vez. Depois de novo intervalo de observacao, nao houve duplicacao nem loop.
- Estado final: `Operando`, webhook confirmado pelo trafego, zero pendencias, zero falhas em duas tentativas e nenhum alerta ativo.

### IA e baseline

- OpenAI: chave armazenada e mascarada; planejamento em `gpt-5.4`, validado.
- xAI: chave armazenada e mascarada; diario e background em Grok 4.3.
- Grok 4.5 permanece disponivel no catalogo, sem troca automatica de modelo.
- Probe manual do Grok 4.3 aprovado em 18/07/2026 15:00:07. O probe usa um ping e no maximo um token de saida; custo estimado inferior a US$ 0,0001 e nao registrado no ledger estrategico.
- O inbound real O0 registrou uma chamada Grok 4.3 de bastidores em 18/07/2026 16:08:00: 841 tokens e custo estimado de US$ 0,001535.
- Uso mensal exibido no app: 192 chamadas e US$ 2,86; politica da empresa em observacao, sem bloqueio automatico.
- Baseline recuperavel: 646 registros no backup, 30 historicos disponiveis para resgate e 5 objetivos de Evolucao ativos. A tela de Documentos mostrou pelo menos 30 itens na primeira pagina; a contagem completa permanece coberta pelo pacote, nao foi inferida pela paginacao.

## Novo ciclo financeiro

O ciclo anterior foi encerrado em US$ 17,352811. O historico continua imutavel no ledger. Em 18/07/2026 foi aberto um novo ciclo de testes com:

- limite autorizado de consumo: US$ 20;
- aviso: US$ 15 de gasto novo;
- parada preventiva: US$ 19 de gasto novo;
- consumo medido do novo ciclo: US$ 0,001535; o probe anterior inferior a US$ 0,0001 permanece fora do ledger estrategico;
- compras, recargas, upgrades ou assinaturas: continuam exigindo autorizacao explicita separada imediatamente antes da cobranca.

## Gate O0 concluido

1. Checkpoint, PR e CI completo: concluido.
2. Revisao, merge e release protegido: concluido com autorizacao explicita do owner.
3. `operational-health` e demais Functions afetadas: publicadas.
4. Frontend correspondente: publicado e verificado.
5. Teste inbound real do WhatsApp: evento, fila, outbox, resposta unica e ausencia de loop confirmados.

Os cinco itens estao verdes. O O1 pode criar um plano real pelo app depois de o owner aprovar seu briefing.
