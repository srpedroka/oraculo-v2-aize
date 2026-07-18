import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeMonthlyContinuity } from "../supabase/functions/_shared/monthly-continuity.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2C-MONTHLY-EXPERIENCED-MANAGER-004";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function q4amReportFailures(report: Record<string, any>) {
  const proposal = normalizeMonthlyContinuity(report.proposal ?? {}) as Record<string, any>;
  const objective = Array.isArray(proposal.objectives) ? proposal.objectives[0] ?? {} : {};
  const actions = Array.isArray(objective.actions) ? objective.actions : [];
  const transcript = Array.isArray(report.transcript) ? report.transcript : [];
  const partialActionIndex = transcript.findIndex((entry: Record<string, unknown>) =>
    text(entry.role) === "manager" && /acao um:[\s\S]*acao tres:/i.test(comparable(entry.content)));
  const nextOracle = partialActionIndex >= 0
    ? transcript.slice(partialActionIndex + 1).find((entry: Record<string, unknown>) => text(entry.role) === "oracle")
    : null;
  const nextOracleText = comparable(nextOracle?.content);
  const capacityChallenge = /capacidade|cabem|apertar|backlog/.test(nextOracleText);
  const repeatedFieldCollection = /para cada[\s\S]*(?:responsavel|dono)[\s\S]*criterio|quem[\s\S]*responsavel[\s\S]*criterio/.test(nextOracleText);
  const confirmationCount = transcript.filter((entry: Record<string, unknown>) =>
    text(entry.role) === "oracle" && /Posso gravar\?/i.test(text(entry.content))).length;
  const deterministicFailures = (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
    .filter((check: Record<string, unknown>) => text(check.status) === "fail")
    .map((check: Record<string, unknown>) => `check ${text(check.id) || "desconhecido"}`);
  const actionsComplete = actions.length === 3 && actions.every((action: Record<string, unknown>) =>
    text(action.description) && text(action.owner) && text(action.deadline) && text(action.completionCriterion));

  return [
    ...(text(report.qualityGate?.status) !== "approved" ? [`qualidade ${text(report.qualityGate?.status) || "ausente"}`] : []),
    ...deterministicFailures,
    ...(!comparable(objective.result).includes("40% para 55%") ? ["resultado mensal mensuravel ausente"] : []),
    ...(!actionsComplete ? ["tres acoes executaveis ausentes"] : []),
    ...(partialActionIndex < 0 ? ["bloco parcial de acoes ausente"] : []),
    ...(!capacityChallenge ? ["desafio de capacidade ausente depois da lista"] : []),
    ...(repeatedFieldCollection ? ["dono e criterio foram cobrados novamente depois da lista"] : []),
    ...(confirmationCount !== 1 ? [`confirmacoes finais ${confirmationCount} != 1`] : []),
    ...(!report.cleanup?.disposableOrganizationRemoved ? ["cleanup da empresa incompleto"] : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4amReportFailures(report);
  if (failures.length) throw new Error(`Q4AM bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AM aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AM");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2c-monthly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2C", 2, rubric, {
      runLabel: "q4am",
      reportVersion: "2026-07-18.q4am-monthly-experienced-capacity",
      ledgerLabel: "Q4AM",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4amReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AM: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AM: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AM bloqueada: ${failures.join("; ")}`);
    console.log("Q4AM aprovada: gestor experiente recebeu um desafio de capacidade e fechou sem cobranca repetida de campos.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
