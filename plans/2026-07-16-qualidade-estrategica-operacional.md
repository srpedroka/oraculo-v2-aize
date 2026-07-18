# Plano integrado: qualidade estratégica e qualidade operacional do Oráculo

Data: 2026-07-16

Status: **em execucao; regressao limpa r22 com Q5A 10/10, Q5B 16/16 e Q5C em retomada incremental apos Q4AL**

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

Estado em 2026-07-17: baseline `2026-07-16.q3-baseline-r2` preservada e Q4A-Q4F concluidas no staging. O gate integrado passou 350 unitarios, 122 integracoes, 7 testes de seguranca, 11 E2E desktop/mobile, fixtures, catalogo, igualdade das saidas, lint/build/bundle e secret scan. Auditoria final confirmou zero residuo; custo Q4F US$ 0 e acumulado US$ 2,890842. A Q5 foi autorizada depois desse briefing e bloqueou na Q5A; os detalhes estao na propria secao Q5.

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

Estado final: Q4A-Q4F aprovadas no staging. O aceite tecnico esta em `docs/STRATEGIC_QUALITY_ACCEPTANCE_Q4.md`; Q5 continua bloqueada ate briefing de custo e autorizacao explicita.

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

Estado em 2026-07-17: o preflight e a matriz determinista passaram, mas a Q5 foi interrompida no segundo caso pago. A primeira rodada entregou Plano Anual 96,25 e Conducao 57,50, abaixo do minimo 80 por diagnostico generico e falta de desafio. A segunda rodada falhou em `oracle-session` com `400/INTERNAL_ERROR` depois de receber os fatos completos. Cleanup e preflight final confirmaram zero residuo. Custo Q5 US$ 0,062662; acumulado US$ 2,953504. Producao nao mudou. O retorno ao Q4 deve corrigir somente conducao anual vaga e classificacao/tratamento seguro da falha interna; Q5, Q6 e Mapa B permanecem bloqueados. Relatorio: `docs/STRATEGIC_QUALITY_REGRESSION_Q5.md`.

Correcao Q4G aprovada em 2026-07-17: a abertura vaga ficou contextual, o retry passou a ser unico por requisicao e propostas completas deixam de ser regeneradas por defeito apenas de envelope. O smoke final repetiu o mesmo caso anual e passou com Conducao 85, Plano Anual 100, media 92,50, confirmacao 1/1, zero gravacao prematura e cleanup. Q4G total US$ 0,100148; acumulado US$ 3,053653. A Q5 ainda nao foi reiniciada: as tentativas anteriores devem ser preservadas/arquivadas e o ciclo completo exige briefing e nova autorizacao paga.

Estado apos Q4H/Q5A em 2026-07-17: os cinco riscos anuais passaram no smoke Q4H. A regressao foi reiniciada como `2026-07-17.q5-regression-r3`, preservando as tentativas anteriores como calibracao, e concluiu 10/10 rodadas Q5A. Plano Anual 99,75, Conducao 94,13, Saida Derivada 100, media conjunta 97,96; zero erro tecnico, falha critica ou check reprovado. Um falso positivo do judge sobre o ano canonico da sessao foi reavaliado somente leitura com auditoria preservada. Q5A total US$ 0,504286; acumulado US$ 4,544644. Q5B ainda nao foi iniciada e continua sendo o proximo gate pago separado.

Bloqueio Q5B em 2026-07-17: a primeira rodada trimestral vaga entregou Plano Trimestral 92,50, Conducao 75 e media 83,75, sem falha critica e com dez checks deterministas verdes. O defeito comprovado e o menu generico prematuro antes de investigar dor, causa e impacto, alem de cadencia vazia apesar de acompanhamento semanal explicito. A execucao foi interrompida porque o runner ainda tratava apenas erro tecnico como fail-fast; uma fixture sintetica iniciada na rodada seguinte foi removida e o preflight confirmou staging limpo. Custo confirmado US$ 0,033476; acumulado US$ 4,578120, com eventual custo parcial da chamada abortada verificavel somente no provedor. Voltar ao Q4 para correcao focada e briefing antes de nova chamada paga.

