# Plano integrado: qualidade estratégica e qualidade operacional do Oráculo

Data: 2026-07-16

Status: **em execução; Q4A-Q4E concluidas no staging; Q4F e a proxima fatia**

Plano anterior concluído: `plans/2026-07-12-hardening-confiabilidade-escala.md`

## 1. Objetivo

Este documento reúne em uma única sequência os dois trabalhos que faltam para liberar o Oráculo com confiança para os gestores:

1. **Mapa A — Qualidade estratégica:** provar que a IA conduz bem o gestor e que todas as entregas de conteúdo, começando pelo Plano Estratégico Anual, são coerentes, mensuráveis e executáveis.
2. **Mapa B — Qualidade operacional:** provar que o produto inteiro funciona de ponta a ponta no aplicativo e no WhatsApp, com dados reais controlados.

O hardening técnico das Etapas 0 a 7 já foi concluído e não será refeito. Integridade, segurança, RLS, idempotência, filas, backup, observabilidade e recuperação são a fundação deste plano e continuam como gates de regressão.

## 2. Resultado esperado

Ao final, o Oráculo deve demonstrar simultaneamente que:

- conduz uma conversa estratégica sem se perder entre empresa, área e período;
- produz primeiro um Plano Estratégico Anual com diagnóstico, escolhas, objetivos, metas, projetos e governança;
- desdobra explicitamente o anual em trimestral e o trimestral em mensal, sem inventar vínculo;
- entende o problema antes de propor o plano;
- usa históricos relevantes sem misturar documentos de outras áreas ou períodos;
- questiona objetivo repetido, meta fraca, excesso de prioridade e ausência de indicador;
- diferencia objetivo, resultado-chave, KPI, evidência e ação;
- gera planos anual, trimestral e mensal simples, porém suficientes para execução;
- produz revisões, fechamentos, memória, importações e sugestões com qualidade verificável;
- pede somente uma confirmação final para gravar;
- grava exatamente o que foi aprovado;
- preserva o mesmo contexto no app e no WhatsApp;
- produz documento, PDF, WhatsApp, Dashboard, revisão, auditoria, custo e backup coerentes;
- cobre cada rota e cada ritual com rubrica estratégica ou teste operacional explícito;
- permite que um gestor real use o fluxo sem treinamento complexo.

## 3. Os dois mapas

```text
Hardening técnico concluído
          |
          v
MAPA A — QUALIDADE ESTRATÉGICA
Q0 padrão/cobertura -> Q1 laboratório anual -> Q2 casos por entrega -> Q3 baseline
-> Q4 correções -> Q5 regressão -> Q6 aceite
          |
          | Gate estratégico aprovado
          v
MAPA B — QUALIDADE OPERACIONAL
O0 preflight -> O1 piloto web -> O2 dados/documento
-> O3 WhatsApp -> O4 mídia/memória -> O5 KPI/revisão
-> O6 fechamento owner -> O7 gestor real -> O8 aceite/rollout
```

Não iniciar o Mapa B antes da aprovação do gate Q6.

## 4. Regras obrigatórias de execução

### 4.1 Briefing antes de cada fatia

Antes de executar qualquer fatia, o agente deve apresentar ao owner:

1. o problema que a fatia resolve;
2. o que mudará no comportamento do Oráculo;
3. o que não mudará;
4. arquivos, banco, Functions e ambientes afetados;
5. dados que serão criados, alterados ou removidos;
6. custo estimado de IA e qualquer outro custo possível;
7. testes e critérios de aprovação;
8. rollback previsto.

Mudança funcional deve ser explicada em linguagem de negócio, com exemplo antes/depois. Não iniciar a implementação enquanto o owner não compreender qualquer alteração de comportamento relevante.

### 4.2 Regra financeira

- O owner autorizou até **US$ 20 acumulados** em APIs de IA do Oráculo para este plano.
- Registrar custo inicial e final por fatia usando `ai_usage_logs`.
- Avisar ao atingir US$ 15.
- Parar novas execuções pagas ao atingir US$ 19, preservando margem para uma chamada já iniciada.
- Nunca ultrapassar US$ 20 sem nova autorização explícita.
- Não existe teto isolado por caso ou fatia; cada chamada é autorizada pelo consumo acumulado do plano.
- Depois de cada execução, informar custo de geração, judge, total da execução e acumulado antes/depois.
- Essa autorização não cobre compra de créditos, assinatura, upgrade, recarga automática ou contratação de serviço.
- Toda compra ou nova cobrança exige autorização explícita imediatamente antes da confirmação.

### 4.3 Regra de ambientes e dados

- Mapa A usa staging, organização descartável e conteúdo sintético.
- Nunca copiar chave de produção para staging.
- A execução real de modelo exige chave própria e descartável no staging.
- Transcrições de avaliação ficam em `.agents-private/`, sanitizadas, com permissão `600` e fora do Git.
- Mapa B usa produção somente depois do gate estratégico e começa pela conta do owner.
- Nenhum convite ou mensagem para gestor real sem autorização específica do owner.

### 4.4 Regra de deploy

- Alteração somente em docs, testes ou scripts não recebe deploy do frontend.
- Edge Function só é publicada quando seu código ou dependência compartilhada mudou.
- Frontend só é publicado quando arquivos de runtime web mudaram.
- Agrupar correções relacionadas em uma publicação, evitando deploy por ajuste documental.
- Antes de publicar, informar o ambiente e o efeito; publicação não pode criar compra automática.

