function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

export function normalizeRisk(value: unknown) {
  const direct = text(value);
  if (direct) return direct;

  const risk = asRecord(value);
  const description = text(risk.description ?? risk.descricao ?? risk.risk ?? risk.risco ?? risk.title ?? risk.titulo);
  const mitigation = text(risk.mitigation ?? risk.mitigacao ?? risk.response ?? risk.resposta ?? risk.action ?? risk.acao);
  if (description && mitigation) return `${description} (mitigação: ${mitigation})`;
  if (description) return description;
  if (mitigation) return `Mitigação: ${mitigation}`;
  return "";
}

export function normalizeRiskList(...values: unknown[]) {
  for (const value of values) {
    const candidates = Array.isArray(value) ? value : value == null ? [] : [value];
    const normalized = candidates.map(normalizeRisk).filter(Boolean);
    if (normalized.length) return normalized.slice(0, 8);
  }
  return [];
}