Estado apos Q4I em 2026-07-17: a conversa trimestral vaga passou a investigar situacao, causa, impacto e mudanca desejada antes de campos operacionais ou alinhamento anual. Cadencia explicita e preservada apenas quando existe acao de acompanhamento mais frequencia, sem inferir rotina de mencoes ambiguas. O runner agora encerra a fase em erro tecnico ou qualidade bloqueada, sempre depois de persistir relatorio, custo e cleanup. O smoke exato passou com Conducao 96,25, Plano Trimestral 97,50, media 96,88, zero falha critica e dez checks verdes. Custo US$ 0,034506; acumulado US$ 4,612626. A Q5B foi reiniciada como `2026-07-17.q5-regression-r4`, preservando Q5A, matriz deterministica e a medicao bloqueada para auditoria. Somente `oracle-session` de staging mudou; producao segue intocada.

Bloqueio tecnico Q5B r4 em 2026-07-17: tres medicoes passaram e a quarta foi interrompida somente na gravacao, embora Conducao 86,25 e Plano Trimestral 90 estivessem acima do gate e sem falha critica. A proposta vinculou o objetivo estrategico existente, mas omitiu a copia redundante em `annualObjectives`; o aplicador nao reutilizou o `main_annual_objective_id` ja salvo para a mesma area e ano. O fail-fast encerrou antes da quinta chamada e o preflight confirmou staging limpo. Custo da tentativa US$ 0,153962; acumulado US$ 4,766588. Voltar ao Q4 para uma correcao tecnica focada e smoke isolado, sem mudar a conversa nem repetir Q5B automaticamente.

Estado Q4J em 2026-07-17: o fallback canonico passou 382 unitarios e 7/7 integracoes no endpoint real, incluindo recusa entre areas/empresas. O smoke provou que a gravacao agora funciona e deu Plano Trimestral 95, mas bloqueou por Conducao 65 e media 80: a abertura `implantar um CRM` recebeu menu generico em vez de desafio pelo resultado empresarial. Sem falha critica ou check reprovado; custo US$ 0,035877; acumulado US$ 4,802465; cleanup limpo. Nao houve segunda chamada nem reinicio Q5B. A proxima correcao deve atuar apenas na conducao deterministica de atividade trimestral.

Estado apos Q4K em 2026-07-17: atividades trimestrais curtas agora sao reenquadradas deterministicamente pelo resultado empresarial, adocao ou mudanca mensuravel, sem etapa adicional. O smoke CRM passou com Conducao 81,25, Plano Trimestral 93,75, media 87,50, zero falha critica/check/residuo. Custo US$ 0,049289; acumulado US$ 4,851754. As quatro medicoes Q5B r4 foram arquivadas e a fase abriu como `2026-07-17.q5-regression-r6`, preservando 10 Q5A e 9 deterministas; Q5B oficial esta zerada. Somente staging mudou.

Bloqueio Q5B r6 em 2026-07-17: sete de oito medicoes passaram. Meta repetida R2 bloqueou com Conducao 75, Plano Trimestral 88,75 e media 81,88, sem falha critica/check/erro tecnico. Depois de receber ciclos 11% e 9%, causa e nova abordagem, o Oraculo perguntou novamente indicador e baseline e fechou com resumo generico. O fail-fast impediu a nona chamada; cleanup limpo. Custo parcial US$ 0,300678; acumulado US$ 5,152432. Voltar ao Q4 para correcao focada em memoria/aprendizado de meta recorrente, sem repetir Q5B automaticamente.

Estado apos Q4L em 2026-07-17: meta recorrente agora exige reconhecer a memoria, absorver trajetoria/causa/nova abordagem e perguntar somente pela evidencia que prova o aprendizado; indicador e baseline confirmados nao sao reentrevistados. A sintese trimestral explicita resultado, medida, fonte, dono, acoes, foco e cadencia sem duplicacao e com uma confirmacao. O primeiro smoke bloqueou Conducao 77,50 e revelou memoria numerica/resumo ainda fracos; a rodada final passou Conducao 100, Plano Trimestral 96,25 e media 98,13. Custo Q4L US$ 0,089799; acumulado US$ 5,242231. As oito medicoes r6 foram preservadas e a Q5B abriu limpa como `2026-07-17.q5-regression-r7`.

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

