import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";

const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

export async function main() {
  const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2a-annual.json")) as ReferenceCaseBlock;
  const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
  const failures: string[] = [];
  let totalCostUsd = 0;

  for (const item of block.cases) {
    const summary = await executeCase(item, "Q2A", 1, rubric, {
      runLabel: "q4h",
      reportVersion: "2026-07-17.q4h-smoke",
      ledgerLabel: "Q4H",
    });
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    totalCostUsd += summary.generationCostUsd + summary.judgeCostUsd;
    const caseFailures = [
      ...(summary.status !== "measured" ? [`${item.caseId}: execução ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `${item.caseId}: check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `${item.caseId}: falha crítica ${failure}`),
      ...requiredScores
        .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${item.caseId}: ${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE
        ? [`${item.caseId}: média conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
        : []),
    ];
    failures.push(...caseFailures);
    console.log(`Q4H ${item.caseId}: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; média ${jointAverage.toFixed(2)}.`);
    if (caseFailures.length) throw new Error(`Q4H bloqueada: ${caseFailures.join("; ")}`);
  }

  console.log(`Q4H: custo total do smoke anual US$ ${totalCostUsd.toFixed(6)}.`);
  if (failures.length) throw new Error(`Q4H bloqueada: ${failures.join("; ")}`);
  console.log("Q4H aprovada: os cinco riscos anuais passaram os limites, sem falha crítica, check reprovado ou resíduo descartável.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
