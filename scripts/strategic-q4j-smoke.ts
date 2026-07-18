import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";

const CASE_ID = "Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

export async function main() {
  const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
  const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
  const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
  if (!item) throw new Error(`caso exato ${CASE_ID} nao encontrado`);

  const summary = await executeCase(item, "Q2B", 1, rubric, {
    runLabel: "q4j",
    reportVersion: "2026-07-17.q4j-smoke",
    ledgerLabel: "Q4J",
  });
  const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
  const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
  const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
  const failures = [
    ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
    ...summary.failedChecks.map((check) => `check ${check}`),
    ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
    ...requiredScores
      .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
      .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
    ...(jointAverage < MINIMUM_JOINT_AVERAGE
      ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
      : []),
  ];

  console.log(`Q4J: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
  console.log(`Q4J: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
  if (failures.length) throw new Error(`Q4J bloqueada: ${failures.join("; ")}`);
  console.log("Q4J aprovada: CRM permaneceu acao, o pai anual canonico foi reutilizado e nenhum gate ou cleanup falhou.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
