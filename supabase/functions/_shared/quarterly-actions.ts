type QuarterlyActionEntry = {
  action: Record<string, unknown>;
  objectiveIndex: number;
  shared: boolean;
};

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
    .replace(/\s+/g, " ");
}

export function quarterlyActionSignature(value: unknown) {
  const action = asRecord(value);
  return [
    action.description ?? action.descricao,
    action.owner ?? action.responsavel,
    action.deadline ?? action.prazo,
    action.completionCriterion ?? action.completion_criterion ?? action.criterio,
  ].map(comparable).join("|");
}

export function normalizeQuarterlySharedActions(proposalValue: unknown) {
  const proposal = asRecord(proposalValue);
  if (text(proposal.type) !== "save_quarterly_plan") return proposalValue;

  const objectiveKey = Array.isArray(proposal.quarterlyObjectives)
    ? "quarterlyObjectives"
    : "objetivos_trimestre";
  const objectives = asArray(proposal[objectiveKey]).map(asRecord);
  const explicitShared = asArray(proposal.sharedActions ?? proposal.acoesTransversais).map(asRecord);
  if (objectives.length < 2 && !explicitShared.length) return proposalValue;

  const occurrences = new Map<string, { action: Record<string, unknown>; objectiveIndexes: Set<number> }>();
  objectives.forEach((objective, objectiveIndex) => {
    asArray(objective.actions ?? objective.acoes).map(asRecord).forEach((action) => {
      const signature = quarterlyActionSignature(action);
      if (!signature.replace(/\|/g, "")) return;
      const existing = occurrences.get(signature) ?? { action, objectiveIndexes: new Set<number>() };
      existing.objectiveIndexes.add(objectiveIndex);
      occurrences.set(signature, existing);
    });
  });

  const sharedSignatures = new Set(
    [...occurrences.entries()]
      .filter(([, occurrence]) => objectives.length > 1 && occurrence.objectiveIndexes.size === objectives.length)
      .map(([signature]) => signature),
  );
  const sharedActions: Record<string, unknown>[] = [];
  const seenShared = new Set<string>();
  for (const action of [...explicitShared, ...[...sharedSignatures].map((signature) => occurrences.get(signature)?.action ?? {})]) {
    const signature = quarterlyActionSignature(action);
    if (!signature.replace(/\|/g, "") || seenShared.has(signature)) continue;
    seenShared.add(signature);
    sharedActions.push(action);
  }

  if (!sharedActions.length) return proposalValue;
  const normalizedObjectives = objectives.map((objective) => {
    const actionKey = Array.isArray(objective.actions) ? "actions" : "acoes";
    const actions = asArray(objective[actionKey]).map(asRecord)
      .filter((action) => !seenShared.has(quarterlyActionSignature(action)));
    return { ...objective, [actionKey]: actions };
  });

  return {
    ...proposal,
    [objectiveKey]: normalizedObjectives,
    sharedActions,
  };
}

export function uniqueQuarterlyActionEntries(proposalValue: unknown): QuarterlyActionEntry[] {
  const normalized = asRecord(normalizeQuarterlySharedActions(proposalValue));
  const objectives = asArray(normalized.quarterlyObjectives ?? normalized.objetivos_trimestre).map(asRecord);
  const candidates: QuarterlyActionEntry[] = [
    ...asArray(normalized.sharedActions ?? normalized.acoesTransversais)
      .map(asRecord)
      .map((action) => ({ action, objectiveIndex: 0, shared: true })),
    ...objectives.flatMap((objective, objectiveIndex) =>
      asArray(objective.actions ?? objective.acoes)
        .map(asRecord)
        .map((action) => ({ action, objectiveIndex, shared: false }))),
  ];
  const seen = new Set<string>();
  return candidates.filter((entry) => {
    const signature = quarterlyActionSignature(entry.action);
    if (!signature.replace(/\|/g, "") || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
