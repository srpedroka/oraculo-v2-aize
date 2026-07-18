import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;
const GENERIC_CRITERION_PATTERN = /^(?:realizad[ao]|feit[ao]|conclu[ií]d[ao]|finalizad[ao])(?:\s+com\s+sucesso)?[.!]?$/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function proposalActions(proposalValue: unknown) {
  const proposal = asRecord(proposalValue);
  const objectives = Array.isArray(proposal.quarterlyObjectives) ? proposal.quarterlyObjectives.map(asRecord) : [];
  const objectiveActions = objectives.flatMap((objective) => Array.isArray(objective.actions) ? objective.actions.map(asRecord) : []);
  const sharedActions = Array.isArray(proposal.sharedActions) ? proposal.sharedActions.map(asRecord) : [];
  return [...objectiveActions, ...sharedActions];
}

export function q4apReportFailures(report: Record<string, any>) {
  const transcript = Array.isArray(report.transcript) ? report.transcript as Array<Record<string, unknown>> : [];
  const partialBlockIndex = transcript.findIndex((turn) => text(turn.role) === "manager"
    && /Informacoes confirmadas para este caso sintetico/i.test(text(turn.content)));
  const challengeIndex = partialBlockIndex < 0 ? -1 : transcript.findIndex((turn, index) => index > partialBlockIndex
    && text(turn.role) === "oracle");
  const challenge = challengeIndex < 0 ? "" : text(transcript[challengeIndex].content);
  const completeBlockIndex = transcript.findIndex((turn, index) => index > challengeIndex
    && text(turn.role) === "manager"
    && /Dados concretos adicionais confirmados/i.test(text(turn.content)));
  const confirmations = transcript.filter((turn) => text(turn.role) === "oracle" && /Posso gravar\?/i.test(text(turn.content)));
  const actions = proposalActions(report.proposal);
  const deterministicFailures = (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
    .filter((check: Record<string, unknown>) => text(check.status) === "fail")
    .map((check: Record<string, unknown>) => `check ${text(check.id) || "desconhecido"}`);

  return [
    ...(text(report.qualityGate?.status) !== "approved" ? [`qualidade ${text(report.qualityGate?.status) || "ausente"}`] : []),
    ...deterministicFailures,
    ...(partialBlockIndex < 0 ? ["bloco parcial das acoes ausente"] : []),
    ...(challengeIndex < 0 ? ["desafio executivo ausente depois do bloco parcial"] : []),
    ...(!/capacidade|risco/i.test(challenge) || !/meta|resultado/i.test(challenge)
      ? ["desafio nao testa capacidade, risco e impacto na meta"]
      : []),
    ...(!/respons[aá]vel/i.test(challenge) || !/crit[eé]rio de conclus[aã]o/i.test(challenge)
      ? ["desafio nao pede os dados de acao que faltavam"]
      : []),
    ...((challenge.match(/\?/g) ?? []).length !== 1 ? ["desafio nao possui uma unica pergunta visivel"] : []),
    ...(completeBlockIndex < 0 ? ["complemento concreto nao foi solicitado antes da proposta"] : []),
    ...(confirmations.length !== 1 ? [`confirmacoes finais ${confirmations.length} em vez de 1`] : []),
    ...(!report.proposal ? ["proposta trimestral ausente"] : []),
    ...(actions.length < 2 ? ["acoes trimestrais ausentes"] : []),
    ...(actions.some((action) => !text(action.description) || !text(action.owner) || !text(action.deadline) || !text(action.completionCriterion))
      ? ["acao sem descricao, responsavel, prazo ou criterio"]
      : []),
    ...(actions.some((action) => GENERIC_CRITERION_PATTERN.test(text(action.completionCriterion)))
      ? ["criterio de conclusao generico permaneceu na proposta"]
      : []),
    ...(!report.cleanup?.disposableOrganizationRemoved ? ["cleanup da empresa incompleto"] : []),
  ];
}

async function validateExistingReport(reportPath: string) {
  const report = await readJson(resolve(reportPath)) as Record<string, any>;
  const failures = q4apReportFailures(report);
  if (failures.length) throw new Error(`Q4AP bloqueada: ${failures.join("; ")}`);
  console.log(`Q4AP aprovada sem nova chamada paga: relatorio ${resolve(reportPath)}.`);
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4AP");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2B", 1, rubric, {
      runLabel: "q4ap",
      reportVersion: "2026-07-18.q4ap-quarterly-action-fidelity-challenge",
      ledgerLabel: "Q4AP",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...q4apReportFailures(report),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4AP: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4AP: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4AP bloqueada: ${failures.join("; ")}`);
    console.log("Q4AP aprovada: proposta prematura foi descartada e uma unica pergunta validou capacidade, dono e criterio das acoes.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "validate-report" && process.argv[3]) await validateExistingReport(process.argv[3]);
  else await main();
}
