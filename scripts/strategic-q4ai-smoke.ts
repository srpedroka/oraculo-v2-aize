import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function q4aiReportFailures(report: Record<string, any>) {
  const transcript = Array.isArray(report.transcript) ? report.transcript as Array<Record<string, unknown>> : [];
  const completeBlockIndex = transcript.findIndex((turn) => text(turn.role) === "manager"
    && /Dados concretos adicionais confirmados/i.test(text(turn.content)));
  const confirmationIndex = transcript.findIndex((turn) => text(turn.role) === "oracle"
    && /Posso gravar\?/i.test(text(turn.content)));
  const nextOracleReply = completeBlockIndex >= 0
    ? text(transcript.slice(completeBlockIndex + 1).find((turn) => text(turn.role) === "oracle")?.content)
    : "";
  const hasContinuationTurn = transcript.some((turn) => text(turn.role) === "manager"
    && /Continue com a proxima pergunta|apresente agora a proposta/i.test(text(turn.content)));
  const deterministicFailures = (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
    .filter((check: Record<string, unknown>) => text(check.status) !== "pass")
    .map((check: Record<string, unknown>) => `check ${text(check.id) || "desconhecido"}`);

  return [
    ...(text(report.qualityGate?.status) !== "approved" ? [`qualidade ${text(report.qualityGate?.status) || "ausente"}`] : []),
    ...deterministicFailures,
    ...(!report.proposal ? ["proposta trimestral ausente"] : []),
    ...(confirmationIndex < 0 ? ["confirmacao final ausente"] : []),
    ...(completeBlockIndex >= 0 && !/Posso gravar\?/i.test(nextOracleReply)
      ? ["bloco completo nao seguiu direto para confirmacao"]
      : []),
    ...(/evid[eê]ncia intermedi[aá]ria/i.test(nextOracleReply) ? ["pergunta redundante de evidencia intermediaria"] : []),
    ...(hasContinuationTurn ? ["gestor precisou pedir novamente a sintese"] : []),
    ...(!report.cleanup?.disposableOrganizationRemoved ? ["cleanup da empresa incompleto"] : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4aiReportFailures(report);
  if (failures.length) throw new Error(`Q4AI bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AI aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AI");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 2, rubric, {
      runLabel: "q4ai",
      reportVersion: "2026-07-18.q4ai-quarterly-ready-without-bureaucracy",
      ledgerLabel: "Q4AI",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4aiReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AI: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AI: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AI bloqueada: ${failures.join("; ")}`);
    console.log("Q4AI aprovada: bloco trimestral completo e testado seguiu direto para uma unica confirmacao.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