### Atualizacao de execucao: Q5 incremental, regressao limpa e Q4Z

- A rodada incremental Q5A-Q5D terminou com 40/40 medicoes generativas verdes.
- A primeira regressao geral limpa passou a matriz deterministica 8/8 e repetiu oito medicoes anuais antes de bloquear no gestor anual experiente R1.
- A causa foi uma proposta anual vazia e no ano errado diante de uma mensagem que anunciava, mas nao fornecia, quatro objetivos e quatro projetos.
- A Q4Z exige ano correto e objetivos verificaveis; sem o bloco concreto, mantem a sessao aberta e nao gera proposta nem gravacao.
- O smoke focal Q4Z passou com Conducao 90, Plano Anual 100, Saida Derivada 100 e media 96,67.
- Custo Q4Z US$ 0,057392; acumulado do plano US$ 8,412568 de US$ 20.
- Proxima execucao: arquivar a tentativa parcial, zerar a grade e repetir deterministas + Q5A + Q5B + Q5C + Q5D integralmente.
- Regra permanente: nova falha interrompe a grade; corrige-se e testa-se somente o afetado; depois toda a regressao limpa recomeca. A Q5 so encerra com todos os cenarios aprovados na mesma rodada limpa.

### Atualizacao de execucao: Q4AA

- A regressao limpa apos Q4Z passou deterministas, Q5A 10/10 e dez medicoes Q5B antes de bloquear na confirmacao da prioridade trimestral R1.
- O modelo confundiu o id do objetivo anual da area com o id estrategico; a barreira de isolamento recusou a gravacao e o fail-fast funcionou.
- Q4AA rotula os IDs e converte somente o objetivo anual ativo da mesma empresa e area para seu pai estrategico. Referencias externas continuam bloqueadas.
- O primeiro smoke ficou tecnicamente verde, mas revelou conducao generica. O confronto agora usa a memoria de excesso, limita a tres resultados e pede o backlog em uma unica pergunta.
- Smoke final: Conducao 100, Plano Trimestral 97,50, media 98,75; US$ 0,035514. Duas tentativas Q4AA: US$ 0,076966. Acumulado: US$ 9,532934.
- Proxima execucao: `restart-clean-after-correction Q4AA`, deterministica e Q5A-Q5D completas desde zero.

### Atualizacao de execucao: Q4AB

- A regressao limpa apos Q4AA passou a matriz deterministica e seis medicoes Q5A antes de a meta anual recorrente R1 bloquear por ano historico nao dito pelo gestor.
- A Q4AB restringe a normalizacao a aprendizados historicos do plano anual: preserva anos da conversa e usa periodo relativo quando o numero veio somente do metadado do contexto.
- Smoke focado: Conducao 100, Plano Anual 100, media 100; US$ 0,046061; acumulado US$ 9,918158.
- O falso negativo do harness sobre `plano anterior` foi corrigido e revalidado sem nova chamada paga. Validacao: 454 unitarios, 29/29 catalogo, lint, build/bundle e secret scan 509.
- Proxima execucao: `restart-clean-after-correction Q4AB`, deterministica e Q5A-Q5D completas desde zero.

### Atualizacao de execucao: Q4AC

- A regressao limpa apos Q4AB passou a matriz deterministica e quatro medicoes Q5A antes de atividade anual R1 bloquear com Conducao 71,25 e Plano Anual 100.
- A Q4AC reconhece implantacao de sistemas, softwares, ERPs, CRMs, ferramentas e plataformas como meios e exige uma pergunta real sobre mudanca empresarial, nao um menu generico de campos.
- Smoke focado: Conducao 100, Plano Anual 100, media 100; US$ 0,057000; acumulado US$ 10,209470.
- Validacao: 457 unitarios, 29/29 catalogo, lint, build/bundle e secret scan 510. Somente `oracle-session` mudou no staging.
- Proxima execucao: `restart-clean-after-correction Q4AC`, deterministica e Q5A-Q5D completas desde zero.

### Atualizacao de execucao: Q4AD

