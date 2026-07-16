# Plano integrado: qualidade estratégica e qualidade operacional do Oráculo

Data: 2026-07-16

Status: **planejado; execução ainda não iniciada**

Plano anterior concluído: `plans/2026-07-12-hardening-confiabilidade-escala.md`

## 1. Objetivo

Este documento reúne em uma única sequência os dois trabalhos que faltam para liberar o Oráculo com confiança para os gestores:

1. **Mapa A — Qualidade estratégica:** provar que a IA conduz bem o gestor e produz um plano trimestral coerente, mensurável e executável.
2. **Mapa B — Qualidade operacional:** provar que esse planejamento de qualidade funciona de ponta a ponta no aplicativo e no WhatsApp, com dados reais controlados.

O hardening técnico das Etapas 0 a 7 já foi concluído e não será refeito. Integridade, segurança, RLS, idempotência, filas, backup, observabilidade e recuperação são a fundação deste plano e continuam como gates de regressão.

## 2. Resultado esperado

Ao final, o Oráculo deve demonstrar simultaneamente que:

- conduz uma conversa estratégica sem se perder entre empresa, área e período;
- entende o problema antes de propor o plano;
- usa históricos relevantes sem misturar documentos de outras áreas ou períodos;
- questiona objetivo repetido, meta fraca, excesso de prioridade e ausência de indicador;
- diferencia objetivo, resultado-chave, KPI, evidência e ação;
- gera plano trimestral simples, porém suficiente para execução;
- pede somente uma confirmação final para gravar;
- grava exatamente o que foi aprovado;
- preserva o mesmo contexto no app e no WhatsApp;
- produz documento, Dashboard, revisão, auditoria, custo e backup coerentes;
- permite que um gestor real use o fluxo sem treinamento complexo.

## 3. Os dois mapas

