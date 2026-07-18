type SessionEnvelope = {
  proposal?: unknown;
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function withoutModelOwnedScope(value: Record<string, unknown>) {
  const copy = { ...value };
  for (const key of ["orgId", "org_id", "areaId", "area_id", "userId", "user_id", "sessionId", "session_id"]) {
    delete copy[key];
  }
  return copy;
}

function canonicalObjectives(value: unknown, period: string) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => ({ ...asRecord(item), period }));
}

export function canonicalizePlanningEnvelopeScope(input: {
  envelope: SessionEnvelope;
  sessionType: string;
  sessionPeriod: string;
}) {
  const proposal = asRecord(input.envelope.proposal);
  if (!Object.keys(proposal).length) return input.envelope;

  const scoped = withoutModelOwnedScope(proposal);
  if (input.sessionType === "strategic") {
    const year = input.sessionPeriod.match(/\b20\d{2}\b/)?.[0] ?? input.sessionPeriod;
    scoped.year = Number(year);
    scoped.objectives = canonicalObjectives(scoped.objectives, year);
  } else if (input.sessionType === "quarterly") {
    scoped.period = input.sessionPeriod;
    scoped.quarterlyObjectives = canonicalObjectives(scoped.quarterlyObjectives, input.sessionPeriod);
  } else if (input.sessionType === "monthly") {
    scoped.period = input.sessionPeriod;
    scoped.objectives = canonicalObjectives(scoped.objectives, input.sessionPeriod);
  } else if (["month_close", "quarter_close", "strategic_review"].includes(input.sessionType)) {
    scoped.period = input.sessionPeriod;
  }

  return { ...input.envelope, proposal: scoped };
}
