function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function capitalize(value: unknown) {
  const result = text(value).replace(/[.;]+$/, "");
  return result ? `${result.charAt(0).toUpperCase()}${result.slice(1)}` : "";
}

function numericValue(value: unknown) {
  const match = text(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function measurableResult(objective: Record<string, unknown>) {
  const metric = text(objective.metric ?? objective.indicador);
  const current = text(objective.current ?? objective.baseline ?? objective.valor_atual);
  const target = text(objective.target ?? objective.meta);
  if (!metric || !current || !target) return "";
  const currentNumber = numericValue(current);
  const targetNumber = numericValue(target);
  const verb = currentNumber !== null && targetNumber !== null && targetNumber < currentNumber
    ? "Reduzir"
    : "Elevar";
  return `${verb} ${metric} de ${current} para ${target}`;
}

function shouldReplaceActivityResult(objective: Record<string, unknown>, pendingItem: string) {
  const result = text(objective.result ?? objective.resultado);
  const title = text(objective.title ?? objective.titulo);
  const pending = comparable(pendingItem);
  if (!pending) return false;
  return comparable(result) === pending || (!result && comparable(title) === pending);
}

export function normalizeMonthlyContinuity(proposalValue: unknown) {
  const proposal = asRecord(proposalValue);
  if (text(proposal.type) !== "save_monthly_plan") return proposalValue;
  const pendingKey = Array.isArray(proposal.pendingDecisions) ? "pendingDecisions" : "decisoes_pendentes";
  const pendingDecisions = asArray(proposal[pendingKey]).map(asRecord);
  const inherited = pendingDecisions.find((decision) => {
    const choice = comparable(decision.decision ?? decision.decisao);
    return (choice === "roll" || choice === "renegotiate")
      && text(decision.item ?? decision.pendencia)
      && text(decision.origin ?? decision.origem)
      && text(decision.reason ?? decision.motivo);
  });
  if (!inherited) return proposalValue;

  const item = text(inherited.item ?? inherited.pendencia);
  const reason = text(inherited.reason ?? inherited.motivo);
  const objectiveKey = Array.isArray(proposal.objectives) ? "objectives" : "objetivos_mes";
  const objectives = asArray(proposal[objectiveKey]).map(asRecord).map((objective) => {
    const outcome = measurableResult(objective);
    if (!outcome || !shouldReplaceActivityResult(objective, item)) return objective;
    return {
      ...objective,
      title: outcome.replace(/\s+de\s+[^\s]+\s+para\s+[^\s]+$/i, ""),
      result: outcome,
    };
  });
  const firstObjective = objectives[0] ?? {};
  const firstAction = asArray(firstObjective.actions ?? firstObjective.acoes).map(asRecord)[0] ?? {};
  const deadline = text(firstAction.deadline ?? firstAction.prazo ?? firstObjective.deadline ?? firstObjective.prazo);
  const criterion = text(
    firstAction.completionCriterion
      ?? firstAction.completion_criterion
      ?? firstAction.criterio,
  );
  const alignmentKey = proposal.quarterlyAlignment ? "quarterlyAlignment" : "alinhamento_trimestral";
  const alignment = asRecord(proposal[alignmentKey]);
  const alignmentTitle = text(alignment.quarterlyObjectiveTitle ?? alignment.quarterly_objective_title);
  const normalizedObjectives = objectives.map((objective) => text(objective.parentTitle ?? objective.vinculo) || !alignmentTitle
    ? objective
    : { ...objective, parentTitle: alignmentTitle });
  const blockers = asArray(proposal.blockers ?? proposal.bloqueios).map(text).filter(Boolean);

  return {
    ...proposal,
    [alignmentKey]: text(alignment.status).toLowerCase() === "linked" && !text(alignment.rationale ?? alignment.justificativa)
      ? { ...alignment, rationale: `Resultado mensal confirmado como contribuição a ${alignmentTitle || "objetivo trimestral"}.` }
      : alignment,
    [objectiveKey]: normalizedObjectives,
    blockers: blockers.length ? blockers : [capitalize(reason)],
    cadence: text(proposal.cadence ?? proposal.cadencia)
      || `Acompanhar ${item} e ${reason}${deadline ? ` até ${deadline}` : ""}.`,
    nextCommitment: text(proposal.nextCommitment ?? proposal.proximo_compromisso)
      || [capitalize(criterion), deadline ? `até ${deadline}` : ""].filter(Boolean).join(" "),
    focusPhrase: text(proposal.focusPhrase ?? proposal.frase_de_foco)
      || text(normalizedObjectives[0]?.result ?? normalizedObjectives[0]?.resultado),
  };
}