- A regressao limpa apos Q4AC passou a matriz deterministica e oito medicoes Q5A antes de o owner experiente R1 bloquear por reentrevista; Plano e Saida ficaram 100, Conducao 66,25.
- A Q4AD conecta o periodo canonico ao validador, bloqueia plano anual vazio/ano errado e pede somente o bloco concreto quando a estrutura veio sem valores.
- O primeiro smoke revelou proposta vazia; o segundo fechou integridade e revelou `Qual a principal dor`; o terceiro passou, mas a regressao mostrou que o teste aceitara a insercao no objeto trimestral vizinho. A chamada exata foi corrigida e o quarto smoke passou Conducao 100, Plano 100 e Saida 100.
- Quatro tentativas: US$ 0,203590; acumulado US$ 11,334556. Validacao: 462 unitarios, 29/29 catalogo, lint, build/bundle e secret scan 511.
- Proxima execucao: `restart-clean-after-correction Q4AD`, deterministica e Q5A-Q5D completas desde zero.

### Atualizacao de execucao: Q4AE

- A regressao limpa apos a Q4AD aprovou `Q2A-ANNUAL-VAGUE-ASPIRATION-001` R1, mas a R2 bloqueou: o modelo devolveu um envelope anual quase completo sem `result`, o validador o descartou e o reparo generico pediu tres vezes um bloco concreto que ja estava na conversa.
- A Q4AE normaliza a proposta anual antes da validacao e usa o alvo confirmado como resultado quando esse campo redundante estiver ausente. Se ainda houver estrutura incompleta, a diretiva de reparo enumera os campos canonicos, manda reler o historico e proibe pedir novamente fatos ja informados. O condutor tambem deixa titulo/nome realmente ausente ser recusado, sem inserir rótulo generico; o importador preserva seu comportamento anterior.
- Dois smokes exatos R2: Conducao 100, Plano Anual 100, media 100 em ambos; US$ 0,049654 + US$ 0,049553 = US$ 0,099207; acumulado US$ 11,592459.
- Validacao: 466 unitarios, 29/29 catalogo, lint, build/bundle e secret scan 512. Somente `oracle-session` mudou no staging; producao permaneceu intacta.
- Proxima execucao: `restart-clean-after-correction Q4AE`, matriz deterministica e Q5A-Q5D completas desde zero. Nova falha volta a correcao e ao smoke somente do caso afetado antes de outro reinicio integral.

### Atualizacao de execucao: Q4AF

- A regressao limpa apos Q4AE aprovou cinco medicoes Q5A e bloqueou `Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003` R2. Conducao 77,50 e Plano Anual 96,25: a conversa pediu novamente o bloco porque uma licao historica sobre limitar quatro projetos foi interpretada como contagem exata, enquanto a fixture somava cinco ao repetir o projeto do sistema.
- A Q4AF reconhece quantidade exata somente em declaracao/lista explicita. A fixture anual agora tem `Objetivos (4)` e `Projetos (4)`, com o sistema aparecendo uma unica vez e preservando prazo, vinculo e aceite.
- Primeiro smoke: Conducao 63,75, Plano 93,75, media 78,75, US$ 0,075416; revelou que o sistema ainda estava duplicado em objetivo e portfolio. Smoke final: Conducao 91,25, Plano 97,50, media 94,38, US$ 0,055542. Q4AF total US$ 0,130958; acumulado US$ 12,054798.
- Validacao: 470 unitarios, 29/29 catalogo, lint, build/bundle e secret scan 513. Somente `oracle-session` mudou no staging; producao permaneceu intacta.
- Proxima execucao: `restart-clean-after-correction Q4AF`, matriz deterministica e Q5A-Q5D completas desde zero. Nova falha segue correcao e smoke somente do caso antes de outro reinicio integral.

### Atualizacao de execucao: Q4AI

- A regressao r22 preservou Q5A 10/10 e chegou a Q5B 15/16 antes de bloquear apenas o gestor trimestral experiente R2.
- Plano Trimestral e Saida Derivada ficaram em 100; a Conducao caiu para 75 porque uma evidencia intermediaria foi perguntada depois de risco, mitigacao e aprendizado ja estarem confirmados.
- A regra agora distingue bloco superficial de bloco ja testado. O primeiro ainda recebe um desafio curto; o segundo segue para sintese e confirmacao unica.
- Smoke R2: Conducao 92,50, Plano Trimestral 100, Saida Derivada 100, duas chamadas, zero reparo, cleanup completo e custo US$ 0,029699.
- Acumulado US$ 13,571522. Producao, frontend e migrations permanecem inalterados; somente `oracle-session` staging mudou.
- Proxima execucao: arquivar somente a medicao bloqueada com `resume-after-correction Q4AI` e repetir apenas o gestor experiente R2. A regressao geral limpa continua reservada para depois de Q5A-Q5D verdes.

