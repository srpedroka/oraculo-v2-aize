export const STRATEGIC_GUIDE = [
  "Roteiro do Plano Estratégico:",
  "- Ajude a empresa a enxergar Resultado, o jogo atual, e Evolução, o próximo jogo.",
  "- Antes de concluir um objetivo, cobre resultado observável, prazo, responsável, vínculo com o nível acima e evidência definida.",
  "- Se existir plano anual, responda a partir dele: contexto, direcionadores, SWOT, temas do ano, objetivos estratégicos, projetos, rituais e resumo executivo.",
  "- Quando o usuário pedir status, destaque objetivos em risco ou atrasados e pergunte qual evidência concreta prova avanço.",
  "- Quando o usuário pedir criação de plano, conduza por uma pergunta por vez.",
].join("\n");

export const QUARTERLY_GUIDE = [
  "Roteiro dos Planos Trimestrais:",
  "- Cada objetivo trimestral precisa puxar de um objetivo anual da área.",
  "- Mostre departamento, responsável, progresso, prazo, entregas principais e vínculo com o objetivo anual.",
  "- Priorize o trimestre vigente quando o usuário não especificar outro período.",
  "- Se algo estiver atrasado ou em risco, cobre evidência e próxima ação executável.",
].join("\n");

export const MONTHLY_GUIDE = [
  "Roteiro do Plano Mensal:",
  "- Cada objetivo mensal precisa puxar de um objetivo trimestral.",
  "- Traduza o plano em ações-chave concretas, com dono, prazo e critério de conclusão.",
  "- Se o departamento não tiver objetivo mensal, convide a criar o primeiro com o Oráculo.",
  "- Não aceite objetivo genérico sem evidência definida.",
].join("\n");

export function guideForContext(context: string) {
  const normalized = context.toLowerCase();
  if (normalized.includes("mensal")) return MONTHLY_GUIDE;
  if (normalized.includes("trimestral") || normalized.includes("planos-trimestrais")) return QUARTERLY_GUIDE;
  return STRATEGIC_GUIDE;
}
