import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeMonthlyContinuity } from "../supabase/functions/_shared/monthly-continuity.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2C-MONTHLY-INHERITED-PENDING-002";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function q4alReportFailures(report: Record<string, any>) {
  const proposal = normalizeMonthlyContinuity(report.proposal ?? {}) as Record<string, any>;
  const objective = Array.isArray(proposal.objectives) ? proposal.objectives[0] ?? {} : {};
  const action = Array.isArray(objective.actions) ? objective.actions[0] ?? {} : {};
  const pending = Array.isArray(proposal.pendingDecisions) ? proposal.pendingDecisions[0] ?? {} : {};
  const transcript = Array.isArray(report.transcript) ? report.transcript : [];
  const confirmationCount = transcript.filter((entry: Record<string, unknown>) =>
    text(entry.role) === "oracle" && /Posso gravar\?/i.test(text(entry.content))).length;
  const managerContinuation = transcript.some((entry: Record<string, unknown>) =>
    text(entry.role) === "manager" && /continue com a proxima|apresente agora a proposta/i.test(text(entry.content)));
  const deterministicFailures = (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
    .filter((check: Record<string, unknown>) => text(check.status) === "fail")
    .map((check: Record<string, unknown>) => `check ${text(check.id) || "desconhecido"}`);

  return [
    ...(text(report.qualityGate?.status) !== "approved" ? [`qualidade ${text(report.qualityGate?.status) || "ausente"}`] : []),
    ...deterministicFailures,
    ...(!comparable(objective.result).includes("40% para 55%") ? ["resultado mensal mensuravel ausente"] : []),
    ...(text(pending.origin) !== "Jun 2027" || text(pending.decision) !== "roll" ? ["origem ou decisao herdada ausente"] : []),
    ...(!comparable(pending.reason).includes("dependencia do fornecedor") ? ["motivo herdado ausente"] : []),
    ...(text(action.deadline) !== "2027-07-20" || !text(action.completionCriterion) ? ["prazo ou criterio da acao ausente"] : []),
    ...(confirmationCount !== 1 ? [`confirmacoes finais ${confirmationCount} != 1`] : []),
    ...(managerContinuation ? ["gestor precisou pedir novamente a proposta"] : []),
    ...(!report.cleanup?.disposableOrganizationRemoved ? ["cleanup da empresa incompleto"] : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4alReportFailures(report);
  if (failures.length) throw new Error(`Q4AL bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AL aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AL");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2c-monthly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2C", 2, rubric, {
      runLabel: "q4al",
      reportVersion: "2026-07-18.q4al-monthly-inherited-ready",
      ledgerLabel: "Q4AL",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4alReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AL: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AL: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AL bloqueada: ${failures.join("; ")}`);
    console.log("Q4AL aprovada: a pendencia completa virou proposta com uma confirmacao, sem repetir pergunta de acao.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
