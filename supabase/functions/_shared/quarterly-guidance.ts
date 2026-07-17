type QuarterlyEnvelope = {
  reply?: unknown;
  proposal?: unknown;
  [key: string]: unknown;
};

type QuarterlyValidationInput = {
  envelope: QuarterlyEnvelope;
};

const ACTIVITY_TITLE_PATTERN = /^(?:implantar|implementar|instalar|criar|fazer|planejar|organizar|contratar|desenvolver|configurar)\b/i;
const ANNUAL_RITUAL_SWITCH_PATTERN = /\b(?:vamos|precisamos|vou)\s+(?:construir|montar|fazer|iniciar|come[cç]ar)\s+(?:o\s+)?(?:planejamento|plano)\s+(?:estrat[eé]gico\s+)?anual\b/i;
const CADENCE_ACTION_PATTERN = /\b(?:acompanhar|acompanhamento|auditar|auditoria|revisar|revis[aã]o|reuni[aã]o|check-?in|ritual|monitorar|monitoramento)\b/i;
const CADENCE_FREQUENCY_PATTERN = /\b(?:di[aá]ri[oa]s?|diariamente|semanal|semanalmente|quinzenal|quinzenalmente|mensal|mensalmente|bimestral|bimestralmente|trimestral|trimestralmente)\b/i;