### 4.5 Autoridade humana

- A IA avaliadora orienta, mas não aprova sozinha.
- Regras determinísticas bloqueiam falhas objetivas.
- O owner ou revisor humano valida qualidade empresarial e naturalidade.
- Nenhum judge de IA pode gravar ou corrigir plano automaticamente.

### 4.6 Encerramento de cada fatia

Toda fatia deve terminar com:

- testes específicos verdes;
- `pnpm run lint` e `pnpm run build` quando houver mudança de código;
- unitários e integração proporcionais ao risco;
- secret scan quando houver artefato ou automação nova;
- relatório de resultado e limitações;
- documentação e handoff atualizados;
- commit e push;
- CI obrigatório verde;
- link do app informado, mesmo quando não houver deploy;
- status explícito: aprovada, reprovada ou bloqueada.

Se um gate falhar, parar. Não declarar sucesso parcial como conclusão e não avançar para a próxima fatia.

## 5. Referências e hierarquia de qualidade

O Oráculo utilizará uma combinação pragmática, sem obrigar o gestor a conhecer os métodos:

- **Balanced Scorecard:** conectar estratégia, objetivos, indicadores, metas e iniciativas.
  - Referência: <https://balancedscorecard.org/wp-content/uploads/2022/09/Essentials-Overview-Webinar-Final.pdf>
- **OKRs:** objetivo significativo e resultados específicos, temporais, mensuráveis e verificáveis.
  - Referência: <https://www.whatmatters.com/faqs/okr-meaning-definition-example>
  - Playbook: <https://www.whatmatters.com/resources/google-okr-playbook>
- **4DX:** poucos objetivos prioritários, medidas de direção e resultado, placar e cadência de responsabilização.
  - Referência: <https://ir.franklincovey.com/news-releases/news-release-details/simon-schuster-and-franklincovey-release-revised-and-updated-2nd/>

Essas referências formam critérios internos. A interface continua usando a linguagem simples do Oráculo: objetivo, meta/evidência, ações-chave, responsável, prazo, KPI, confiança e bloqueio.

A hierarquia obrigatória é:

1. Plano Estratégico Anual define diagnóstico, escolhas, objetivos, metas, projetos e rituais.
2. Plano Trimestral por Área explicita qual objetivo anual ajuda a avançar.
3. Plano Mensal explicita qual objetivo trimestral ajuda a executar.
4. Revisões e fechamentos usam evidência, registram aprendizado e decidem o destino das pendências.

Se não houver plano superior, o Oráculo pode continuar sem bloquear o gestor, mas deve marcar a entrega como provisória. Se a prioridade for emergente, registra exceção justificada. Nunca cria vínculo falso apenas para completar o formulário.

## 6. Rubrica oficial de qualidade

### 6.1 Rubricas de 100 pontos

1. `RUBRIC-CONDUCTION`: condução estratégica e naturalidade.
2. `RUBRIC-ANNUAL-PLAN`: Plano Estratégico Anual.
3. `RUBRIC-QUARTERLY-PLAN`: desdobramento trimestral.
4. `RUBRIC-MONTHLY-PLAN`: execução mensal.
5. `RUBRIC-REVIEW-CLOSE`: revisão estratégica e fechamentos mensal/trimestral.
6. `RUBRIC-INFORMATION-QUALITY`: memória, importações, arquivos e sugestões.
7. `RUBRIC-DERIVED-OUTPUT`: documentos, PDF, WhatsApp, Dashboard e auditoria visualizada.

Os pesos, evidências e IDs completos estão em `docs/STRATEGIC_QUALITY_STANDARD.md` e `tests/evals/strategic-quality/rubric.json`.

### 6.2 Aplicação

- sessão com conversa: condução + rubrica principal da entrega;
- documento, PDF, Dashboard ou outra saída derivada: rubrica de saída, com checks determinísticos prioritários;
- autenticação, permissões, configurações, backup e administração: RLS, segurança, integração, E2E e QA visual, sem judge artificial;
- todas as rubricas aplicáveis precisam passar; uma média boa não esconde falha em uma entrega.

### 6.3 Faixas

- 90 a 100: excelente;
- 80 a 89: aprovado;
- 70 a 79: revisar antes de gravar;
- abaixo de 70: reprovado.

Cada rubrica aplicável precisa atingir **80 pontos**. A média aplicável mínima para o gate final é **85 pontos**.

### 6.4 Falhas críticas

Qualquer item abaixo reprova o caso, independentemente da nota:

- empresa, área, pessoa ou período incorreto;
- mudança indevida entre plano anual, trimestral e mensal;
- documento histórico de outra área apresentado como referência principal;
- número, responsável, KPI ou decisão inventada;
- entrega inferior sem ligação com o nível superior quando existe origem aplicável;
- meta sem forma verificável de conclusão;
- atividade aceita como objetivo sem resultado esperado;
- gravação antes da confirmação;
- mais de uma confirmação final para a mesma proposta;
- divergência entre conversa, banco e saída canônica;
- mutação feita pelo judge de qualidade.
- revisão ou fechamento alterando conteúdo fora do limite permitido;
- conflito de importação sobrescrito sem escolha do usuário;
- KPI, período, unidade ou cálculo materialmente incorreto;
- app e WhatsApp divergindo materialmente;
- persistência indevida de bruto, segredo ou URL temporária.

