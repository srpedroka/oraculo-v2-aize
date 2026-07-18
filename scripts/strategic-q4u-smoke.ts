import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";
import { normalizeMonthlyContinuity } from "../supabase/functions/_shared/monthly-continuity.ts";

const CASE_ID = "Q2C-MONTHLY-INHERITED-PENDING-002";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4U");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2c-monthly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso exato ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2C", 1, rubric, {
      runLabel: "q4u",
      reportVersion: "2026-07-18.q4u-monthly-continuity",
      ledgerLabel: "Q4U",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const proposal = normalizeMonthlyContinuity(report.proposal ?? {}) as Record<string, any>;
    const objective = Array.isArray(proposal.objectives) ? proposal.objectives[0] ?? {} : {};
    const pending = Array.isArray(proposal.pendingDecisions) ? proposal.pendingDecisions[0] ?? {} : {};
    const finalReply = [...(Array.isArray(report.transcript) ? report.transcript : [])]
      .reverse()
      .find((entry: any) => entry.role === "oracle")?.content ?? "";
    const normalizedReply = comparable(finalReply);
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!comparable(objective.result).includes("40% para 55%") ? ["resultado mensal mensuravel ausente"] : []),
      ...(comparable(objective.result) === comparable(pending.item) ? ["pendencia ainda tratada como resultado"] : []),
      ...(text(pending.origin) !== "Jun 2027" || text(pending.decision) !== "roll" ? ["origem ou decisao herdada ausente"] : []),
      ...(!text(proposal.cadence) || !text(proposal.nextCommitment) ? ["acompanhamento ou compromisso seguinte ausente"] : []),
      ...(!normalizedReply.includes("jun 2027") || !normalizedReply.includes("dependencia do fornecedor") || !normalizedReply.includes("2027-07-20")
        ? ["resumo final omite origem, motivo ou novo prazo"]
        : []),
      ...requiredScores
        .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE
        ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
        : []),
    ];

    console.log(`Q4U: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4U: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4U bloqueada: ${failures.join("; ")}`);
    console.log("Q4U aprovada: a pendencia permaneceu rastreavel como acao e o plano destacou resultado, acompanhamento e proximo compromisso.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
