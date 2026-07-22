export type PlanningSituation = {
  kind: string;
  facts: Record<string, unknown>;
  decision: string;
  authoritative: {
    state_patch: Record<string, unknown>;
    next_phase: string;
    proposal?: unknown;
    done?: boolean;
  };
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function planningSituation(input: PlanningSituation): PlanningSituation {
  return input;
}

export function planningSituationFromEnvelope(
  kind: string,
  facts: Record<string, unknown>,
  decision: string,
  envelope: unknown,
): PlanningSituation {
  const value = asRecord(envelope);
  const authoritative: PlanningSituation["authoritative"] = {
    state_patch: asRecord(value.state_patch),
    next_phase: String(value.next_phase ?? ""),
    done: false,
  };
  if (Object.prototype.hasOwnProperty.call(value, "proposal")) {
    authoritative.proposal = value.proposal;
  }
  return planningSituation({ kind, facts, decision, authoritative });
}

export function planningSituationPrompt(situation: PlanningSituation | null) {
  if (!situation) return "";
  return [
    "SITUACAO DETECTADA PELO SISTEMA:",
    JSON.stringify({ kind: situation.kind, facts: situation.facts, decision: situation.decision }, null, 2),
    "Os fatos e a decisao acima sao canonicos. Formule a resposta com voz propria, ligada ao que a pessoa disse e sem mencionar a deteccao tecnica. Nao invente nem altere fatos. Quando a decisao exigir uma pergunta ou confirmacao, faca exatamente uma pergunta visivel. O servidor aplicara estado, fase e proposta por conta propria; concentre-se em escrever uma reply natural.",
  ].join("\n\n");
}

export function applyPlanningSituation(envelope: unknown, situation: PlanningSituation | null) {
  const value = asRecord(envelope);
  if (!situation) return value;
  const result: Record<string, unknown> = {
    ...value,
    state_patch: situation.authoritative.state_patch,
    next_phase: situation.authoritative.next_phase,
    done: situation.authoritative.done ?? false,
    proposal: null,
  };
  if (Object.prototype.hasOwnProperty.call(situation.authoritative, "proposal")) {
    result.proposal = situation.authoritative.proposal ?? null;
  }
  return result;
}

export function legacyEnvelopeFromSituation(situation: PlanningSituation | null, reply: string) {
  if (!situation) return null;
  const result: Record<string, unknown> = {
    reply,
    state_patch: situation.authoritative.state_patch,
    next_phase: situation.authoritative.next_phase,
    done: situation.authoritative.done ?? false,
  };
  if (Object.prototype.hasOwnProperty.call(situation.authoritative, "proposal")) {
    result.proposal = situation.authoritative.proposal;
  }
  return result;
}
