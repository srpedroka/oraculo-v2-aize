const Q4D_CRITERIA = new Set([
  "COND-SCOPE-001",
  "COND-DIAGNOSIS-001",
  "COND-QUESTIONS-001",
  "COND-CHALLENGE-001",
  "COND-NATURALNESS-001",
  "COND-FIDELITY-001",
  "COND-CLOSURE-001",
]);

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function q4dJudgeRubric(source: unknown) {
  const rubric = asRecord(source);
  const conductionSource = asRecord((Array.isArray(rubric.rubrics) ? rubric.rubrics : [])
    .find((item: any) => item?.id === "RUBRIC-CONDUCTION"));
  const selectedCriteria = (Array.isArray(conductionSource.criteria) ? conductionSource.criteria : [])
    .map(asRecord)
    .filter((item) => Q4D_CRITERIA.has(String(item.id ?? "")));
  const selectedWeight = selectedCriteria.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
  if (!selectedCriteria.length || selectedWeight <= 0) throw new Error("Rubrica Q4D sem critérios ou pesos aplicáveis");
  const criteria = selectedCriteria.map((item) => ({
    ...item,
    weight: Number(((Number(item.weight) / selectedWeight) * 100).toFixed(8)),
  }));
  const humanCritical = (Array.isArray(rubric.criticalFailures) ? rubric.criticalFailures : [])
    .filter((item: any) => item?.checkType === "human");
  return { rubrics: [{ ...conductionSource, criteria }], criticalFailures: humanCritical };
}
