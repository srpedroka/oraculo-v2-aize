import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2A-ANNUAL-EXPERIENCED-OWNER-005";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;
const CONCRETE_BLOCK_REQUEST_PATTERN = /\b(?:estrutura|dados)\b[\s\S]{0,180}\b(?:valores|conte[uú]do|bloco)\b|\bbloco completo\b/i;
const INTERVIEW_RESTART_PATTERN = /\bqual\s+(?:(?:e|é)\s+)?(?:a |o )?(?:principal dor|prop[oó]sito|vis[aã]o|valores?)\b/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AD");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2a-annual.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2A", 1, rubric, {
      runLabel: "q4ad",
      reportVersion: "2026-07-18.q4ad-experienced-owner-no-reinterview",
      ledgerLabel: "Q4AD",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const oracleReplies = (Array.isArray(report.transcript) ? report.transcript : [])
      .filter((turn: Record<string, unknown>) => text(turn.role) === "oracle")
      .map((turn: Record<string, unknown>) => text(turn.content));
    const afterStructuralBlock = oracleReplies[2] ?? "";
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!CONCRETE_BLOCK_REQUEST_PATTERN.test(afterStructuralBlock) ? ["bloco estrutural nao recebeu pedido concreto"] : []),
      ...(INTERVIEW_RESTART_PATTERN.test(afterStructuralBlock) ? ["entrevista anual foi reiniciada"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AD: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AD: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AD bloqueada: ${failures.join("; ")}`);
    console.log("Q4AD aprovada: owner experiente recebe somente o pedido do bloco concreto, sem reinicio da entrevista.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
