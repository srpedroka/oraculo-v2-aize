import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-MISSING-BASELINE-005";
const ENVELOPE_REPAIR_REASONS = new Set([
  "invalid_json_envelope",
  "missing_adaptive_state",
  "incomplete_adaptive_state",
  "unverified_confirmed_facts",
]);

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AH");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 1, rubric, {
      runLabel: "q4ah",
      reportVersion: "2026-07-18.q4ah-structured-planning-contract",
      ledgerLabel: "Q4AH",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const generation = asRecord(asRecord(report.cost).generationUsage);
    const repairReasonCounts = asRecord(generation.adaptiveRepairReasonCounts);
    const envelopeRepairReasons = Object.entries(repairReasonCounts)
      .filter(([reason, count]) => ENVELOPE_REPAIR_REASONS.has(reason) && Number(count) > 0)
      .map(([reason]) => reason);
    const conduction = (asRecord(report.qualityGate).rubricScores ?? [])
      .find((entry: Record<string, unknown>) => entry.rubricId === "RUBRIC-CONDUCTION");
    const scopeCriterion = (conduction?.criterionRatings ?? [])
      .find((entry: Record<string, unknown>) => entry.criterionId === "COND-SCOPE-001");
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...(summary.qualityStatus !== "approved" ? [`qualidade ${summary.qualityStatus}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...envelopeRepairReasons.map((reason) => `reparo estrutural inesperado ${reason}`),
      ...(scopeCriterion?.source !== "deterministic" ? ["escopo nao veio do check deterministico"] : []),
      ...(scopeCriterion?.rating !== 4 ? [`nota deterministica de escopo ${scopeCriterion?.rating ?? "ausente"}`] : []),
      ...(!report.proposal ? ["proposta trimestral ausente"] : []),
    ];

    console.log(`Q4AH: chamadas de geracao ${Number(generation.callCount ?? 0)}; reparos estruturais ${envelopeRepairReasons.length}.`);
    console.log(`Q4AH: conducao ${summary.rubricScores.find((entry) => entry.rubricId === "RUBRIC-CONDUCTION")?.score ?? 0}; plano trimestral ${summary.rubricScores.find((entry) => entry.rubricId === "RUBRIC-QUARTERLY-PLAN")?.score ?? 0}.`);
    console.log(`Q4AH: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AH bloqueada: ${failures.join("; ")}`);
    console.log("Q4AH aprovada: envelope estruturado, escopo server-side e avaliacao objetiva funcionaram juntos.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
