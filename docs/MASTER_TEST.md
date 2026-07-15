# Teste Mestre Final

## Estado atual

A preparação 7A foi concluída no staging isolado em 2026-07-15. Nenhum dado, configuração, Function ou frontend de produção foi alterado.

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
```

Use `setup` somente quando não existir ciclo aberto:

```bash
pnpm run test:master:setup
```

Use `cleanup` apenas depois do relatório e aceite final da Etapa 7:

```bash
pnpm run test:master:cleanup
```

Os três comandos recusam a referência de produção. `setup` também recusa substituir um estado aberto, e uma falha parcial tenta limpar todos os recursos já criados.

## Evidências da preparação 7A

- preflight real da fábrica: 1/1 verde, com criação e limpeza confirmadas;
- baseline persistente: 12/12 verificações verdes;
- WhatsApp sintético: 8/8 integrações verdes, incluindo autenticação, deduplicação 10x, isolamento, payload mínimo e bloqueio de loop;
- suíte unitária após adicionar o roteiro: 52 arquivos e 239 testes verdes;
- lint TypeScript verde.

## Próxima fase

A 7B executa o cenário funcional completo usando exclusivamente esse baseline: login/MFA, papéis, importações, planejamento no app e WhatsApp sintético, revisão, KPIs, arquivo, auditoria e backup. Cada bloco deve registrar resultado e nunca usar a Gaam/Aize ou o número real.
