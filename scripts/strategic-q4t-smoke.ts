import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";
import {
  isExplicitQuarterlyKpiHypothesisChoiceReply,
  quarterlyKpiLinks,
} from "../supabase/functions/_shared/quarterly-kpis.ts";

const CASE_ID = "Q2B-QUARTERLY-KPI-HYPOTHESIS-007";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4T");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso exato ${CASE_ID} nao encontrado`);

    const requestedReport = text(process.env.ORACULO_Q4T_REPORT);
    const reportPath = requestedReport ? resolve(requestedReport) : "";
    if (reportPath && (!reportPath.startsWith(`${resolve(".agents-private")}/strategic-q4t-`) || !reportPath.endsWith(".json"))) {
      throw new Error("ORACULO_Q4T_REPORT deve apontar para um relatorio privado Q4T");
    }
    const executedSummary = reportPath ? null : await executeCase(item, "Q2B", 2, rubric, {
      runLabel: "q4t",
      reportVersion: "2026-07-18.q4t-kpi-hypothesis",
      ledgerLabel: "Q4T",
    });
    const report = await readJson(reportPath || executedSummary!.reportPath) as Record<string, any>;
    if (report.caseId !== CASE_ID || report.round !== 2) throw new Error("relatorio informado nao pertence ao caso Q4T R2");
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
    const kpiLinks = quarterlyKpiLinks(proposal).map((link) => link as Record<string, unknown>);
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const oracleReplies = transcript.filter((entry: any) => entry.role === "oracle").map((entry: any) => text(entry.content));
    const explicitChoiceReply = oracleReplies.slice(0, -1)
      .find((reply: string) => isExplicitQuarterlyKpiHypothesisChoiceReply(reply)) ?? "";
    const finalReply = oracleReplies.at(-1) ?? "";
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!explicitChoiceReply ? ["hipotese e escolha explicita ausentes da conducao"] : []),
      ...(kpiLinks.length !== 1 ? [`vinculos KPI ${kpiLinks.length} != 1`] : []),
      ...(text(kpiLinks[0]?.kpiKey) !== "operating_margin" ? ["KPI nao normalizado para operating_margin"] : []),
      ...(!comparable(kpiLinks[0]?.rationale).includes("nao comprov") ? ["ressalva causal ausente do vinculo"] : []),
      ...(!comparable(finalReply).includes("hipotese de impacto confirmada") ? ["resumo final omite a hipotese confirmada"] : []),
      ...requiredScores
        .filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE
        ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`]
        : []),
    ];

    console.log(`Q4T: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4T: ${reportPath ? "recheck US$ 0.000000; custo original" : "custo do smoke"} US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4T bloqueada: ${failures.join("; ")}`);
    console.log("Q4T aprovada: a hipotese foi explicada, escolhida explicitamente e persistida no KPI real sem afirmar causalidade.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
