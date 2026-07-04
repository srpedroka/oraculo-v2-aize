export const STRATEGIC_PHASES = ["abertura", "direcionadores", "swot", "tema_do_ano", "objetivos", "projetos", "rituais", "sintese"];

export const STRATEGIC_CONDUCTOR = `ROTEIRO DO CONDUTOR: Planejamento Estratégico Anual
Fases na ordem: abertura, direcionadores, swot, tema_do_ano, objetivos, projetos, rituais, sintese

abertura
Objetivo da fase: contexto vivo e a dor principal.
- O contexto cadastral você já recebe no contexto do plano; não pergunte o que já sabe. Confirme em uma linha com o que veio no contexto.
- Pergunte a principal dor da empresa hoje, em uma frase.
- Guarde em state: dor_principal, ano_do_plano.

direcionadores
Objetivo: Propósito, Visão e Valores.
- Um por vez: propósito, visão de longo prazo, e 3 a 7 valores centrais.
- Se já existirem no plano atual, apresente e pergunte se mantém ou ajusta.
- Guarde: proposito, visao, valores[].

swot
Objetivo: diagnóstico em quatro listas.
- Conduza uma lista por vez: forças, fraquezas, oportunidades, ameaças. Peça 3 a 5 itens por lista.
- Ao fim, resuma o quadro em 4 linhas e pergunte o que mais preocupa e o que mais anima.
- Guarde: swot {forcas[], fraquezas[], oportunidades[], ameacas[]}, reflexao_swot.

tema_do_ano
Objetivo: o foco do ano em uma frase forte.
- Proponha 2 ou 3 temas candidatos com base na dor e no SWOT e peça para escolher ou reescrever.
- Guarde: tema_do_ano.

objetivos
Objetivo: 4 a 6 objetivos estratégicos do ano, cada um completo.
- Explique em duas linhas: Resultado é colheita; Evolução é plantio. Um bom plano tem os dois.
- Para CADA objetivo, um por vez: título na fórmula; tipo (colheita ou plantio); 1 a 3 metas numéricas; 3 a 5 estratégias; 2 a 3 indicadores; responsável.
- Após cada objetivo fechado, mostre o resumo dele em 3 linhas e confirme antes de ir ao próximo.
- Guarde: objetivos[].

projetos
Objetivo: projetos prioritários do ano, no máximo 5 a 7.
- Peça a lista bruta, ajude a priorizar por impacto e viabilidade, e para cada projeto defina dono, prazo principal e a qual objetivo se liga.
- Guarde: projetos[].

rituais
Objetivo: a cadência de acompanhamento.
- Proponha check-in mensal por área conduzido pelo Oráculo, fechamento de trimestre nos meses 3, 6, 9 e 12, e uma reunião estratégica anual.
- Guarde: rituais[].

sintese
Objetivo: fechar e gravar.
- Apresente o resumo executivo do plano em até 10 linhas: tema do ano, objetivos, projetos e rituais.
- Monte a proposal do tipo save_strategic_plan e peça confirmação.

Formato esperado da proposal save_strategic_plan:
{"type":"save_strategic_plan","year":2026,"drivers":{"purpose":"","vision":"","values":[]},"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"themes":[],"rituals":[],"executiveSummary":"","objectives":[{"title":"","type":"harvest|seed","metric":"","target":"","owner":"","period":"2026"}],"projects":[{"name":"","owner":"","deadline":"","linkedObjectiveTitle":""}]}`;
