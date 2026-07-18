import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2C-MONTHLY-CAPACITY-OVERLOAD-003";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4V");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2c-monthly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso exato ${CASE_ID} nao encontrado`);

    const summary = await executeCase(item, "Q2C", 1, rubric, {
      runLabel: "q4v",
      reportVersion: "2026-07-18.q4v-monthly-capacity",
      ledgerLabel: "Q4V",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const proposal = report.proposal ?? {};
    const objective = Array.isArray(proposal.objectives) ? proposal.objectives[0] ?? {} : {};
    const actions = Array.isArray(objective.actions) ? objective.actions : [];
    const backlog = Array.isArray(proposal.backlog) ? proposal.backlog : [];
    const blockers = Array.isArray(proposal.blockers) ? proposal.blockers : [];
    const oracleReplies = (Array.isArray(report.transcript) ? report.transcript : [])
      .filter((entry: any) => entry.role === "oracle")
      .map((entry: any) => text(entry.content));
    const finalReply = oracleReplies.at(-1) ?? "";
    const normalizedReply = comparable(finalReply);
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(actions.length !== 5 ? [`acoes comprometidas ${actions.length} != 5`] : []),
      ...(actions.some((action: any) => !text(action.completionCriterion) || !text(action.deadline) || !text(action.owner))
        ? ["acao sem criterio, prazo ou responsavel"] : []),
      ...(backlog.length !== 1 || !comparable(backlog[0]).includes("backlog") ? ["backlog explicito ausente"] : []),
      ...(!text(proposal.quarterlyAlignment?.quarterlyObjectiveId) ? ["vinculo trimestral real ausente"] : []),
      ...(!comparable(objective.result).includes("40% para 55%") ? ["resultado mensal mensuravel ausente"] : []),
      ...(!text(proposal.cadence) || comparable(proposal.confidence) !== "amarela" || !blockers.length
        ? ["acompanhamento, confianca ou bloqueio ausente"] : []),
      ...(!normalizedReply.includes("acoes comprometidas (5/5)") || !normalizedReply.includes("backlog")
        || !normalizedReply.includes("confianca: amarela") ? ["sintese final omite capacidade, backlog ou confianca"] : []),
      ...((finalReply.match(/\?/g) ?? []).length !== 1 ? ["confirmacao final nao e unica"] : []),
      ...(oracleReplies.filter((reply: string) => comparable(reply).includes("o que destrava o avanco agora")).length
        ? ["loop generico reapareceu"] : []),
      ...requiredScores
        .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE
        ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
        : []),
    ];

    console.log(`Q4V: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4V: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4V bloqueada: ${failures.join("; ")}`);
    console.log("Q4V aprovada: o bloco mensal completo virou uma unica proposta com cinco acoes, backlog e acompanhamento, sem repetir perguntas.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