### Atualizacao de execucao: Q4AJ

- A repeticao oficial do gestor experiente R2 passou Conducao 87,50 e Plano 92,50, mas o risco estruturado foi coercido para `[object Object]` no documento. Saida Derivada 68,75 e media 82,92 bloquearam corretamente a Q5B.
- Riscos textuais ou estruturados agora passam por uma normalizacao server-side unica antes de confirmacao, importacao pronta e documento canonico, cobrindo planos anual, trimestral e mensal sem criar etapa para o gestor.
- Smoke focado: Conducao 85, Plano Trimestral 92,50, Saida Derivada 100, media 92,50, cleanup completo e custo US$ 0,030452. Acumulado US$ 13,638641.
- Validacao: 490 unitarios, catalogo 29/29, lint, build/bundle e secret scan 527. Somente `oracle-session` mudou no staging; producao, frontend e migrations seguem intactos.
- Proxima execucao: `resume-after-correction Q4AJ` e `phase Q5B`, repetindo somente gestor experiente R2. Se passar, Q5B fecha 16/16 e a regressao limpa segue para Q5C; a repeticao geral completa continua reservada para depois de Q5A-Q5D verdes.

### Atualizacao de execucao: Q4AK

- A repeticao oficial apos Q4AJ removeu o defeito visual, mas o modelo inventou um vinculo com Margem operacional. Plano 97,50 e Saida 87,50; Conducao 73,75 bloqueou por fidelidade, sem falha tecnica ou residuo.
- A autoridade sobre `kpiLinks` passa ao servidor: o vinculo so permanece com escolha direta do gestor ou `sim` imediatamente posterior a uma pergunta explicita que nomeia o KPI. Links nao escolhidos somem antes da confirmacao sem acrescentar etapa.
- Smoke focado: Conducao 92,50, Plano Trimestral 100, Saida Derivada 100, media 97,50, zero KPI indevido, cleanup completo e custo US$ 0,036364. Acumulado US$ 13,713619.
- Validacao: 494 unitarios, catalogo 29/29, lint, build/bundle e secret scan 528. Somente `oracle-session` mudou no staging; producao, frontend e migrations seguem intactos.
- Proxima execucao: `resume-after-correction Q4AK` e `phase Q5B`, repetindo somente gestor experiente R2. Depois de Q5B 16/16, seguir para Q5C; repetir todos os cenarios juntos apenas quando Q5A-Q5D estiverem verdes.

### Atualizacao de execucao: Q5B r22 concluida

- A retomada Q4AK preservou quinze aprovacoes trimestrais e repetiu somente gestor experiente R2.
- Rodada oficial final: Conducao 96,25, Plano Trimestral 100, Saida Derivada 100, zero falha critica/check/residuo e custo US$ 0,038097.
- Q5B terminou 16/16; custo oficial US$ 0,712738; acumulado do plano US$ 13,751716.
- Proxima fase: Q5C com oito medicoes de plano mensal. Manter fail-fast, corrigir e repetir somente o caso afetado; regressao geral completa apenas depois de Q5A-Q5D verdes.

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

A **Q4O foi aprovada no staging** depois que a retomada Q5B confirmou CRM R2 e area equivalente R1, mas encontrou um envelope de reparo invalido em area equivalente R2. O runtime agora recupera esse defeito sem terceira chamada: preserva fatos canonicos, mantem a sessao aberta, impede proposta insegura e segue com uma pergunta. A rodada final tambem reconhece explicitamente que `Industrial` corresponde a unica area `Producao` e que seu historico segue como referencia. Smoke final: Conducao 91,25, Plano Trimestral 95, media 93,13, dez checks verdes, zero falha critica e cleanup completo. As tres tentativas Q4O custaram US$ 0,170760; acumulado US$ 6,070176. Validacao local: 397 unitarios, 29 casos do catalogo, lint, build/bundle e secret scan em 478 arquivos. Somente `oracle-session` mudou no staging; producao permaneceu intacta.