export const QUARTERLY_GUIDANCE_RULES = `REGRAS ESPECIFICAS DO PLANO TRIMESTRAL (obrigatorias):
- O trimestre transforma a direcao anual em 1 a 3 resultados decisivos. Nunca mude para o ritual anual durante esta sessao.
- Quando houver objetivo anual aplicavel no contexto, vincule cada resultado trimestral a ele. Quando nao houver, continue no trimestre e registre annualAlignment={"status":"exception","rationale":"motivo confirmado pelo gestor"}; nunca invente um objetivo anual apenas para preencher o vinculo.
- Forcas e gargalos sao proporcionais ao caso. Colete somente o diagnostico que muda uma escolha; nao exija listas fixas de tres itens.
- Se o gestor trouxer uma atividade como objetivo (implantar CRM, contratar, criar processo), investigue o resultado que ela precisa produzir. A atividade fica em actions[]; o objetivo descreve a mudanca mensuravel.
- Cada objetivo trimestral precisa preservar title, result, metric, current (baseline), target, source, deadline, owner, parentTitle e pelo menos uma action. Cada action preserva description, owner, deadline e completionCriterion.
- Se baseline, indicador, fonte, prazo, dono ou criterio ainda nao existirem, nao monte proposal: pergunte somente a lacuna que torna o objetivo verificavel.
- Se houver mais de tres prioridades, conduza a escolha de 1 a 3 resultados. Registre itens adiados em tradeOffs[]; nao os esconda como uma lista excessiva de acoes.
- Preserve risks[], learningFocus[] e cadence quando forem informados. Cadencia e o ritmo de acompanhamento, nao uma nova burocracia.
- Em meta recorrente, preserve a trajetoria parcial, a causa confirmada e a mudanca de abordagem. Nao repita indicador ou baseline ja informados; use a proxima pergunta para definir a evidencia intermediaria do aprendizado.
- annualAlignment.status deve ser linked quando houver vinculo real, acompanhado do titulo ou id aplicavel; ou exception com justificativa explicita.

Formato completo da proposal trimestral:
{"type":"save_quarterly_plan","annualAlignment":{"status":"linked|exception","strategicObjectiveTitle":"","rationale":""},"linkedStrategicObjectiveIds":[],"areaRole":{"mission":"","contribution":[]},"diagnosis":{"strengths":[],"weaknesses":[]},"learningFocus":[],"risks":[],"tradeOffs":[],"cadence":"","annualObjectives":[],"quarterlyObjectives":[{"title":"","result":"","type":"harvest|seed","metric":"","current":"","target":"","source":"","deadline":"YYYY-MM-DD","owner":"","period":"T3 2027","parentTitle":"","deliverables":[],"actions":[{"description":"","owner":"","deadline":"YYYY-MM-DD","completionCriterion":""}],"kpiLinks":[]}]}`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function explicitCadence(conversationText: string) {
  return conversationText
    .split(/[\n;]+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .find((line) => CADENCE_ACTION_PATTERN.test(line) && CADENCE_FREQUENCY_PATTERN.test(line))
    ?.slice(0, 180) ?? "";
}

export function preserveExplicitQuarterlyCadence(envelope: QuarterlyEnvelope, conversationText: string) {
  const proposal = asRecord(envelope.proposal);
  if (proposal.type !== "save_quarterly_plan" || text(proposal.cadence ?? proposal.cadencia)) return envelope;
  const cadence = explicitCadence(conversationText);
  if (!cadence) return envelope;
  return {
    ...envelope,
    proposal: {
      ...proposal,
      cadence,
    },
  };
}

function objectiveIsVerifiable(objective: Record<string, unknown>) {
  return [
    objective.title,
    objective.result,
    objective.metric,
    objective.current ?? objective.baseline ?? objective.valor_atual,
    objective.target,
    objective.source ?? objective.fonte ?? objective.evidencePlan ?? objective.evidence_plan,
    objective.deadline ?? objective.prazo,
    objective.owner ?? objective.responsavel,
  ].every((value) => text(value));
}

function actionIsComplete(action: unknown) {
  const record = asRecord(action);
  return [
    record.description ?? record.descricao,
    record.owner ?? record.responsavel,
    record.deadline ?? record.prazo,
    record.completionCriterion ?? record.completion_criterion ?? record.criterio,
  ].every((value) => text(value));
}

function hasAnnualLink(proposal: Record<string, unknown>, alignment: Record<string, unknown>, objectives: unknown[]) {
  const linkedIds = asArray(proposal.linkedStrategicObjectiveIds).map(text).filter(Boolean);
  const annualObjectives = asArray(proposal.annualObjectives).map(asRecord);
  return Boolean(
    linkedIds.length
    || text(alignment.strategicObjectiveId)
    || text(alignment.strategicObjectiveTitle)
    || annualObjectives.some((objective) => text(objective.title) || text(objective.linkedStrategicObjectiveId))
    || objectives.some((objective) => text(asRecord(objective).parentTitle)),
  );
}

export function validateQuarterlyGuidanceEnvelope(input: QuarterlyValidationInput) {
  const reasons: string[] = [];
  const reply = text(input.envelope.reply);
  const proposal = asRecord(input.envelope.proposal);

  if (ANNUAL_RITUAL_SWITCH_PATTERN.test(reply)) reasons.push("quarterly_annual_ritual_switch");
  if (!Object.keys(proposal).length) return reasons;
  if (proposal.type !== "save_quarterly_plan") return [...reasons, "quarterly_wrong_proposal_type"];

  const objectives = asArray(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre);
  const alignment = asRecord(proposal.annualAlignment ?? proposal.alinhamento_anual);
  const alignmentStatus = text(alignment.status).toLowerCase();

  if (!objectives.length) reasons.push("quarterly_missing_objectives");
  if (objectives.length > 3) reasons.push("quarterly_priority_overload");
  if (!['linked', 'exception'].includes(alignmentStatus)) reasons.push("quarterly_alignment_missing");
  if (alignmentStatus === "linked" && !hasAnnualLink(proposal, alignment, objectives)) reasons.push("quarterly_alignment_missing");
  if (alignmentStatus === "exception" && !text(alignment.rationale ?? alignment.justificativa)) {
    reasons.push("quarterly_alignment_exception_missing_reason");
  }
  if (alignmentStatus === "exception" && (
    asArray(proposal.annualObjectives).length
    || asArray(proposal.linkedStrategicObjectiveIds).map(text).filter(Boolean).length
  )) {
    reasons.push("quarterly_exception_with_annual_link");
  }

  for (const rawObjective of objectives) {
    const objective = asRecord(rawObjective);
    const title = text(objective.title ?? objective.titulo);
    const result = text(objective.result ?? objective.resultado);
    const actions = asArray(objective.actions ?? objective.acoes);
    if (!objectiveIsVerifiable(objective)) reasons.push("quarterly_unverifiable_objective");
    if (ACTIVITY_TITLE_PATTERN.test(title) && (!result || ACTIVITY_TITLE_PATTERN.test(result))) {
      reasons.push("quarterly_activity_as_objective");
    }
    if (!actions.length || actions.some((action) => !actionIsComplete(action))) reasons.push("quarterly_incomplete_actions");
  }

  return [...new Set(reasons)];
}
