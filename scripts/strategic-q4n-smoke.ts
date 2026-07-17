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

  const summary = await executeCase(item, "Q2B", 2, rubric, {
    runLabel: "q4n",
    reportVersion: "2026-07-17.q4n-smoke",
    ledgerLabel: "Q4N",
  });
  const report = await readJson(summary.reportPath) as Record<string, any>;
  const generationUsage = report.cost?.generationUsage ?? {};
  const completeBlockRepairCalls = Number(
    generationUsage.adaptiveRepairReasonCounts?.quarterly_complete_block_unchallenged ?? 0,
  );
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
    ...(completeBlockRepairCalls > 0
      ? [`segunda chamada por quarterly_complete_block_unchallenged: ${completeBlockRepairCalls}`]
      : []),
  ];

  console.log(`Q4N: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
  console.log(`Q4N: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
  console.log(`Q4N: ${Number(generationUsage.callCount ?? 0)} chamada(s) de planejamento; reparos do bloco completo ${completeBlockRepairCalls}.`);
  if (failures.length) throw new Error(`Q4N bloqueada: ${failures.join("; ")}`);
  console.log("Q4N aprovada: o CRM foi reenquadrado como meio, recebeu o desafio estrategico sem segunda chamada e terminou com uma confirmacao.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