### 6.5 Matriz de cobertura

`tests/evals/strategic-quality/deliverable-coverage.json` classifica 21 entregas. Ela cobre todas as rotas de `src/App.tsx`, os seis tipos de sessão do motor e os fluxos administrativos relevantes. O CI compara código e matriz para impedir nova tela ou ritual sem método de qualidade, gate e fase definidos.

## 7. MAPA A — Qualidade estratégica

## Q0 — Padrão, governança e linha de partida

### Resumo funcional

Formaliza o que significa boa condução e boa entrega em todo o produto. Não altera o comportamento do Oráculo e não chama IA paga.

### Trabalho

1. Versionar sete rubricas para condução, anual, trimestral, mensal, revisões, informação e saídas derivadas.
2. Colocar o Plano Estratégico Anual como primeira entrega avaliada.
3. Definir IDs estáveis para critérios e falhas críticas.
4. Criar ficha de revisão humana com rubricas aplicáveis por caso.
5. Inventariar todas as entregas, rotas e rituais em matriz legível por máquina.
6. Definir como medir custo por caso e priorizar checks determinísticos.
7. Registrar a versão atual dos prompts, modelos e condutores como baseline.

### Testes

- soma dos pesos igual a 100 em cada uma das sete rubricas;
- critérios sem duplicidade;
- cada falha crítica mapeada para checagem determinística ou revisão humana;
- todas as rotas e todos os tipos de sessão cobertos pela matriz;
- nenhum dado real ou segredo no material de avaliação.

### Gate Q0

Owner compreende e aprova rubricas, ordem anual -> trimestral -> mensal, matriz de cobertura, faixas, falhas críticas e limite financeiro.

Estado em 2026-07-16: a Q0 original foi aprovada, mas cobria principalmente condução e plano trimestral. A revisão Q0 R2 foi criada após o owner exigir que o anual seja a primeira entrega e que todo o app tenha método de qualidade. O owner aprovou seguir com a R2 e removeu o teto isolado de US$ 1 da Q1, mantendo orçamento acumulado de US$ 20, aviso em US$ 15 e parada preventiva em US$ 19. Gate Q0 R2 aprovado.

### Rollback

Somente documentação: reverter a versão ainda não usada, sem efeito em dados.

## Q1 — Laboratório e executor de avaliações

### Resumo funcional

Cria um ambiente repetível para conversar com o Oráculo, capturar resultado e avaliar sem gravar dados reais. Não muda ainda a experiência do usuário.

### Trabalho

1. Criar organização descartável no staging.
2. Configurar chave de IA própria e descartável no staging, sem copiar produção.
3. Criar estrutura versionada de casos, por exemplo `tests/evals/cases/`.
4. Criar schema para entrada, contexto esperado, ações permitidas e resultado esperado.
5. Criar runner que execute web e WhatsApp sintético pelo mesmo núcleo de sessão.
6. Capturar transcrição sanitizada, proposta e documento em `.agents-private/`.
7. Implementar checagens determinísticas de área, período, campos, gravação e confirmação.
8. Implementar judge separado em modo somente leitura, preferencialmente com modelo diferente do condutor.
9. Registrar tokens, custo, latência e versão de prompt/modelo por execução.
10. Impedir que o runner aponte para a referência de produção.

### Testes

- recusa produção;
- não persiste segredo, documento bruto nem conteúdo sensível;
- judge não possui endpoint de mutação;
- mesma entrada e versão produzem relatório comparável;
- falha ou timeout do judge não altera o plano nem transforma reprovação em aprovação;
- custo interrompe novos casos antes do teto.

### Gate Q1

Um caso mínimo **anual** percorre condutor, proposta, checagem e relatório no staging, sem tocar produção.

Estado em 2026-07-16: a primeira execução revelou confirmações repetidas, perda de baseline, memória superficial e inferências tratadas como fatos. O contrato anual foi corrigido no staging sem migration: uma confirmação final, avanço adaptativo, baseline/fonte/prazo/estratégias, renúncias, riscos confirmados, decisões pendentes e aprendizado histórico literal passam por proposal, banco e documento. A Q1 final aprovou todos os checks, Condução 86,25, Plano Anual 92,50, média 89,38 e zero candidato crítico. Rodada final US$ 0,081603; acumulado naquele gate US$ 0,428801; cleanup verde. Antes de produção, a Revisão Estratégica também foi alinhada: vários microajustes completos em uma mensagem, apenas lacunas bloqueantes, rótulos naturais e uma confirmação final, sem sair dos cinco campos permitidos. Teste real em staging aprovou proposta/banco/documento/cleanup; duas rodadas custaram US$ 0,008976 e elevaram o acumulado para US$ 0,437777. O owner aprovou e a produção foi concluída em `43b5935`: release protegido `29525599601`, Netlify `6a5928c0f349e3bcc2a4728a`, verificação e smoke verdes. A chave temporária foi mantida para novos testes autorizados. Próxima fatia: Q2.

### Rollback

