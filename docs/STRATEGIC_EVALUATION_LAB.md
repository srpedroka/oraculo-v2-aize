# Laboratorio de avaliacao estrategica

Versao: `2026-07-16.q2`

Status: Q0-Q4 concluidas; a incremental r22 comprovou 40/40. A regressao integral r23 aprovou Q5A 10/10 e Q5B 14/16 antes de revelar proposta trimestral prematura. A Q4AP foi aprovada no smoke exato; a proxima grade r24 reinicia matriz e Q5A-Q5D sem preservar resultados.

## Objetivo

O laboratorio executa casos sinteticos contra o Supabase de staging, captura a conducao do Oraculo, avalia a proposal, confirma uma unica vez e compara proposta, banco e documento canonico. Ele nao altera o app e nao possui caminho autorizado para producao.

## Artefatos

- `scripts/strategic-eval.ts`: runner real, fabrica minima, judge e cleanup.
- `scripts/strategic-eval-lib.ts`: schema, sanitizacao, custo, checks e fingerprint comparavel.
- `scripts/strategic-judge-schema.ts`: contrato JSON Schema estrito do judge.
- `scripts/strategic-q4ah-smoke.ts`: smoke trimestral da fronteira estruturada e da nota objetiva de escopo.
- `scripts/strategic-q4ai-smoke.ts`: smoke do fechamento trimestral sem pergunta redundante para gestor experiente.
- `scripts/strategic-q4aj-smoke.ts`: smoke da normalizacao legivel de risco estruturado na proposta, documento e WhatsApp.
- `scripts/strategic-q4ak-smoke.ts`: smoke do bloqueio server-side de KPI trimestral nao escolhido pelo gestor.
- `scripts/strategic-q4al-smoke.ts`: smoke do bloco mensal completo com pendencia herdada, continuidade e confirmacao unica.
- `scripts/strategic-q4am-smoke.ts`: smoke do desafio de capacidade sem repeticao de campos para gestor mensal experiente.
- `scripts/strategic-q4ap-smoke.ts`: smoke da barreira de fidelidade para varias acoes trimestrais incompletas, desafio unico e confirmacao unica.
- `scripts/strategic-model-ab.ts`: comparação paga e cega entre Grok 4.3/4.5, com trava de autorização e sem troca automática.
- `tests/evals/strategic-quality/cases/q1-minimal-annual.json`: primeiro caso sintetico, obrigatoriamente anual.
- `src/test/strategic-eval-runner.test.ts`: guardas e falhas seguras.
- `tests/evals/strategic-quality/cases/q2-catalog.json`: manifesto dos 29 casos Q2A-Q2E.
- `scripts/strategic-reference-cases.ts`: contrato e validacao reutilizavel do catalogo Q2.
- `scripts/verify-strategic-reference-cases.ts`: verificacao local, sem rede ou provider.
- `src/test/strategic-reference-cases.test.ts`: contagem, cobertura, politicas e falhas seguras do catalogo.
- `docs/STRATEGIC_QUALITY_CASES.md`: versao humana para o gate do owner.
- `.agents-private/strategic-eval-env`: chave temporaria local, nunca versionada.
- `.agents-private/strategic-eval-ledger.json`: custo acumulado do plano.
- `.agents-private/strategic-eval-q1-*.json`: relatorio sanitizado com permissao `600`.

## Fronteiras de seguranca

- recusa o project ref de producao antes de criar usuario ou empresa;
- exige `ORACULO_EVAL_KEY_SCOPE=staging-disposable`;
- aceita somente staging hospedado cuja URL corresponda ao project ref informado;
- cria um owner, uma empresa e uma area totalmente sinteticos;
- grava a chave apenas na empresa descartavel de staging;
- o judge chama somente o provedor e nao recebe cliente, endpoint ou credencial Supabase;
- o judge recebe apenas as rubricas aplicaveis e falhas criticas humanas; checks deterministas nao sao reenviados como fatos para a avaliação subjetiva, mas podem substituir a nota efetiva de um critério totalmente objetivo, com fonte registrada no relatório;
- timeout e retomada judge-only pertencem ao laboratorio e nao alteram o timeout do app em producao;
- snapshots antes/depois comprovam que o judge nao alterou o dominio;
- relatorio remove UUID, email, telefone, chave, token e referencia de producao;
- cleanup remove linhas da empresa, chave de staging e usuario Auth mesmo quando o caso falha;
- falha de cleanup deixa o gate vermelho e e reportada explicitamente.

## Custo

- sem limite isolado por caso ou fatia;
- reserva antes de cada chamada do condutor: US$ 0,15;
- reserva antes do judge: US$ 0,10;
- aviso do plano: US$ 15;
- parada preventiva: US$ 19;
- teto absoluto: US$ 20.

O custo real do condutor vem de `ai_usage_logs`. O judge usa tokens retornados pelo provedor e pricing versionado. A soma entra no ledger privado mesmo se o caso falhar depois de consumir IA.

Depois de cada execucao, o owner recebe: custo de geracao do plano, custo do judge, custo total da execucao e acumulado do plano antes/depois. O runner decide novas chamadas somente pelo acumulado: avisa em US$ 15, para preventivamente em US$ 19 e nunca ultrapassa US$ 20 sem nova autorizacao.

## Chave temporaria

