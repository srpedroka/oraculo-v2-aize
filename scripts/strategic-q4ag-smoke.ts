import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-MISSING-BASELINE-005";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;
const GENERIC_AFTER_CHALLENGE_PATTERN = /j[aá] temos uma parte importante definida|o que destrava o avan[cç]o agora/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AG");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 1, rubric, {
      runLabel: "q4ag",
      reportVersion: "2026-07-18.q4ag-deferred-quarterly-proposal",
      ledgerLabel: "Q4AG",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const oracleReplies = (Array.isArray(report.transcript) ? report.transcript : [])
      .filter((turn: Record<string, unknown>) => text(turn.role) === "oracle")
      .map((turn: Record<string, unknown>) => text(turn.content));
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(oracleReplies.some((reply) => GENERIC_AFTER_CHALLENGE_PATTERN.test(reply)) ? ["pergunta generica depois do desafio"] : []),
      ...(!report.proposal ? ["proposta trimestral ausente"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AG: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AG: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AG bloqueada: ${failures.join("; ")}`);
    console.log("Q4AG aprovada: proposta trimestral preservada fecha sem pergunta extra depois do desafio.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
