# Laboratorio de avaliacao estrategica

Versao: `2026-07-16.q1-r2`

Status: implementado localmente; gate Q1 pausado ate o aceite da rubrica Q0 R2 e, depois, pendente de chave temporaria de staging.

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
- snapshots antes/depois comprovam que o judge nao alterou o dominio;
- relatorio remove UUID, email, telefone, chave, token e referencia de producao;
- cleanup remove linhas da empresa, chave de staging e usuario Auth mesmo quando o caso falha;
- falha de cleanup deixa o gate vermelho e e reportada explicitamente.

## Custo

- limite desta fatia: US$ 1;
- reserva antes de cada chamada do condutor: US$ 0,15;
- reserva antes do judge: US$ 0,10;
- aviso do plano: US$ 15;
- parada preventiva: US$ 19;
- teto absoluto: US$ 20.

O custo real do condutor vem de `ai_usage_logs`. O judge usa tokens retornados pelo provedor e pricing versionado. A soma entra no ledger privado mesmo se o caso falhar depois de consumir IA.

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

Depois do aceite da Q0 R2, Q1 somente e aprovada quando o caso anual minimo terminar com:

- proposal criada pelo condutor;
- judge concluido em modo somente leitura;
- todos os checks deterministas verdes;
- empresa, chave de staging e usuario removidos;
- custo total menor ou igual a US$ 1;
- relatorio privado sanitizado e comparavel.

Sem chave temporaria, o estado correto e **pendente**, nunca aprovado por simulacao.