```text
Hardening técnico concluído
          |
          v
MAPA A — QUALIDADE ESTRATÉGICA
Q0 padrão -> Q1 laboratório -> Q2 casos -> Q3 baseline
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

## 5. Referências para qualidade do plano trimestral

O Oráculo utilizará uma combinação pragmática, sem obrigar o gestor a conhecer os métodos:

- **Balanced Scorecard:** conectar estratégia, objetivos, indicadores, metas e iniciativas.
  - Referência: <https://balancedscorecard.org/wp-content/uploads/2022/09/Essentials-Overview-Webinar-Final.pdf>
- **OKRs:** objetivo significativo e resultados específicos, temporais, mensuráveis e verificáveis.
  - Referência: <https://www.whatmatters.com/faqs/okr-meaning-definition-example>
  - Playbook: <https://www.whatmatters.com/resources/google-okr-playbook>
- **4DX:** poucos objetivos prioritários, medidas de direção e resultado, placar e cadência de responsabilização.
  - Referência: <https://ir.franklincovey.com/news-releases/news-release-details/simon-schuster-and-franklincovey-release-revised-and-updated-2nd/>

Essas referências formam critérios internos. A interface continua usando a linguagem simples do Oráculo: objetivo, meta/evidência, ações-chave, responsável, prazo, KPI, confiança e bloqueio.

## 6. Rubrica oficial de qualidade

### 6.1 Condução estratégica — 100 pontos

| Dimensão | Peso | Evidência esperada |
| --- | ---: | --- |
| Escopo correto | 15 | Confirma empresa, área e período sem trocar o nível do plano |
| Diagnóstico | 15 | Entende problema, causa, impacto e situação atual antes de propor |
| Qualidade das perguntas | 15 | Uma pergunta por vez, relevante, sem repetição e sem induzir resposta |
| Desafio estratégico | 15 | Questiona meta fraca, atividade disfarçada, repetição e excesso de prioridade |
| Uso da memória | 15 | Recupera apenas históricos pertinentes e explica por que são relevantes |
| Naturalidade e eficiência | 10 | Conversa humana, curta e adaptada à maturidade do gestor |
| Fidelidade | 10 | Não inventa números, nomes, vínculos, documentos ou decisões |
| Fechamento | 5 | Resume fielmente e pede uma única confirmação final |

### 6.2 Plano trimestral gerado — 100 pontos

| Dimensão | Peso | Evidência esperada |
| --- | ---: | --- |
| Alinhamento estratégico | 20 | Vínculo e contribuição clara para objetivo anual |
| Objetivo de resultado | 15 | Descreve mudança desejada, não somente tarefa ou projeto |
| Meta e evidência | 20 | Baseline quando disponível, indicador, alvo, prazo e fonte verificável |
| Plano de execução | 20 | Ações-chave, responsáveis, datas e critérios de conclusão |
| Foco e viabilidade | 10 | Poucas prioridades e capacidade plausível no trimestre |
| Riscos e aprendizados | 5 | Dependências, bloqueios, premissas e memória anterior relevante |
| Cadência de gestão | 10 | KPI/placar, check-in, confiança e próximo compromisso definidos |

### 6.3 Faixas

- 90 a 100: excelente;
- 80 a 89: aprovado;
- 70 a 79: revisar antes de gravar;
- abaixo de 70: reprovado.

O plano e a condução precisam atingir **80 pontos separadamente**. A média conjunta mínima para o gate final é **85 pontos**.

### 6.4 Falhas críticas

Qualquer item abaixo reprova o caso, independentemente da nota:

- empresa, área, pessoa ou período incorreto;
- mudança indevida entre plano anual, trimestral e mensal;
- documento histórico de outra área apresentado como referência principal;
- número, responsável, KPI ou decisão inventada;
- objetivo sem ligação estratégica quando existe objetivo anual aplicável;
- meta sem forma verificável de conclusão;
- gravação antes da confirmação;
- mais de uma confirmação final para a mesma proposta;
- divergência entre conversa, banco e documento canônico;
- mutação feita pelo judge de qualidade.

## 7. MAPA A — Qualidade estratégica

## Q0 — Padrão, governança e linha de partida

### Resumo funcional

Formaliza o que significa uma boa condução e um bom plano. Não altera o comportamento do Oráculo e não chama IA paga.

### Trabalho

1. Versionar esta rubrica em documento próprio ou módulo de avaliação.
2. Definir IDs estáveis para critérios e falhas críticas.
3. Criar ficha de revisão humana com nota e justificativa.
4. Definir como medir custo por caso.
5. Definir formato sanitizado de transcrição e plano avaliado.
6. Registrar a versão atual dos prompts, modelos e condutores como baseline.

### Testes

- soma dos pesos igual a 100 em cada rubrica;
- critérios sem duplicidade;
- cada falha crítica mapeada para checagem determinística ou revisão humana;
- nenhum dado real ou segredo no material de avaliação.

### Gate Q0

Owner compreende e aprova rubrica, faixas, falhas críticas e limite financeiro.

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

Um caso mínimo percorre condutor, proposta, checagem e relatório no staging, sem tocar produção.

### Rollback

Remover organização, usuários e chave descartáveis; preservar relatório sanitizado.

## Q2 — Casos de referência e respostas esperadas

Criar no mínimo oito casos independentes:

### Caso 1 — Problema vago

- Entrada: “precisamos melhorar o Comercial”.
- Esperado: investigar situação atual, impacto e mudança desejada.
- Reprovar se: transformar imediatamente em objetivo genérico.

### Caso 2 — Atividade disfarçada de objetivo

- Entrada: “implantar um CRM”.
- Esperado: perguntar qual resultado empresarial o CRM precisa produzir.
- Reprovar se: aceitar instalação como sucesso final sem adoção ou resultado.

### Caso 3 — Área equivalente

- Cadastro: Produção; histórico: Industrial.
- Esperado: reconhecer equivalência quando o contexto for único e seguro.
- Reprovar se: trocar de área, inventar nova área ou abandonar o contexto.

### Caso 4 — Objetivo recorrente

- Histórico: mesma meta repetida em ciclos anteriores sem conclusão.
- Esperado: apontar repetição, perguntar causa e exigir mudança de abordagem.
- Reprovar se: copiar a meta silenciosamente.

### Caso 5 — Meta sem baseline

- Entrada: “aumentar produtividade em 20%”.
- Esperado: perguntar produtividade atual, cálculo e fonte.
- Reprovar se: inventar baseline ou aceitar número sem medição.

### Caso 6 — Excesso de prioridades

- Entrada: oito objetivos para o trimestre.
- Esperado: ajudar a priorizar de um a três resultados decisivos.
- Reprovar se: gerar uma lista extensa sem trade-off.

### Caso 7 — KPI e efeito esperado

- Entrada: objetivo que pode afetar KPI existente.
- Esperado: explicar a hipótese e pedir confirmação antes de vincular.
- Reprovar se: gravar vínculo automaticamente ou sugerir KPI irrelevante.

### Caso 8 — Gestor experiente

- Entrada: objetivo, meta, responsável e ações já claros.
- Esperado: validar lacunas e avançar sem interrogatório desnecessário.
- Reprovar se: repetir roteiro completo e burocratizar.

### Artefatos por caso

- contexto inicial;
- histórico disponível e histórico irrelevante concorrente;
- transcrição esperada por intenção, não texto literal;
- plano mínimo esperado;
- perguntas obrigatórias e proibidas;
- falhas críticas específicas;
- nota humana de referência.

### Gate Q2

Owner revisa os oito casos e confirma que representam situações reais da empresa.

## Q3 — Baseline da versão atual

### Resumo funcional

Mede o Oráculo como ele está hoje. Não corrigir durante a execução e não selecionar apenas respostas boas.

### Trabalho

1. Registrar custo inicial do ciclo.
2. Executar cada caso pelo menos duas vezes para observar variação.
3. Usar os modelos atualmente configurados para suas funções equivalentes.
4. Rodar checagens determinísticas.
5. Rodar judge somente leitura.
6. Fazer revisão humana cega de amostra representativa.
7. Calcular nota de condução, plano, falhas críticas, latência e custo.
8. Classificar defeitos por causa: prompt, memória, roteamento, estado, validação ou renderização.
9. Publicar relatório baseline sem esconder resultados ruins.

### Gate Q3

Relatório completo, custo dentro do teto e lista priorizada de falhas. Nenhuma mudança funcional nesta fatia.

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
- condução >= 80 em todos os casos;
- plano >= 80 em todos os casos;
- média conjunta >= 85;
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
8. Pontuar novamente condução e plano com a rubrica.

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
- condução e plano >= 80;
- nota do gestor >= 4/5 para utilidade e clareza;
- tempo e número de turnos considerados aceitáveis;
- owner aprova expansão.

## O8 — Aceite operacional e rollout gradual

### Entregáveis

- relatório do owner;
- relatório do gestor;
- comparação app/WhatsApp;
- qualidade do plano e da condução;
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
| 1 | Q0 | Padrão | Não | Não | Rubrica aprovada |
| 2 | Q1 | Infra de avaliação | Não | Mínima | Runner seguro |
| 3 | Q2 | Casos de referência | Não | Não | Casos aprovados |
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
- condução e plano atingirem as notas mínimas;
- um gestor real concluir o fluxo e aprovar utilidade;
- app e WhatsApp demonstrarem o mesmo contexto e resultado;
- custo total estiver registrado e dentro da autorização;
- documentação, handoff, commit, push e CI estiverem verdes;
- o owner tomar decisão explícita sobre rollout.

## 13. Prompt para outra ferramenta de desenvolvimento

```text
Leia AGENTS.md e plans/2026-07-16-qualidade-estrategica-operacional.md.

Execute somente a próxima fatia pendente, respeitando rigorosamente a ordem Q0 -> Q6 -> O0 -> O8.

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

Executar **Q0 — Padrão, governança e linha de partida**. É uma fatia documental, sem mudança de funcionalidade, sem produção, sem deploy e sem consumo de API de IA do Oráculo.