Remover organização, usuários e chave descartáveis; preservar relatório sanitizado.

## Q2 — Casos de referência para todas as entregas

Criar um catálogo por risco. Conteúdo estratégico recebe casos e revisão humana; saídas derivadas recebem fixtures e comparação determinística; administração fica ligada aos cenários do Mapa B. A primeira execução de conteúdo é sempre anual.

### Q2A — Plano Estratégico Anual primeiro

Criar no mínimo cinco casos anuais:

1. **Aspiração vaga:** “queremos crescer”; investigar situação atual, escolha estratégica, indicador e renúncia.
2. **Lista sem prioridade:** dez frentes para o ano; ajudar a escolher quatro a seis objetivos e cinco a sete projetos no máximo.
3. **Atividade como estratégia:** “implantar um sistema”; transformar em resultado empresarial, adoção, métrica e prazo.
4. **Meta repetida:** histórico mostra o mesmo objetivo em anos anteriores; perguntar causa, avanço parcial e o que muda agora.
5. **Owner experiente:** direcionadores, objetivos e números já estão claros; validar lacunas sem repetir entrevista completa.

Cada caso anual precisa avaliar diagnóstico, propósito/visão/valores, SWOT, tema, escolhas/renúncias, objetivos, metas, projetos vinculados, riscos e rituais. Reprovar se abrir plano trimestral, inventar número, aceitar todas as prioridades ou produzir proposta sem uma única confirmação final.

### Q2B — Desdobramento Trimestral

Manter no mínimo oito casos trimestrais independentes, sempre com contexto anual explícito ou ausência proposital declarada:

#### Caso 1 — Problema vago

- Entrada: “precisamos melhorar o Comercial”.
- Esperado: investigar situação atual, impacto e mudança desejada.
- Reprovar se: transformar imediatamente em objetivo genérico.

#### Caso 2 — Atividade disfarçada de objetivo

- Entrada: “implantar um CRM”.
- Esperado: perguntar qual resultado empresarial o CRM precisa produzir.
- Reprovar se: aceitar instalação como sucesso final sem adoção ou resultado.

#### Caso 3 — Área equivalente

- Cadastro: Produção; histórico: Industrial.
- Esperado: reconhecer equivalência quando o contexto for único e seguro.
- Reprovar se: trocar de área, inventar nova área ou abandonar o contexto.

#### Caso 4 — Objetivo recorrente

- Histórico: mesma meta repetida em ciclos anteriores sem conclusão.
- Esperado: apontar repetição, perguntar causa e exigir mudança de abordagem.
- Reprovar se: copiar a meta silenciosamente.

#### Caso 5 — Meta sem baseline

- Entrada: “aumentar produtividade em 20%”.
- Esperado: perguntar produtividade atual, cálculo e fonte.
- Reprovar se: inventar baseline ou aceitar número sem medição.

#### Caso 6 — Excesso de prioridades

- Entrada: oito objetivos para o trimestre.
- Esperado: ajudar a priorizar de um a três resultados decisivos.
- Reprovar se: gerar uma lista extensa sem trade-off.

#### Caso 7 — KPI e efeito esperado

- Entrada: objetivo que pode afetar KPI existente.
- Esperado: explicar a hipótese e pedir confirmação antes de vincular.
- Reprovar se: gravar vínculo automaticamente ou sugerir KPI irrelevante.

#### Caso 8 — Gestor experiente

- Entrada: objetivo, meta, responsável e ações já claros.
- Esperado: validar lacunas e avançar sem interrogatório desnecessário.
- Reprovar se: repetir roteiro completo e burocratizar.

### Q2C — Execução Mensal

Criar no mínimo quatro casos:

1. mensal corretamente ligado a um objetivo trimestral;
2. pendência herdada com decisão de rolar, renegociar ou cortar;
3. lista de ações maior que a capacidade do mês;
4. gestor experiente com resultado, meta, dono e prazo já informados.

Reprovar se o plano mensal virar lista de tarefas sem resultado, perder a origem trimestral ou inventar prazo/evidência.

### Q2D — Revisões, Fechamentos e Conversa Operacional

Criar casos para:

1. fechamento mensal com objetivo parcial, evidência e aprendizado;
2. fechamento trimestral com decisão explícita sobre o que ficou aberto;
3. revisão estratégica limitada a métrica, meta, valor atual, prazo ou status;
4. atualização rápida ambígua que não pode gravar;
5. pulso semanal natural, configurável e deduplicado.

Reprovar se maquiar resultado, repetir perguntas já respondidas, abrir outro nível de plano ou alterar conteúdo fora do limite do ritual.

### Q2E — Informação e Saídas Derivadas

Usar fixtures controladas para cobrir:

1. importação de plano/histórico com título, tipo, área e período extraídos do conteúdo;
2. planilha e imagem de KPI com conflito entre fontes e escolha do usuário;
3. memória relevante concorrendo com documento irrelevante de outra área;
4. igualdade entre proposta, banco, documento, PDF e resumo WhatsApp;
5. Dashboard com mês, cálculo, unidade, abreviação e casas decimais corretos;
6. arquivo, auditoria, versão e origem rastreáveis;
7. responsividade, acessibilidade e estado de erro nas rotas cobertas.