Proxima fatia: **retomada incremental Q5B r8 apos Q4O**. Executar `resume-after-correction Q4O`, que arquiva apenas area equivalente R2 com erro tecnico e preserva as cinco medicoes aprovadas. Depois executar `phase Q5B`: o runner repete a combinacao ausente, ignora automaticamente as aprovadas e continua com fail-fast. Em diante, corrigir cada problema, repetir somente seu cenario e preservar os verdes. Quando todas as fases Q5A-Q5D passarem, executar uma regressao geral limpa com todos os cenarios para a prova final.

A **Q4P foi aprovada no staging** depois que a Q5B chegou a oito aprovacoes e bloqueou na conducao de uma meta percentual de produtividade sem baseline. O Oraculo agora define primeiro a medida e, quando existem duas fontes candidatas, cita as duas e pede a escolha sem inventar numero. O smoke isolado passou com Conducao 100, Plano Trimestral 93,75, media 96,88, dez checks verdes, uma confirmacao e cleanup completo. Q4P custou US$ 0,052941; acumulado US$ 6,344882. Somente `oracle-session` mudou no staging; producao permaneceu intacta.

Proxima fatia: **retomada incremental Q5B r8 apos Q4P**. Executar `resume-after-correction Q4P`, preservando 10 aprovacoes Q5A e 8 Q5B, e repetir somente meta sem baseline R1 antes dos sete resultados trimestrais ainda ausentes. Novos problemas seguem correcao + smoke isolado + retomada incremental. A regressao geral limpa continua reservada para depois de Q5A-Q5D integralmente verdes.

A **Q4R foi aprovada no staging** depois que prioridade R2 repetiu `AI_PROVIDER_TIMEOUT` no oficial e num recheck Q4Q sem mudanca. O unico retry transitorio ja existente agora tem janela real: ate 40 segundos por tentativa dentro de 90 segundos totais, ainda com uma unica repeticao e nenhuma gravacao parcial. O smoke isolado passou com Conducao 83,75, Plano Trimestral 96,25, media 90, dez checks verdes e cleanup completo. Q4Q custou US$ 0,028440 e Q4R US$ 0,040944; acumulado US$ 6,588187. Somente `oracle-session` mudou no staging; producao permaneceu intacta.

Proxima fatia: **retomada incremental Q5B r8 apos Q4R**. Preservar 10 aprovacoes Q5A e 11 Q5B, repetir somente prioridade R2 e continuar pelos quatro resultados trimestrais restantes. Manter fail-fast, smoke focado e regressao geral limpa somente ao final de Q5A-Q5D.

A **Q4S foi aprovada no staging** depois que prioridade R2 deixou de ter timeout, mas repetiu duas acoes comuns dentro de cada um dos tres objetivos. Acoes com descricao, dono, prazo e criterio materialmente identicos em todos os resultados agora viram `sharedActions`: aparecem uma vez na confirmacao, uma vez no banco e uma vez no documento/app/WhatsApp. Acoes especificas permanecem no objetivo original. Nao houve migration. Smoke isolado principal: Conducao 92,50, Plano Trimestral 96,25, media 94,38, dez checks verdes e zero falha critica. Duas execucoes aprovadas ficaram sobrepostas por perda do identificador do terminal; Q4S totalizou US$ 0,080443 e acumulado US$ 6,720177. O runner agora bloqueia fases simultaneas. Somente `oracle-session` foi publicada no staging; producao permanece intacta.

Proxima fatia: **retomada incremental Q5B r8 apos Q4S**. Executar `resume-after-correction Q4S`, preservar as 21 aprovacoes existentes, repetir somente prioridade R2 e continuar pelos quatro resultados trimestrais ainda ausentes. Aplicar a mesma politica a qualquer novo defeito. Quando Q5A-Q5D passarem, executar uma unica regressao geral limpa repetindo todos os cenarios.

