import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { uniqueQuarterlyActionEntries } from "../supabase/functions/_shared/quarterly-actions.ts";

const CASE_ID = "Q2B-QUARTERLY-PRIORITY-OVERLOAD-006";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function main() {
  const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
  const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
  const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
  if (!item) throw new Error(`caso exato ${CASE_ID} nao encontrado`);

  const summary = await executeCase(item, "Q2B", 2, rubric, {
    runLabel: "q4s",
    reportVersion: "2026-07-18.q4s-shared-actions",
    ledgerLabel: "Q4S",
  });
  const report = await readJson(summary.reportPath) as Record<string, any>;
  const proposal = report.proposal ?? {};
  const objectives = Array.isArray(proposal.quarterlyObjectives) ? proposal.quarterlyObjectives : [];
  const rawActionCount = (Array.isArray(proposal.sharedActions) ? proposal.sharedActions.length : 0)
    + objectives.reduce((sum: number, objective: any) => sum + (Array.isArray(objective.actions) ? objective.actions.length : 0), 0);
  const uniqueActions = uniqueQuarterlyActionEntries(proposal);
  const lastOracleReply = [...(Array.isArray(report.transcript) ? report.transcript : [])]
    .reverse()
    .find((entry: any) => entry.role === "oracle")?.content ?? "";
  const duplicatedDescriptions = uniqueActions
    .map(({ action }) => text(action.description ?? action.descricao))
    .filter((description) => description && lastOracleReply.split(description).length - 1 !== 1);
  const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
  const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
  const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
  const failures = [
    ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
    ...summary.failedChecks.map((check) => `check ${check}`),
    ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
    ...(rawActionCount !== uniqueActions.length ? [`acoes repetidas ${rawActionCount}/${uniqueActions.length}`] : []),
    ...(uniqueActions.length !== 2 ? [`acoes materiais ${uniqueActions.length} != 2`] : []),
    ...duplicatedDescriptions.map((description) => `resumo nao exibe uma vez: ${description}`),
    ...requiredScores
      .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
      .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
    ...(jointAverage < MINIMUM_JOINT_AVERAGE
      ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
      : []),
  ];

  console.log(`Q4S: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
  console.log(`Q4S: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
  if (failures.length) throw new Error(`Q4S bloqueada: ${failures.join("; ")}`);
  console.log("Q4S aprovada: as duas acoes transversais foram resumidas e estruturadas uma unica vez para os tres resultados.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