O runner nao aceita chave de producao. Para concluir o gate:

1. criar no console xAI uma chave nova chamada `oraculo-q1-staging-temporary`;
2. colar a chave somente em `.agents-private/strategic-eval-env`, depois de `ORACULO_EVAL_API_KEY=`;
3. manter o arquivo com permissao `600`;
4. avisar ao agente apenas que a chave esta pronta, sem enviar o valor na conversa;
5. depois que o owner encerrar os testes autorizados, revogar a chave temporaria no console xAI.

Os consoles de provedor estao bloqueados para automacao pelas regras atuais do navegador. O agente nao deve contornar esse bloqueio.

## Execucao

Carregar as credenciais sem exibi-las:

```bash
set -a
source .agents-private/agent-env
source .agents-private/strategic-eval-env
set +a
pnpm run eval:strategic:q1
```

O runner usa Grok 4.3 no condutor e Grok 4.5 no judge quando `ORACULO_EVAL_PROVIDER=xai`. Ambos compartilham apenas a chave temporaria dessa fatia. A Q3 continua responsavel por medir o baseline oficial com a configuracao definida para a comparacao.

O A/B exploratório dos modelos fica bloqueado por padrão. Mesmo com as credenciais carregadas, ele só executa com `ORACULO_MODEL_AB_AUTHORIZED=true`; as propostas saem como A/B em arquivo privado e a chave de correspondência fica separada. Como os judges são cruzados, as notas servem como sinal exploratório, não como autorização automática de troca de modelo.

Se somente o judge falhar depois de cleanup completo, retomar o relatorio sem regenerar o plano ou acessar o banco:

```bash
node --experimental-strip-types scripts/strategic-eval.ts judge-report \
  .agents-private/strategic-eval-q1-<runId>.json \
  tests/evals/strategic-quality/cases/q1-minimal-annual.json
```

`recompute-report` recalcula o gate localmente, sem provedor, para corrigir somente a leitura dos pesos versionados.

## Checks deterministas

- sessao na area, periodo e nivel corretos;
- proposal `save_strategic_plan`;
- direcionadores, SWOT, quatro a seis objetivos, projetos e rituais presentes;
- zero plano/objetivo/documento do ano avaliado antes da confirmacao;
- um pedido final e uma chamada de confirmacao;
- banco com ano, objetivos e conteudo central da proposal;
- documento canonico correspondente;
- snapshot inalterado durante o judge.

## Gate Q1

Q1 somente e aprovada quando o caso anual minimo terminar com:

- proposal criada pelo condutor;
- judge concluido em modo somente leitura;
- todos os checks deterministas verdes;
- empresa, chave de staging e usuario removidos;
- custo da execucao e acumulado reportados, com acumulado dentro do teto de US$ 20;
- relatorio privado sanitizado e comparavel.
- todas as rubricas aplicaveis com pelo menos 80 e media conjunta de pelo menos 85;
- nenhuma falha critica confirmada e revisao humana do owner concluida.

Resultado final de 2026-07-16: técnica aprovada; Condução 86,25; Plano Anual 92,50; média 89,38; zero candidato crítico. A rodada final custou US$ 0,081603 e o acumulado de todas as tentativas foi US$ 0,428801. O staging foi limpo após cada execução. O owner aprovou e a correção foi publicada em produção no release protegido `29525599601`.

Alinhamento pré-produção da Revisão Estratégica em 2026-07-16: o ritual continua sendo microajuste de objetivos existentes, mas passou a absorver vários ajustes completos, ignorar objetivos declarados como inalterados, perguntar apenas lacunas bloqueantes e pedir uma confirmação final. Um teste real no staging alterou `current` e `target` de dois objetivos sintéticos na mesma proposta, comprovou zero mutação antes da confirmação, documento antes/depois, linguagem natural em PT-BR e cleanup. A rodada final custou US$ 0,004486; as duas tentativas somaram US$ 0,008976; acumulado do plano US$ 0,437777. O judge formal de revisões permanece no Q2D.

Aceite humano e produção: o owner aprovou o resultado e autorizou produção em 2026-07-16. A `oracle-session` foi publicada pelo release protegido `29525599601` e o frontend pelo deploy Netlify `6a5928c0f349e3bcc2a4728a`; verificações automáticas e smoke autenticado passaram. Por decisão explícita, a chave temporária continuará privada e disponível para os próximos testes; revogação deixou de ser pré-condição.

## Gate Q2

O catalogo `2026-07-16.q2` materializa 29 casos: Q2A=5, Q2B=8, Q2C=4, Q2D=5 e Q2E=7. Eles cobrem 15 entregas distintas e todas as 16 falhas criticas da rubrica. Cada caso declara contexto superior ou ausencia proposital, fatos sinteticos, memoria pertinente e concorrente, comportamento obrigatorio, comportamento proibido, evidencia minima, politica de confirmacao, mutacao e judge.

A montagem da Q2 nao acessou staging ou producao, nao chamou IA e custou US$ 0. Saidas derivadas usam fixtures e checks deterministas; judge fica opcional somente para relevancia de memoria. O owner aprovou o catalogo em 2026-07-16 e o manifesto passou a `owner-approved`. A Q3 continua dependendo de briefing com custo estimado e autorizacao explicita para executar o baseline pago.
