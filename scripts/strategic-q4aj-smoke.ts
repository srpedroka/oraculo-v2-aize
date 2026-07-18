import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlanDocumentPreview } from "../supabase/functions/_shared/plan-documents.ts";
import { renderPlanForWhatsApp } from "../supabase/functions/_shared/plan-render.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import { q4aiReportFailures } from "./strategic-q4ai-smoke.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function readableRiskFailures(proposal: Record<string, any> | null) {
  if (!proposal) return ["proposta trimestral ausente"];
  const risks = Array.isArray(proposal.risks) ? proposal.risks : [];
  const content = buildPlanDocumentPreview(proposal, {
    organizationName: "ORG_FIXTURE_A",
    areaName: "AREA_FIXTURE_A",
    managerName: "PERSON_FIXTURE_A",
    sessionType: "quarterly",
    period: "T3 2027",
  });
  const whatsapp = content ? renderPlanForWhatsApp(content, { version: 1, origin: "session" }) : "";
  const serialized = JSON.stringify({ proposal, content, whatsapp });

  return [
    ...(risks.length === 0 ? ["risco trimestral ausente"] : []),
    ...(risks.some((risk) => typeof risk !== "string") ? ["risco estruturado nao normalizado"] : []),
    ...(!risks.some((risk) => /ades[aã]o/i.test(text(risk)))
      ? ["risco perdeu fidelidade"]
      : []),
    ...(!content ? ["documento canonico ausente"] : []),
    ...(serialized.includes("[object Object]") ? ["saida derivada contem [object Object]"] : []),
  ];
}

export function q4ajReportFailures(report: Record<string, any>) {
  return [
    ...q4aiReportFailures(report),
    ...readableRiskFailures(report.proposal ?? null),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4ajReportFailures(report);
  if (failures.length) throw new Error(`Q4AJ bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AJ aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AJ");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 2, rubric, {
      runLabel: "q4aj",
      reportVersion: "2026-07-18.q4aj-readable-structured-risks",
      ledgerLabel: "Q4AJ",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4ajReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AJ: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AJ: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AJ bloqueada: ${failures.join("; ")}`);
    console.log("Q4AJ aprovada: risco e mitigacao permaneceram legiveis na proposta, no documento e no WhatsApp.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
