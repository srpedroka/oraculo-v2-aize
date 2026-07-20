# Plano especifico 3 - Calibracao pre-beta

Peso no plano geral: **10%**

Progresso especifico: **60%**

Contribuicao atual ao geral: **6,0%**

Status: **EM ANDAMENTO - UX-C3 executada; gate do owner pendente**

## Objetivo

Remover as friccoes essenciais antes de colocar os gestores no uso real, sem
transformar a calibracao em redesign ou expansao funcional.

## Etapas e pontos

| Fatia | Pontos | Estado | Gate |
| --- | ---: | --- | --- |
| UX-C0. Fundacao visual | 20 | Aprovada | Componentes-base verdes |
| UX-C1. Feedback e recuperacao | 20 | Aprovada | Erros/retry preservam trabalho |
| UX-C2. Contexto e caminho critico | 20 | Aprovada | Jornada compreensivel |
| UX-C3. Proposta e confirmacao | 20 | Em revisao | Uma confirmacao inequivoca |
| UX-C4. Mobile e acessibilidade | 20 | Nao iniciado | Desktop e dois celulares verdes |
| **Total** | **100** | **Em andamento** | **60%** |

## Limites

- sem nova pagina ou objeto de negocio;
- sem migration, salvo bug de seguranca aprovado separadamente;
- mesmas tarefas com menos esforco;
- staging e validacao visual antes da producao.

Fonte: secoes 9 e UX-C0/C4 do plano mestre.

## Evidencia UX-C0

- draft: `https://6a5d183bbe39944dbe344cf4--oraculo-v2-aize.netlify.app`;
- 528/528 testes unitarios, lint, build e bundle verdes;
- `verify:deploy` verde para o draft;
- desktop 1280 x 720 e celular 390 x 844 sem overflow;
- foco visivel de 2 px e controles essenciais sem corte;
- zero migration, Edge Function, dado, chamada de IA ou deploy de producao.

O owner aprovou o gate visual em 2026-07-19. A fatia soma 20 pontos neste plano
e 2 pontos no geral. Producao permanece inalterada ate gate de release
separado.

## Evidencia UX-C1

- relatorio: `plans/ddr/UX-C1-feedback-recuperacao.md`;
- draft: `https://6a5d5646cfcba581e404012f--oraculo-v2-aize.netlify.app`;
- 535/535 unitarios e 132 integracoes aprovadas, com 2 skips opcionais por flag;
- lint, build, bundle, secret scan e `verify:deploy` verdes;
- desktop 1280 x 720 e celulares 390 x 844 e 430 x 932 sem overflow;
- rascunhos preservados, retry seguro, erros humanos e duplo clique cobertos;
- zero migration, Function, dado, chamada paga de IA ou deploy de producao.

O owner aprovou o gate em 2026-07-19. A UX-C1 soma 20 pontos neste plano e 2
pontos no geral: o progresso passa para 40% neste plano e 39% no geral.

O release acumulado UX-C0/UX-C1 foi autorizado e concluido em 2026-07-20:

- PR #15 e CI #101 (`29730862290`) com os tres checks verdes;
- merge remoto `330190a`;
- deploy Netlify `6a5de9e76733af06c6887d56`;
- `production:verify` verde para 31 Functions e 54/54 migrations;
- smoke publico desktop/mobile e smoke autenticado das rotas criticas verdes;
- zero alteracao de backend, dado, WhatsApp ou consumo pago de IA.

A publicacao nao soma pontos adicionais.

## Evidencia UX-C2

- relatorio: `plans/ddr/UX-C2-caminho-gestor.md`;
- draft: `https://6a5dfa113c90387d0905fc6e--oraculo-v2-aize.netlify.app`;
- 541 unitarios, lint, build, bundle, secret scan e `production:verify` verdes;
- jornada autenticada e smoke publico aprovados em desktop e mobile;
- caminho Dashboard -> Plano anual -> Plano trimestral -> Documentos mais
  explicito, sem nova pagina, permissao, dado ou regra de negocio;
- zero migration, Function, WhatsApp, IA paga ou alteracao de producao.

O owner aprovou o gate em 2026-07-20. O progresso oficial passa para 60% neste
plano e 41% no geral. A UX-C3 recebe briefing antes de qualquer alteracao na
interacao, e sua execucao continua sujeita a autorizacao separada.

## Evidencia UX-C3

- relatorio: `plans/ddr/UX-C3-proposta-confirmacao.md`;
- draft: `https://6a5e2b72df0f2fded70554e3--oraculo-v2-aize.netlify.app`;
- Function `oracle-session` publicada somente no staging;
- 554 unitarios, 132 integracoes aprovadas e 2 skips opt-in esperados;
- jornada autenticada e inspecao visual desktop/mobile verdes;
- verificacao estrutural e smoke publico do draft desktop/mobile verdes;
- app e WhatsApp devolvem o mesmo documento em confirmacao repetida sem nova
  mutacao;
- zero migration, dado permanente, IA paga ou alteracao de producao.

O gate do owner esta pendente. Por isso o progresso oficial continua em 60%
neste plano e 41% no geral. Se aprovada, a UX-C3 leva o Plano 3 a 80% e o geral
a 43%; producao continuara dependendo de autorizacao separada.
