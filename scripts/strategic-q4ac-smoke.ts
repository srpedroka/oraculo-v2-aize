import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;
const ACTIVITY_CHALLENGE_PATTERN = /\b(?:meio|atividade)\b|\b(?:qual|que)\s+(?:resultado|mudan[cç]a|efeito|impacto)\b|\b(?:precisa|deve|vai)\s+(?:produzir|gerar|mudar|melhorar)\b/i;
const GENERIC_FIELD_MENU_PATTERN = /\bo que destrava o avan[cç]o agora\b|\bfechar o resultado,?\s+o prazo,?\s+o respons[aá]vel\b/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AC");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2a-annual.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2A", 1, rubric, {
      runLabel: "q4ac",
      reportVersion: "2026-07-18.q4ac-annual-activity-challenge",
      ledgerLabel: "Q4AC",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const oracleReplies = (Array.isArray(report.transcript) ? report.transcript : [])
      .filter((turn: Record<string, unknown>) => text(turn.role) === "oracle")
      .map((turn: Record<string, unknown>) => text(turn.content));
    const activityReply = oracleReplies[1] ?? "";
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!ACTIVITY_CHALLENGE_PATTERN.test(activityReply) ? ["atividade anual nao foi confrontada como meio"] : []),
      ...(GENERIC_FIELD_MENU_PATTERN.test(activityReply) ? ["menu generico permaneceu na primeira decisao"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AC: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AC: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AC bloqueada: ${failures.join("; ")}`);
    console.log("Q4AC aprovada: atividade anual foi reenquadrada pelo resultado empresarial antes dos campos do plano.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