Esses casos priorizam checks determinísticos, fixtures e QA visual. Judge pago só entra quando relevância, naturalidade ou julgamento estratégico não puderem ser medidos objetivamente.

### Artefatos por caso

- contexto inicial;
- histórico disponível e histórico irrelevante concorrente;
- transcrição esperada por intenção, não texto literal;
- plano mínimo esperado;
- perguntas obrigatórias e proibidas;
- falhas críticas específicas;
- nota humana de referência.

### Gate Q2

Owner revisa os blocos Q2A-Q2E e confirma que representam situações reais. A matriz precisa permanecer com todas as rotas e os seis rituais cobertos. Nenhum caso pode ser removido apenas para melhorar nota ou reduzir custo; para preservar o teto, checks determinísticos substituem IA onde forem suficientes.

Estado em 2026-07-16: catalogo `2026-07-16.q2` implementado com 29 casos (Q2A=5, Q2B=8, Q2C=4, Q2D=5, Q2E=7), 15 entregas e todas as 16 falhas criticas cobertas. Manifesto, cinco blocos JSON, verificador e oito testes especificos passaram sem rede, dados ou IA; custo US$ 0. O owner aprovou o catalogo e o manifesto passou a `owner-approved`. Proxima etapa: apresentar o briefing Q3 e obter autorizacao explicita antes do baseline pago.

## Q3 — Baseline da versão atual

### Resumo funcional

Mede o Oráculo como ele está hoje. Não corrigir durante a execução e não selecionar apenas respostas boas.

### Trabalho

1. Registrar custo inicial do ciclo.
2. Executar duas vezes os casos generativos de risco alto; casos determinísticos rodam uma vez por versão com fixtures estáveis.
3. Usar os modelos atualmente configurados para suas funções equivalentes.
4. Rodar checagens determinísticas.
5. Rodar judge somente leitura.
6. Fazer revisão humana cega de amostra representativa.
7. Calcular notas das rubricas aplicáveis, falhas críticas, latência e custo.
8. Classificar defeitos por causa: prompt, memória, roteamento, estado, validação ou renderização.
9. Publicar relatório baseline sem esconder resultados ruins.

### Gate Q3

Relatório completo, custo dentro do teto e lista priorizada de falhas. Nenhuma mudança funcional nesta fatia.

Estado em 2026-07-17: baseline `2026-07-16.q3-baseline-r2` preservada. Q4A-Q4E foram concluidas no staging. A Q4D corrigiu naturalidade e os fechamentos; a Q4E passou a preservar origem/versao/rastreabilidade e comprovou igualdade material entre proposta, banco, documento, tela, PDF e WhatsApp. O smoke Q4E comparou 18 fatos materiais, sem mutacao de renderizacao, chamada de IA ou residuo. Q4E custou US$ 0; acumulado permanece US$ 2,890842. Producao, Netlify e WhatsApp real permanecem anteriores. Proxima fatia: apresentar briefing Q4F antes da integracao completa.

## Q4 — Correções orientadas pela evidência

### Resumo funcional

Corrige apenas falhas demonstradas no baseline. Antes desta fatia, apresentar exemplos reais de antes/depois e explicar qualquer pergunta ou validação nova.

### Possíveis pontos de mudança

- `_shared/conductors/persona.ts`;
- condutores de plano anual, trimestral e mensal;
- `_shared/plan-context.ts`;
- `_shared/area-matching.ts`;
- estado de sessão e política de confirmação;
- schema de proposta e validadores server-side;
- renderização do documento canônico;
- textos do painel e WhatsApp somente quando necessários.

### Regras

- não adicionar pergunta só para aumentar completude aparente;
- adaptar profundidade ao que o gestor já informou;
- preferir desafio curto e específico;
- histórico entra como evidência, não como ordem;
- validação determinística protege área, período, campos e confirmação;
- manter proposta mais confirmação única;
- não transformar a rubrica inteira em formulário visível.

### Testes

- unitários por defeito corrigido;
- integração de sessão e proposta;
- memória com histórico relevante e irrelevante;
- app e WhatsApp com contexto equivalente;
- documento igual ao conteúdo aprovado;
- regressão técnica completa proporcional ao módulo afetado.

### Gate Q4

Todas as correções têm teste reproduzindo a falha original e briefing funcional aprovado.

Estado parcial: Q4A (motor adaptativo), Q4B (trimestral), Q4C (mensal), Q4D (naturalidade/fechamentos) e Q4E (saidas/rastreabilidade) estao aprovadas no staging. Q4F ainda nao foi iniciada; Q5 continua bloqueada ate o gate completo da Q4.

### Rollback

Reverter condutor/validador por versão; preservar baseline e relatórios para comparação.

## Q5 — Regressão estratégica comparativa

### Trabalho

1. Repetir exatamente os casos e entradas do Q3.
2. Manter versões e parâmetros registrados.
3. Comparar nota antes/depois por dimensão.
4. Confirmar que a melhora não veio de conversa muito mais longa.
5. Rodar revisão humana sem identificar versão antiga/nova.
6. Registrar custo total acumulado.

### Aprovação

- zero falha crítica;
- todas as rubricas aplicáveis >= 80 em todos os casos;
- média conjunta >= 85;
- nenhuma entrega da matriz sem resultado de qualidade;
- nenhuma dimensão piora mais de 5 pontos;
- mediana de turnos não aumenta mais de 25% sem justificativa humana;
- custo acumulado abaixo de US$ 20.

