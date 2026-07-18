import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;
const REDUNDANT_BLOCK_REQUEST_PATTERN = /\bvalores concretos dos objetivos e projetos ainda n[aã]o vieram\b|\bpode enviar esse bloco completo\b/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AF");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2a-annual.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2A", 2, rubric, {
      runLabel: "q4af",
      reportVersion: "2026-07-18.q4af-explicit-portfolio-count",
      ledgerLabel: "Q4AF",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const oracleReplies = (Array.isArray(report.transcript) ? report.transcript : [])
      .filter((turn: Record<string, unknown>) => text(turn.role) === "oracle")
      .map((turn: Record<string, unknown>) => text(turn.content));
    const projects = Array.isArray(report.proposal?.projects) ? report.proposal.projects : [];
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(oracleReplies.some((reply) => REDUNDANT_BLOCK_REQUEST_PATTERN.test(reply)) ? ["bloco completo foi pedido novamente"] : []),
      ...(!report.proposal ? ["proposta anual ausente"] : []),
      ...(projects.length !== 4 ? [`portfolio ${projects.length} != 4`] : []),
      ...(!projects.some((project: Record<string, unknown>) => /sistema de gest[aã]o/i.test(text(project.name)))
        ? ["projeto do sistema ausente"]
        : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AF: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AF: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AF bloqueada: ${failures.join("; ")}`);
    console.log("Q4AF aprovada: contagem explicita e portfolio anual coerente sem reentrevista.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
