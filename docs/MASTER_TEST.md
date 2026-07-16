# Teste Mestre Final

## Estado atual

A preparação 7A, o cenário funcional 7B, os cenários de falha 7C e o aceite 7D foram concluídos em 2026-07-15. A limpeza autorizada foi concluída no staging em 2026-07-16. Até a 7C, produção permaneceu intocada. Na 7D, somente o frontend recebeu a correção responsiva autorizada; nenhum dado, migration, Edge Function ou WhatsApp real foi alterado.

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
pnpm run test:master:failures
```

Use `setup` somente quando não existir ciclo aberto:

```bash
pnpm run test:master:setup
```

Use `cleanup` apenas depois do relatório e aceite final da Etapa 7:

```bash
pnpm run test:master:cleanup
```

Os cinco comandos recusam a referência de produção. `setup` também recusa substituir um estado aberto, e uma falha parcial tenta limpar todos os recursos já criados. `functional` grava evidência incremental em `.agents-private/master-test-7b.json`; `failures` exige o mesmo ciclo 7A/7B, executa os cenários adversariais e grava `.agents-private/master-test-7c.json`. Depois de concluídos, os executores não repetem o ciclo nem sobrescrevem os relatórios.

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

## Evidências dos cenários de falha 7C

- evento do WhatsApp repetido dez vezes em concorrência gerou somente um job;
- provedor de IA em `503` e timeout foram simulados sem rede real, com chave fictícia redigida;
- Evolution em erro `500`, timeout e erro permanente percorreu retry, ordenação e dead-letter sanitizado;
- falha no último trecho da proposta fez rollback completo, e duas confirmações simultâneas gravaram uma vez;
- acesso cruzado A -> B foi negado, e owner/admin/coordenador respeitaram empresa e área;
- rajadas concorrentes, orçamento e alertas de IA respeitaram os modos `monitor`/`block` sem duplicar eventos;
- exceção do frontend apresentou recuperação e registrou somente telemetria sanitizada;
- indisponibilidade da cópia externa de backup falhou fechado, sem criar clone parcial;
- política `verify_jwt` das Functions administrativas permaneceu válida;
- verificação posterior do baseline passou 12/12 e confirmou o WhatsApp real inerte.

O executor concluiu 11 blocos técnicos, correspondentes aos dez cenários do plano, com 77 testes verdes e um skip opt-in esperado. A regressão ampliada passou com 241 unitários, 25 arquivos de integração, sete testes de segurança/RLS, fixtures, lint, build/orçamento, secret scan e `pnpm audit --prod` sem vulnerabilidades conhecidas. A evidência incremental está em `.agents-private/master-test-7c.json`, permissão `600`, ignorada pelo Git.

## Evidências do aceite 7D

- staging: 11 E2E verdes em desktop/mobile e um skip mobile de clone esperado;
- revisão de seis capturas sintéticas de Backups, Auditoria e Minha conta;
- correção responsiva validada geometricamente: launcher dentro do cabeçalho mobile e abas completas no desktop;
- 241 testes unitários, lint, build e bundle inicial de 134,5 KB gzip;
- CI obrigatório `29466259742` totalmente verde;
- frontend Netlify `6a5840ed256e52e9b9a918d1` publicado e verificado;
- produção autenticada e pública conferida sem escrita: 31 Functions, 54 migrations, CSP, cache e asset `index-DYyWnaBl.js` corretos;
- relatório consolidado em `docs/MASTER_TEST_REPORT.md` e evidência privada em `.agents-private/master-test-7d.json`.

O pacote está tecnicamente aprovado e encerrado. Após autorização explícita, a limpeza removeu as duas organizações, os cinco usuários, o backup interno e o arquivo 7A com credenciais descartáveis. A conferência independente retornou zero resíduos para organizações, usuários, registro de backup e objeto do Storage.

## Preservação

As organizações MASTER A/B, o backup da prova, o clone e os usuários descartáveis não existem mais. Preserve os relatórios privados sanitizados 7B/7C/7D e as capturas 7D. O arquivo 7A foi removido porque continha as credenciais e IDs necessários somente durante o ciclo aberto.