Se falhar, voltar ao Q4 somente para os defeitos comprovados e repetir Q5.

## Q6 — Aceite da qualidade estratégica

### Entregáveis

- rubrica final versionada;
- casos de referência;
- relatório baseline;
- relatório comparativo;
- custos e modelos utilizados;
- limitações conhecidas;
- aprovação humana do owner;
- decisão explícita de avançar ou não ao Mapa B.

Nenhum deploy adicional deve ser feito somente para publicar o relatório.

## 8. MAPA B — Qualidade operacional do software

## O0 — Preflight e checkpoint de recuperação

### Resumo funcional

Confirma que produção está pronta e cria ponto de segurança antes do piloto. Não cria plano.

### Trabalho

1. `git pull --rebase` e worktree limpo.
2. `pnpm run production:verify`.
3. Conferir Netlify, Supabase, Functions, migrations e headers.
4. Conferir crédito de deploy sem comprar nada.
5. Conferir backup protegido, RPO/RTO e réplica externa.
6. Criar backup manual pré-piloto, se o último snapshot não cobrir o início.
7. Conferir WhatsApp conectado, webhook, fila e dead-letter.
8. Conferir IA, modelos, chaves mascaradas, modo de custo e saldo mensal.
9. Registrar contagens de planos, documentos, KPIs e custo antes do piloto.

### Gate O0

Tudo verde e checkpoint recuperável. Qualquer `503`, alerta ativo, fila pendente ou backup sem proteção pausa o piloto.

## O1 — Piloto web com o owner

### Escopo inicial

- empresa: Gaam/Aize;
- área: Comercial;
- período: T3 2026;
- usuário: owner;
- objetivo anual de origem: reorganização da Área Comercial;
- nenhum contato com Diego nesta fatia.

### Trabalho

1. Abrir uma nova sessão de planejamento trimestral no app.
2. Informar o desafio real sem fornecer todos os campos de uma vez.
3. Observar se o Oráculo aplica a condução aprovada no Mapa A.
4. Construir um único objetivo prioritário.
5. Definir resultado, baseline, meta, evidência, responsável e prazo.
6. Definir poucas ações-chave com critério de conclusão.
7. Conferir o resumo.
8. Confirmar uma única vez.
9. Não corrigir diretamente no banco.

### Referência inicial, não resposta obrigatória

- resultado desejado: sistema de vendas em operação para gerar informação comercial confiável;
- adoção: distinguir “disponível” de “usado”;
- base: definir migrada, validada e atualizada;
- integração: definir prova de funcionamento com ERP;
- responsável provável: Diego, sujeito à confirmação na conversa;
- prazo: fim do T3;
- ações possíveis: migração, integração, treinamento e rotina de adoção.

O Oráculo deve chegar a um plano bom por condução; não deve simplesmente copiar esta referência.

### Gate O1

Condução e plano aprovados pela rubrica, proposta única e gravação única.

### Rollback

Se o conteúdo gravado divergir da confirmação, arquivar o registro pela trilha operacional e investigar. Não restaurar a empresa inteira por erro de um plano.

## O2 — Integridade do plano e documento

### Trabalho

1. Conferir área, período, origem anual e responsável no banco pela UI/API autorizada.
2. Conferir objetivo, metas/evidências e ações.
3. Conferir ausência de duplicidade.
4. Conferir `plan_documents` e renderização em tela.
5. Abrir impressão/PDF A4.
6. Comparar conversa, dados e documento canônico.
7. Conferir revisão/auditoria criada pelo marco.

### Gate O2

Conversa aprovada = banco = documento = PDF, sem diferença material.

## O3 — Continuidade pelo WhatsApp do owner

### Resumo funcional

Prova que o mesmo plano pode ser retomado naturalmente no WhatsApp sem misturar área ou iniciar plano anual.

### Trabalho

1. Enviar mensagem pelo número do owner.
2. Pedir resumo do plano Comercial T3.
3. Confirmar que memória relevante aparece sem colar histórico de outra área.
4. Perguntar status de uma ação.
5. Registrar uma atualização pequena, concreta e explicitamente direcionada.
6. Enviar mensagem curta ambígua e confirmar que não gera mutação.
7. Retomar após novo episódio e verificar continuidade sem repetir toda a entrevista.
8. Conferir fila, outbox, ordem e ausência de dead-letter.

### Gate O3

- plano, área e período corretos;
- resposta natural;
- uma mutação explícita e nenhuma mutação ambígua;
- banco e WhatsApp coerentes;
- custo registrado.

## O4 — Áudio, documento e memória

### Trabalho

1. Enviar áudio curto com atualização concreta.
2. Conferir transcrição e alvo antes da mutação quando necessário.
3. Enviar documento relacionado ao plano.
4. Conferir leitura real do conteúdo, sem inferir apenas pelo nome.
5. Enviar documento de outra área e confirmar que ele não contamina o plano Comercial.
6. Conferir que mídia bruta, URL temporária e chave de mídia não foram persistidas.

### Gate O4

Conteúdo compreendido, contexto preservado e fronteira de segurança respeitada.

## O5 — KPI, Dashboard e revisão

### Trabalho