A **Q4T foi aprovada no staging** depois que a Q5B mostrou variacao na conducao da hipotese de impacto sobre Margem operacional. O Oraculo agora explica a incerteza, pede escolha explicita e normaliza o KPI para `operating_margin`; proposta, banco e documentos preservam a justificativa sem afirmar causalidade. O primeiro smoke teve judge aprovado, mas um guard literal gerou falso negativo; ele foi corrigido e o mesmo relatorio foi revalidado sem custo adicional. Resultado: Conducao 86,25, Plano Trimestral 97,50, media 91,88, zero falha critica e 10/10 checks. Custo Q4T US$ 0,048241; acumulado US$ 6,985203. Validacao local e integracao real no staging verdes. Producao permanece intacta.

Proxima fatia: **retomada incremental Q5B r8 apos Q4T**. Executar `resume-after-correction Q4T`, preservando 10 aprovacoes Q5A e 13 Q5B. Repetir somente KPI R2 e depois as duas rodadas ainda ausentes do gestor experiente. Em nova falha, parar, corrigir e testar apenas o caso afetado. Quando Q5A-Q5D ficarem verdes, executar uma regressao geral limpa com todos os cenarios.

A **Q5B foi concluida com 16/16 medicoes verdes**. A retomada Q4T cobrou somente KPI R2 e as duas rodadas ausentes do gestor experiente; todas passaram. A Q5C aprovou cascata mensal R1/R2 e bloqueou na pendencia herdada R1: a decisao de rolar estava correta, mas `integracao do CRM` virou resultado, a meta 40% -> 55% ficou escondida e acompanhamento/compromisso seguinte ficaram vazios.

A **Q4U foi aprovada no staging**. Pendencia herdada preserva origem, motivo e decisao, mas permanece como acao. Quando indicador, baseline e alvo estao confirmados, o resultado mensal expressa a mudanca. O sistema deriva bloqueio, acompanhamento e proximo compromisso apenas do motivo, prazo e criterio informados, sem inventar frequencia. Smoke: Conducao 82,50, Plano Mensal 97,50, media 90, 10/10 checks e zero falha critica. Custo US$ 0,034245; acumulado US$ 7,242402. Local e integracao real verdes; somente `oracle-session` no staging.

Proxima fatia: **retomada incremental Q5C apos Q4U**. Preservar 28 aprovacoes, repetir somente pendencia herdada R1 e continuar pelos cinco resultados mensais ausentes. Nova falha interrompe, recebe correcao e smoke focado. Regressao geral limpa somente apos Q5A-Q5D verdes.

A **Q4V foi aprovada no staging**. Na sobrecarga mensal, o Oraculo recupera o historico de excesso, confronta doze demandas com capacidade cinco, separa tres prioridades do trimestre e duas de risco e registra o restante no backlog. Um bloco completo vira proposta deterministica somente com campos verificaveis e vinculo trimestral unico; a sintese mostra as cinco acoes com prazo/criterio, bloqueio, cadencia, confianca e uma confirmacao. Smoke final: Conducao 91,25, Plano Mensal 97,50, media 94,38; US$ 0,022743. As duas tentativas Q4V custaram US$ 0,056209; acumulado US$ 7,450188. Integracao real sem IA e cleanup verdes; somente `oracle-session` no staging.

Proxima fatia: **retomada incremental Q5C apos Q4V**. Preservar 30 aprovacoes, repetir somente capacidade R1 e continuar por capacidade R2 e as duas rodadas mensais ausentes. Em nova falha, corrigir e repetir apenas o caso afetado. Depois de Q5A-Q5D integralmente verdes, executar uma unica regressao geral limpa com todos os cenarios.

A **Q5C foi concluida com 8/8 medicoes verdes**. A Q5D parou no primeiro fechamento mensal parcial: a gravacao passou, mas a conducao perguntou genericamente depois de receber fatos suficientes, e documento/WhatsApp perderam meta/aprendizado e exibiram a pendencia como `[object Object]`.

