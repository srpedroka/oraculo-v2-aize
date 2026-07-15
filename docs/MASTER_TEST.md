# Teste Mestre Final

## Estado atual

A preparação 7A e o cenário funcional 7B foram concluídos no staging isolado em 2026-07-15. Nenhum dado, configuração, Function ou frontend de produção foi alterado.

O baseline persistente contém:

- Organização A com owner, admin e dois coordenadores;
- áreas Produção e Comercial, cada uma com coordenador próprio;
- Organização B com owner separado para prova de isolamento;
- quatro KPIs padrão e `ai_settings` em cada organização;
- controle de IA da Organização A em `monitor`, com orçamento mensal de teste de US$ 5;
- TOTP verificado e política de MFA crítica somente no owner descartável da Organização A;
- WhatsApp real ausente e inerte nas duas organizações;
- caminho sintético do webhook/fila validado sem Evolution ou número de produção.

O identificador do ciclo, usuários, senhas, segredo TOTP e IDs de limpeza ficam somente em `.agents-private/master-test-7a.json`, com permissão local `600` e ignorados pelo Git. Não copie esse arquivo para commits, logs, mensagens ou artefatos.

## Comandos

Carregue `.agents-private/agent-env` sem exibir os valores e use:

```bash
pnpm run test:master:verify
pnpm run test:master:functional
```

Use `setup` somente quando não existir ciclo aberto:

```bash
pnpm run test:master:setup
```

Use `cleanup` apenas depois do relatório e aceite final da Etapa 7:

```bash
pnpm run test:master:cleanup
```

Os quatro comandos recusam a referência de produção. `setup` também recusa substituir um estado aberto, e uma falha parcial tenta limpar todos os recursos já criados. `functional` grava evidência incremental em `.agents-private/master-test-7b.json`; depois de concluído, não repete o ciclo nem sobrescreve o relatório.

## Evidências da preparação 7A

- preflight real da fábrica: 1/1 verde, com criação e limpeza confirmadas;
- baseline persistente: 12/12 verificações verdes;
- WhatsApp sintético: 8/8 integrações verdes, incluindo autenticação, deduplicação 10x, isolamento, payload mínimo e bloqueio de loop;
- suíte unitária após adicionar o roteiro: 52 arquivos e 239 testes verdes;
- lint TypeScript verde.

## Evidências do cenário 7B

- 7B1: baseline 12/12 com login, MFA, papéis, áreas, KPIs, isolamento A → B e WhatsApp real inerte;
- 7B2: três históricos gravados pelo endpoint real; planos estratégico, trimestral e mensal confirmados; reconfirmação sem duplicidade; vínculos entre níveis e documentos canônicos verificados;
- 7B3: revisão mensal, evidência, check-in, importação confirmada de KPI, vínculo objetivo-KPI, arquivo/restauração, auditoria e webhook/fila/worker sintéticos aprovados;
- 7B4: backup completo, clone interno verificado, ausência de segredos, WhatsApp inerte e descarte somente do clone;
- regressão complementar: 12/12 testes de integração para PDF comprimido no WhatsApp, atomicidade/rollback de propostas e importação de KPI;
- `save-historical-document` e `operational-lifecycle` foram publicadas somente no staging porque estavam ausentes nesse ambiente.

### Limitação explícita

O staging não possui chave de provedor de IA. A geração textual pelo modelo não foi executada e não recebeu credencial de produção. A proposta estruturada, a confirmação única, a autorização, a transação, a idempotência e a persistência foram exercitadas pelos endpoints reais. Para fechar a geração de ponta a ponta, configure uma chave própria e descartável no staging e execute uma rodada adicional sem sobrescrever este relatório.

## Preservação

As organizações MASTER A/B e o backup da prova permanecem no staging para inspeção. O clone do exercício já foi removido. Não rode `test:master:cleanup` antes do relatório final e do aceite do dono.
