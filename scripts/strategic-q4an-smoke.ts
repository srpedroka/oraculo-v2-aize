import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlanDocumentPreview } from "../supabase/functions/_shared/plan-documents.ts";
import { renderPlanForWhatsApp } from "../supabase/functions/_shared/plan-render.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2D-MONTH-CLOSE-PARTIAL-001";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function q4anReportFailures(report: Record<string, any>) {
  const proposal = report.proposal ?? {};
  const review = Array.isArray(proposal.reviews) ? proposal.reviews[0] ?? {} : {};
  const transcript = Array.isArray(report.transcript) ? report.transcript : [];
  const confirmationCount = transcript.filter((entry: Record<string, unknown>) =>
    text(entry.role) === "oracle" && /confirma gravar/i.test(text(entry.content))).length;
  const deterministicFailures = (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
    .filter((check: Record<string, unknown>) => text(check.status) === "fail")
    .map((check: Record<string, unknown>) => `check ${text(check.id) || "desconhecido"}`);
  const content = buildPlanDocumentPreview(proposal, {
    organizationName: "ORG_FIXTURE_A",
    areaName: "AREA_FIXTURE_A",
    managerName: "PERSON_FIXTURE_A",
    sessionId: "SESSION_FIXTURE_A",
    sessionType: "month_close",
    period: "Jun 2027",
  }) as any;
  const objective = content?.objetivos?.[0] ?? {};
  const whatsapp = content ? renderPlanForWhatsApp(content, { version: 1, origin: "session" }) : "";

  return [
    ...(text(report.qualityGate?.status) !== "approved" ? [`qualidade ${text(report.qualityGate?.status) || "ausente"}`] : []),
    ...deterministicFailures,
    ...(text(review.current) !== "50%" || text(review.achieved) !== "50%" ? ["atingido operacional 50% ausente"] : []),
    ...(text(review.baseline) !== "40%" || text(review.target) !== "60%" ? ["baseline 40% ou meta 60% ausente"] : []),
    ...(text(review.verdict) !== "partial" ? ["veredito parcial ausente"] : []),
    ...(!text(review.metric) || !text(review.owner) || !text(review.deadline) || !text(review.source)
      ? ["metadados do objetivo mensal incompletos"]
      : []),
    ...(text(objective.atual) !== "40%" || text(objective.atingido) !== "50%" || text(objective.veredito) !== "partial"
      ? ["documento canonico confundiu baseline, atingido ou veredito"]
      : []),
    ...(!whatsapp.includes("Baseline: 40%") || !whatsapp.includes("Atingido: 50%") || !whatsapp.includes("Veredito: partial")
      ? ["WhatsApp nao preservou baseline, atingido e veredito"]
      : []),
    ...(whatsapp.includes("Baseline: 50%") ? ["WhatsApp rotulou atingido como baseline"] : []),
    ...(confirmationCount !== 1 ? [`confirmacoes finais ${confirmationCount} != 1`] : []),
    ...(!report.cleanup?.disposableOrganizationRemoved ? ["cleanup da empresa incompleto"] : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4anReportFailures(report);
  if (failures.length) throw new Error(`Q4AN bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AN aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AN");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2d-reviews.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2D", 1, rubric, {
      runLabel: "q4an",
      reportVersion: "2026-07-18.q4an-close-baseline-achieved-verdict",
      ledgerLabel: "Q4AN",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4anReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AN: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AN: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AN bloqueada: ${failures.join("; ")}`);
    console.log("Q4AN aprovada: fechamento preservou baseline, atingido, veredito e metadados em banco, documento e WhatsApp.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