1. Solicitar sugestão de KPI para o objetivo.
2. Conferir justificativa e pedir confirmação antes do vínculo.
3. Importar pequeno conjunto controlado de Meta/Atingido quando houver fonte real.
4. Conferir mês, unidade, casas decimais e histórico.
5. Fazer revisão mensal com confiança, bloqueio e compromisso seguinte.
6. Conferir Dashboard, área, documento e auditoria.

Não inventar KPI ou fechamento para completar o teste. Se o período real ainda não permite fechamento, validar fechamento completo em staging e fazer somente check-in em produção.

### Gate O5

KPI confirmado, valores corretos, revisão útil e nenhuma alteração silenciosa.

## O6 — Fechamento operacional do piloto do owner

### Trabalho

1. Gerar resumo final do que foi criado e alterado.
2. Exportar documento/PDF.
3. Conferir custo de IA antes/depois.
4. Conferir eventos de auditoria sanitizados.
5. Criar/verificar backup pós-piloto.
6. Comparar contagens e confirmar ausência de duplicação.
7. Registrar problemas de UX, burocracia e naturalidade.
8. Pontuar novamente todas as rubricas aplicáveis às entregas exercitadas.

### Gate O6

Owner aprova o piloto e autoriza explicitamente envolver um gestor real.

## O7 — Piloto com um gestor real

### Pré-condições

- owner escolhe nominalmente o gestor;
- owner autoriza convite/mensagem por WhatsApp;
- gestor recebe briefing curto sobre objetivo do teste e tratamento dos dados;
- plano/área do gestor definidos;
- não há disparo para outros coordenadores.

### Execução sugerida

1. Convidar por WhatsApp com link do app.
2. Confirmar acesso e área correta.
3. Gestor conduz um planejamento sem o agente responder por ele.
4. Observar somente erros, dúvidas, tempo, desistências e pedidos de ajuda.
5. Gestor revisa o plano e dá nota de utilidade, naturalidade e confiança.
6. Fazer uma atualização pelo WhatsApp.
7. Conferir dados, documento, Dashboard e custo.
8. Entrevista de 10 minutos: o que ajudou, cansou, confundiu ou faltou.

### Gate O7

- tarefa concluída sem intervenção estrutural;
- nenhuma falha crítica;
- todas as rubricas aplicáveis >= 80;
- nota do gestor >= 4/5 para utilidade e clareza;
- tempo e número de turnos considerados aceitáveis;
- owner aprova expansão.

## O8 — Aceite operacional e rollout gradual

### Entregáveis

- relatório do owner;
- relatório do gestor;
- comparação app/WhatsApp;
- qualidade da condução e de cada entrega exercitada;
- cobertura final da matriz, com resultado para as 21 entregas;
- incidentes e correções;
- custo total de IA;
- estado de filas, auditoria e backups;
- riscos residuais;
- decisão de rollout.

### Rollout

1. segundo gestor de área diferente;
2. pequeno grupo de coordenadores;
3. todos os gestores;
4. acompanhamento do primeiro ciclo trimestral completo.

Cada expansão exige que o grupo anterior permaneça sem falha crítica.

## 9. Ordem única de execução

| Ordem | Fatia | Tipo | Produção | IA paga | Gate |
| ---: | --- | --- | --- | --- | --- |
| 1 | Q0 | Padrão e cobertura R2 | Não | Não | Rubricas e matriz aprovadas |
| 2 | Q1 | Infra e caso anual mínimo | Não | Mínima | Runner anual seguro |
| 3 | Q2 | Casos Q2A-Q2E | Não | Não | Catálogo completo aprovado |
| 4 | Q3 | Baseline | Não | Sim | Relatório completo |
| 5 | Q4 | Correções | Conforme defeito | Somente testes | Falhas reproduzidas e corrigidas |
| 6 | Q5 | Regressão | Não | Sim | Notas e falhas críticas aprovadas |
| 7 | Q6 | Aceite estratégico | Não | Não | Owner autoriza Mapa B |
| 8 | O0 | Preflight | Somente leitura/backup | Não | Produção saudável |
| 9 | O1 | Plano web owner | Sim | Sim | Plano aprovado |
| 10 | O2 | Documento/dados | Leitura | Não | Consistência total |
| 11 | O3 | WhatsApp owner | Sim | Sim | Continuidade aprovada |
| 12 | O4 | Mídia/memória | Sim | Sim | Contexto e segurança |
| 13 | O5 | KPI/revisão | Sim controlado | Sim | Dashboard coerente |
| 14 | O6 | Fechamento owner | Sim | Mínima | Owner aprova gestor |
| 15 | O7 | Gestor real | Sim | Sim | Gestor e owner aprovam |
| 16 | O8 | Aceite/rollout | Não necessariamente | Não | Decisão final |

## 10. Matriz de rollback

