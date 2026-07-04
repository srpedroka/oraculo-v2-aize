export const QUARTERLY_PHASES = ["abertura", "alinhamento", "anual_da_area", "diagnostico", "objetivos_do_trimestre", "foco_de_aprendizado", "sintese"];

export const QUARTERLY_CONDUCTOR = `ROTEIRO DO CONDUTOR: Plano Trimestral da Área
Fases na ordem: abertura, alinhamento, anual_da_area, diagnostico, objetivos_do_trimestre, foco_de_aprendizado, sintese
Observação: a fase anual_da_area SÓ acontece se a área ainda não tiver plano anual no contexto; se já tiver, pule direto de alinhamento para diagnostico. O foco do produto é o trimestre.

abertura
Objetivo: aquecer e mirar.
- Use UM quebra-gelo: "Antes de começarmos: qual é o principal desafio da sua área hoje?"
- Confirme em uma linha a área, o trimestre e o ano.
- Guarde: desafio_principal.

alinhamento
Objetivo: ancorar no estratégico.
- Resuma em 3 a 5 linhas o tema do ano e os objetivos estratégicos, e pergunte: "Quais desses impactam mais a sua área?"
- Guarde: objetivos_estrategicos_relevantes[].
- Se NÃO houver plano estratégico no contexto, diga com franqueza que o ideal é o estratégico existir primeiro, pergunte se quer seguir mesmo assim, e colete versão curta.

anual_da_area (condicional)
Objetivo: papel da área e objetivo anual, só se ainda não existirem.
- Papel: missão da área em uma frase e contribuição aos objetivos estratégicos.
- Objetivo anual principal na fórmula e até 4 complementares.
- Guarde: papel_da_area, objetivo_anual_principal, objetivos_anuais[].

diagnostico
Objetivo: retrato honesto e curto.
- Duas perguntas, uma por vez: 3 forças e 3 gargalos.
- Guarde: forcas[], gargalos[].

objetivos_do_trimestre
Objetivo: 1 a 3 objetivos do trimestre, puxados dos anuais.
- Relembre os objetivos anuais da área.
- Para cada anual relevante, pergunte quanto quer avançar neste trimestre.
- Escreva cada objetivo no formato: "No {T}, alcançar {resultado específico}, como parte do objetivo anual {X}."
- Para cada objetivo, colete 2 a 5 entregas principais e responsável.
- Guarde: objetivos_trimestre[] com entregas.

foco_de_aprendizado
Objetivo: a direção de aprendizado do time no trimestre.
- Pergunte o que a equipe precisa aprender ou melhorar para sustentar os objetivos.
- Sintetize em 1 a 3 bullets.
- Guarde: foco_aprendizado[].

sintese
Objetivo: fechar e gravar.
- Apresente o plano do trimestre em resumo.
- Lembre que o plano de ação detalhado nasce no plano mensal.
- Monte a proposal do tipo save_quarterly_plan e peça confirmação.

Formato esperado da proposal save_quarterly_plan:
{"type":"save_quarterly_plan","areaRole":{"mission":"","contribution":[]},"diagnosis":{"strengths":[],"weaknesses":[]},"learningFocus":[],"annualObjectives":[{"title":"","type":"harvest|seed","metric":"","target":"","owner":"","period":"2026","linkedStrategicObjectiveId":null}],"quarterlyObjectives":[{"title":"","type":"harvest|seed","metric":"","target":"","owner":"","period":"T3 2026","parentTitle":"","deliverables":[]}]}`;
