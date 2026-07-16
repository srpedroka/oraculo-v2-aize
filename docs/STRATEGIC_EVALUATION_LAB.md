# Laboratorio de avaliacao estrategica

Versao: `2026-07-16.q1-r2`

Status: implementado; Q0 R2 e gate automatizado Q1 aprovados, revisão humana do owner pendente.

## Objetivo

O laboratorio executa casos sinteticos contra o Supabase de staging, captura a conducao do Oraculo, avalia a proposal, confirma uma unica vez e compara proposta, banco e documento canonico. Ele nao altera o app e nao possui caminho autorizado para producao.

## Artefatos

- `scripts/strategic-eval.ts`: runner real, fabrica minima, judge e cleanup.
- `scripts/strategic-eval-lib.ts`: schema, sanitizacao, custo, checks e fingerprint comparavel.
- `tests/evals/strategic-quality/cases/q1-minimal-annual.json`: primeiro caso sintetico, obrigatoriamente anual.
- `src/test/strategic-eval-runner.test.ts`: guardas e falhas seguras.
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
- o judge recebe apenas as rubricas aplicaveis e falhas criticas humanas; checks deterministas nao sao reenviados para avaliacao subjetiva;
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
5. depois do teste e cleanup, revogar a chave temporaria no console xAI.

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

Resultado final de 2026-07-16: técnica aprovada; Condução 86,25; Plano Anual 92,50; média 89,38; zero candidato crítico. A rodada final custou US$ 0,081603 e o acumulado de todas as tentativas foi US$ 0,428801. O staging foi limpo após cada execução. A correção está somente na `oracle-session` de staging; o owner precisa revisar o plano e autorizar produção antes de Q2.
