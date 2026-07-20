# DDR UX-C4 - Mobile e acessibilidade

Data: 2026-07-20

Status: **APROVADA PELO OWNER**

Progresso aprovado: **Plano geral 45% | Plano 3 100%**

## 1. Resumo funcional

A UX-C4 preserva as tarefas e regras existentes e torna o caminho critico
operavel em desktop e celular com teclado, toque e leitor de tela:

1. dialogs prendem o foco somente na camada ativa e devolvem o foco a origem;
2. `Esc` fecha a camada superior quando a operacao nao esta em andamento;
3. dialogs usam a altura util dinamica do aparelho e rolagem interna;
4. menu mobile e painel do Oraculo respeitam viewport e areas seguras;
5. o compositor do Oraculo continua visivel com altura reduzida pelo teclado;
6. botoes principais e controles de toque chegam a 44 px;
7. cores de texto normal atendem contraste WCAG AA;
8. grafico decorativo, arquivo invisivel e regioes rolaveis possuem semantica
   coerente para teclado e tecnologia assistiva.

## 2. O que mudou

- hook compartilhado `useModalAccessibility`, com pilha para dialogs aninhados;
- `Card` aceita `ref` sem mudar sua API visual;
- menu mobile usa foco inicial, `Esc`, retorno ao acionador e `100dvh`;
- dialogs criticos de conta, area, membro, arquivo, objetivo, KPI, empresa e
  historico usam o mesmo contrato de foco e altura;
- painel do Oraculo restaura foco no launcher, aceita `Esc`, respeita safe area
  e mantem o envio acessivel em altura reduzida;
- tokens `text-secondary` e `text-tertiary` foram escurecidos somente o
  necessario para contraste AA;
- o donut do Dashboard continua visual, enquanto o resumo textual permanece a
  fonte acessivel do estado;
- a jornada E2E mede 1280x720, 390x844, 430x932 e 430x520.

## 3. O que nao mudou

- nenhuma funcao de negocio, permissao, ritual ou confirmacao;
- nenhuma migration, tabela, RLS ou Edge Function;
- nenhum prompt, modelo, WhatsApp, custo de IA ou dado de producao;
- producao permanece no release UX-C0/UX-C1;
- o draft usa o backend existente sem gravacao permanente de teste.

## 4. Evidencias

- branch local: `codex/ux-c4-mobile-accessibility`;
- draft Netlify:
  `https://6a5e39c470f0f2420ba96122--oraculo-v2-aize.netlify.app`;
- deploy Netlify: `6a5e39c470f0f2420ba96122`;
- 556/556 testes unitarios;
- 132 testes de integracao aprovados e 2 skips opt-in esperados;
- 6 jornadas autenticadas desktop/mobile, com dados descartaveis removidos;
- 2 smokes publicos de acesso, desktop e mobile;
- Axe sem violacao critica ou seria nas telas e estados medidos;
- inspecao visual de Dashboard, Oraculo, plano e dialog critico sem corte ou
  sobreposicao incoerente;
- lint e build verdes; bundle inicial de 135,1 KB gzip, abaixo de 200 KB;
- secret scan: 577 arquivos e zero segredo de alta confianca;
- `production:verify` do draft verde: 31 Functions, 54/54 migrations, HTTP 200,
  CSP, cache e segredos fora do Git.

## 5. Custo, risco e retorno

- custo de IA/API: **US$ 0**;
- compra, credito ou nova cobranca: nenhuma;
- risco: somente frontend, concentrado em foco, dimensoes e semantica;
- rollback: remover o draft e reverter o commit local; producao nao precisa de
  rollback porque nao foi alterada.

## 6. Gate do owner

No draft, o owner deve confirmar se:

1. Dashboard e navegacao continuam confortaveis no celular;
2. o menu abre e fecha sem perder o ponto de origem;
3. o Oraculo cabe na tela e mantem o campo de mensagem e envio visiveis;
4. propostas longas rolam sem esconder a confirmacao;
5. dialogs ficam centralizados e suas acoes permanecem alcançaveis;
6. o contraste ficou mais legivel sem pesar o cockpit.

O owner aprovou a UX-C4 em 2026-07-20. A fatia soma 20 pontos ao Plano 3 e 2
pontos ao plano geral: Plano 3 passa a 100% e o geral a 45%. O aceite encerra a
Calibracao pre-beta, mas nao autoriza producao. O release continua dependendo
de autorizacao separada.
