import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { quarterlyKpiLinks } from "../supabase/functions/_shared/quarterly-kpis.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import { q4ajReportFailures } from "./strategic-q4aj-smoke.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

export function q4akReportFailures(report: Record<string, any>) {
  const links = quarterlyKpiLinks(report.proposal ?? null);
  const transcript = Array.isArray(report.transcript) ? report.transcript : [];
  const confirmation = transcript
    .filter((turn: Record<string, unknown>) => String(turn.role ?? "") === "oracle")
    .map((turn: Record<string, unknown>) => String(turn.content ?? ""))
    .find((content: string) => /Posso gravar\?/i.test(content)) ?? "";
  return [
    ...q4ajReportFailures(report),
    ...(links.length ? ["proposta preservou KPI sem escolha explicita"] : []),
    ...(/Hip[oó]tese de impacto confirmada|Margem operacional/i.test(confirmation)
      ? ["confirmacao exibiu KPI nao escolhido"]
      : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4akReportFailures(report);
  if (failures.length) throw new Error(`Q4AK bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AK aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AK");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 2, rubric, {
      runLabel: "q4ak",
      reportVersion: "2026-07-18.q4ak-explicit-kpi-choice",
      ledgerLabel: "Q4AK",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4akReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AK: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AK: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AK bloqueada: ${failures.join("; ")}`);
    console.log("Q4AK aprovada: nenhum KPI foi gravado ou exibido sem escolha explicita do gestor.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
