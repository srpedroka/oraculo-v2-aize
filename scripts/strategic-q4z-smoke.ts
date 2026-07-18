import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2A-ANNUAL-EXPERIENCED-OWNER-005";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4Z");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2a-annual.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);
    const requestedReport = text(process.env.ORACULO_Q4Z_REPORT);
    const reportPath = requestedReport ? resolve(requestedReport) : "";
    if (reportPath && (!reportPath.startsWith(`${resolve(".agents-private")}/strategic-q4z-`) || !reportPath.endsWith(".json"))) {
      throw new Error("ORACULO_Q4Z_REPORT deve apontar para um relatorio privado Q4Z");
    }
    const executedSummary = reportPath ? null : await executeCase(item, "Q2A", 1, rubric, {
      runLabel: "q4z",
      reportVersion: "2026-07-18.q4z-annual-complete-block",
      ledgerLabel: "Q4Z",
    });
    const report = await readJson(reportPath || executedSummary!.reportPath) as Record<string, any>;
    if (report.caseId !== CASE_ID || report.round !== 1) throw new Error("relatorio informado nao pertence ao caso Q4Z R1");
    const summary = executedSummary ?? {
      status: report.executionError ? "execution-error" : "measured",
      failedChecks: (Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [])
        .filter((check: any) => check.status === "fail")
        .map((check: any) => text(check.id)),
      criticalFailureCandidates: report.qualityGate?.criticalFailureCandidates ?? [],
      rubricScores: (report.qualityGate?.rubricScores ?? []).map((entry: any) => ({
        rubricId: text(entry.rubricId),
        score: Number(entry.score ?? 0),
      })),
      generationCostUsd: Number(report.cost?.generationCostUsd ?? 0),
      judgeCostUsd: Number(report.cost?.judgeCostUsd ?? 0),
      reportPath,
    };
    const proposal = report.proposal ?? {};
    const objectives = Array.isArray(proposal.objectives) ? proposal.objectives : [];
    const projects = Array.isArray(proposal.projects) ? proposal.projects : [];
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const replies = transcript.filter((entry: any) => entry.role === "oracle").map((entry: any) => text(entry.content));
    const concreteBlockRequest = replies.find((reply: string) => {
      const normalized = comparable(reply);
      return normalized.includes("valores") && normalized.includes("bloco")
        && (normalized.includes("concret") || normalized.includes("vincul"));
    }) ?? "";
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const completeObjective = (objective: any) => [
      objective.title,
      objective.result,
      objective.current,
      objective.metric,
      objective.target,
      objective.deadline,
      objective.source,
      objective.owner,
    ].every((value) => text(value));
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!concreteBlockRequest || (concreteBlockRequest.match(/\?/g) ?? []).length !== 1
        ? ["barreira ao bloco abstrato ausente"] : []),
      ...(text(proposal.type) !== "save_strategic_plan" || Number(proposal.year) !== 2027
        ? ["tipo ou ano da proposta incorreto"] : []),
      ...(objectives.length !== 4 || objectives.some((objective: any) => !completeObjective(objective))
        ? ["quatro objetivos verificaveis ausentes"] : []),
      ...(projects.length !== 4 || projects.some((project: any) => !text(project.name) || !text(project.owner) || !text(project.deadline) || !text(project.linkedObjectiveTitle))
        ? ["quatro projetos vinculados ausentes"] : []),
      ...(!Array.isArray(proposal.historicalLessons) || proposal.historicalLessons.length === 0
        || !Array.isArray(proposal.renunciations) || proposal.renunciations.length === 0
        || !Array.isArray(proposal.risks) || proposal.risks.length === 0 ? ["aprendizado, renuncias ou riscos ausentes"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4Z: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4Z: ${reportPath ? "recheck US$ 0.000000; custo original" : "custo do smoke"} US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4Z bloqueada: ${failures.join("; ")}`);
    console.log("Q4Z aprovada: bloco anual abstrato nao vira proposta vazia; ano, objetivos, projetos e escolhas concretas chegam completos a confirmacao.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