| Fatia | Se falhar | O que preservar | O que nunca fazer |
| --- | --- | --- | --- |
| Q0 | Reverter somente a versão documental não aprovada | Discussão e decisão do owner | Alterar o app para compensar ambiguidade da rubrica |
| Q1 | Destruir organização, usuários e chave descartáveis | Relatório sanitizado e erro técnico | Copiar chave ou dado de produção |
| Q2 | Reverter fixture/caso incorreto | Versão anterior dos casos | Adaptar resultado esperado para fazer a IA passar |
| Q3 | Encerrar execução e registrar reprovação | Todas as saídas, notas e custos válidos | Corrigir no meio do baseline ou ocultar caso ruim |
| Q4 | Reverter commit e republicar somente runtime realmente afetado | Teste que reproduz a falha | Refatorar módulos sem relação ou remover proteção técnica |
| Q5 | Voltar ao Q4 com defeitos objetivos | Baseline e comparação completa | Trocar casos ou pesos depois de ver a nota |
| Q6 | Manter Mapa B bloqueado | Relatório e decisão humana | Aprovar somente pela média se houver falha crítica |
| O0 | Pausar piloto; manter backup criado | Diagnóstico sanitizado | Comprar serviço, ignorar alerta ou escrever plano |
| O1 | Arquivar somente registros novos inválidos pela trilha operacional | Conversa, proposta, revisão e backup | Restaurar a empresa inteira por erro localizado |
| O2 | Não alterar dados; abrir defeito de consistência | Documento e comparação | Editar banco manualmente para “bater” com a tela |
| O3 | Reverter atualização explícita via fluxo suportado e drenar filas antes de rollback de versão | Jobs, telemetria e mensagem sanitizada | Apagar fila em processamento ou injetar evento na conversa real |
| O4 | Arquivar evidência/documento incorreto; remover somente artefato persistido permitido | Diagnóstico técnico sem mídia bruta | Salvar arquivo, URL temporária ou chave de mídia para depurar |
| O5 | Corrigir lançamento pelo editor/revisão suportado e preservar histórico | Import backup, documento e auditoria | Sobrescrever valores silenciosamente ou restaurar toda a empresa |
| O6 | Manter rollout bloqueado | Relatório, custos e backups | Apagar evidência ruim antes da análise |
| O7 | Suspender o piloto; reverter apenas mudanças inválidas e revogar acesso somente com decisão do owner | Feedback e trilha do gestor | Contatar outro gestor ou ampliar rollout para compensar falha |
| O8 | Não expandir o grupo | Relatórios e riscos residuais | Declarar conclusão com gate pendente |

Rollback técnico de Function deve publicar a versão anterior conhecida e repetir `production:verify`. Rollback de frontend consome deploy e só pode ocorrer quando necessário; mudança documental nunca justifica publicação. Backup completo é recuperação de desastre, não mecanismo cotidiano para corrigir um único plano, KPI ou evidência.

## 11. Testes transversais

Em todas as fatias aplicáveis:

- cobertura explícita da entrega na matriz versionada;
- isolamento entre empresas;
- papel owner/admin/coordenador;
- área e período corretos;
- proposta e confirmação única;
- idempotência por reconfirmação/reenvio;
- equivalência entre app e WhatsApp;
- memória relevante e exclusão de memória irrelevante;
- documento canônico determinístico;
- custo e tokens registrados;
- nenhum segredo em logs/artefatos;
- backup e auditoria;
- desktop e mobile;
- latência e mensagens de erro compreensíveis.

## 12. Critério final de conclusão

Este plano só termina quando:

- Q0 a Q6 estiverem aprovados;
- O0 a O8 estiverem aprovados;
- não houver falha crítica aberta;
- todas as rubricas aplicáveis atingirem as notas mínimas;
- as 21 entregas da matriz tiverem método, evidência e resultado registrado;
- um gestor real concluir o fluxo e aprovar utilidade;
- app e WhatsApp demonstrarem o mesmo contexto e resultado;
- custo total estiver registrado e dentro da autorização;
- documentação, handoff, commit, push e CI estiverem verdes;
- o owner tomar decisão explícita sobre rollout.

## 13. Prompt para outra ferramenta de desenvolvimento

```text
Leia AGENTS.md e plans/2026-07-16-qualidade-estrategica-operacional.md.

Execute somente a próxima fatia pendente, respeitando rigorosamente a ordem Q0 R2 -> Q6 -> O0 -> O8. A primeira entrega de conteúdo avaliada deve ser o Plano Estratégico Anual.

Antes de alterar qualquer arquivo ou dado, apresente:
- resumo funcional em linguagem de negócio;
- comportamento antes/depois;
- arquivos, banco, Functions e ambientes afetados;
- dados criados/alterados/removidos;
- custo estimado e saldo autorizado;
- testes, gate e rollback.

Não avance sem autorização quando houver mudança funcional, produção, contato externo ou custo não coberto. Nunca faça compra, upgrade, assinatura ou recarga sem autorização explícita imediata do owner.

Mapa A usa staging e chave descartável própria; nunca copie chave de produção. Judge é somente leitura e não pode alterar plano. Mapa B só começa após Q6 aprovado.

Ao final da fatia, execute os testes previstos, lint/build quando aplicáveis, atualize documentação e handoff, faça commit/push e confirme CI verde. Não faça deploy Netlify para mudança apenas documental, de teste ou script. Pare e relate qualquer falha em vez de declarar conclusão.
```

## 14. Próxima ação

Apresentar o briefing da **Q4F — integração e aceite técnico**. Explicar a regressão completa, ambientes, dados descartáveis, custo estimado e rollback; obter autorização explícita antes de executar. Não iniciar Q5, Mapa B ou produção automaticamente.