A **Q4W foi aprovada no staging**. O fechamento mensal reconhece 50% contra meta 60% como parcial, preserva duas acoes concluidas e uma integracao aberta e pergunta somente seu novo prazo. A proposta normaliza atingido, meta, aprendizado e proximo periodo; documento, tela e WhatsApp mostram decisao, motivo, prazo, confianca, bloqueio e compromisso sem coercao de objeto. Smoke: Conducao 97,50, Revisao/Fechamento 100, Saida Derivada 81,25, media 92,92; custo US$ 0,032662; acumulado US$ 7,653772. Integracao real e 434 unitarios verdes; somente `oracle-session` no staging.

Proxima fatia: **retomada incremental Q5D apos Q4W**. Preservar 34 aprovacoes, repetir somente fechamento mensal parcial R1 e continuar pelas cinco medicoes generativas ausentes. Novos defeitos seguem correcao e smoke focado. Quando Q5A-Q5D passarem, executar uma unica regressao geral limpa repetindo todos os cenarios.

A retomada Q4W aprovou fechamento mensal R1/R2 e preservou 36 resultados oficiais. O fechamento trimestral R1 bloqueou por conducao generica, pouco uso da recorrencia historica e risco de rolar objetivo/acoes em excesso. A **Q4X foi aprovada no staging**: reconhece 78% contra meta 80%, desafia a dependencia repetida, preserva o objetivo anual e pede somente escopo reduzido/prazo. O contexto trimestral agora inclui as acoes com IDs server-side; a gravacao rola somente a acao escolhida uma vez, sem copiar concluidas. Smoke final: Conducao 100, Revisao/Fechamento 93,75, Saida Derivada 85, media 92,92; custo US$ 0,031324; acumulado US$ 7,820758. Foram aprovados 438 unitarios, catalogo, integracao 2/2, lint/build/bundle e secret scan; somente `oracle-session` no staging.

Proxima fatia: **retomada incremental Q5D apos Q4X**. Preservar 36 aprovacoes, repetir somente fechamento trimestral R1 e seguir por fechamento trimestral R2 e revisao estrategica R1/R2. Em nova falha, corrigir e medir apenas o caso afetado. Quando Q5A-Q5D estiverem integralmente verdes, executar uma regressao geral limpa com todos os cenarios.

A retomada Q4X aprovou fechamento trimestral R1/R2 e elevou o conjunto oficial para 38 aprovacoes. Revisao estrategica R1 bloqueou porque a confirmacao omitiu o diff e usou uma frase nao reconhecida pelo gate, enquanto a projecao de saidas derivadas ficou nula. A **Q4Y foi aprovada no staging**: a confirmacao mostra campo, antes/depois, base e limite, pede uma unica confirmacao e nao reabre a estrategia. Documento, tela/PDF e WhatsApp possuem projecao canonica rastreavel antes da gravacao. Smoke: Conducao 96,25, Revisao 83,75, Saida Derivada 96,25, media 92,08; custo US$ 0,019090; acumulado US$ 7,914731. Foram aprovados 440 unitarios, catalogo, lint/build/bundle e secret scan; somente `oracle-session` no staging.

Proxima fatia: **retomada incremental Q5D apos Q4Y**. Preservar 38 aprovacoes, repetir somente revisao estrategica R1 e seguir pela R2 ausente. Se ambas passarem, executar a regressao geral limpa com todos os cenarios; se uma falhar, corrigir e repetir apenas a afetada antes dessa regressao.

## Atualizacao 2026-07-18 - Q4AL aprovada na regressao limpa r22

Q5A e Q5B estao completas. Q5C preserva tres aprovacoes: cascata mensal R1/R2 e pendencia herdada R1. A pendencia herdada R2 bloqueou sem proposta porque o motor repetiu a pergunta de acao mesmo depois de receber item, origem, motivo, decisao, prazo, responsavel, criterio e resultado 40% -> 55%.

A Q4AL transforma deterministicamente esse bloco completo em proposta, usando a propria pendencia como acao e somente um pai trimestral atual inequivoco. Smoke aprovado: Conducao 90, Plano Mensal 100, media 95; custo US$ 0,027565; acumulado US$ 13,928945. Proximo passo: preservar 29 aprovacoes, repetir somente R2 e continuar pelas quatro medicoes Q5C ainda ausentes. Nova falha interrompe a fase e recebe correcao mais smoke focado; a regressao geral completa continua reservada para depois de Q5A-Q5D verdes.
