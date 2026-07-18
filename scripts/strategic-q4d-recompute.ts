import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildStrategicQualityGate } from "./strategic-eval-lib.ts";
import { readJson, readLedger, writePrivateJson } from "./strategic-eval.ts";
import { q4dJudgeRubric } from "./strategic-q4d-rubric.ts";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function recomputeQ4dReport(reportPathValue: string) {
  const reportPath = resolve(reportPathValue);
  const privateRoot = `${resolve(".agents-private")}/`;
  if (!reportPath.startsWith(privateRoot)) throw new Error("Relatório Q4D deve estar em .agents-private");
  const report = asRecord(await readJson(reportPath));
  if (!String(report.reportVersion ?? "").includes("q4d-smoke")) throw new Error("Relatório não pertence ao smoke Q4D");
  if (!report.judge || report.mode === "diagnostic") throw new Error("Relatório Q4D não possui judge formal");

  const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json"));
  const judgeRubric = q4dJudgeRubric(rubric);
  const originalChecks = Array.isArray(report.checks) ? report.checks.map(asRecord) : [];
  const technicalChecks = originalChecks.filter((item) => item.id !== "QUALITY-GATE" && item.id !== "DIAGNOSTIC-GATE");
  const qualityGate = buildStrategicQualityGate({
    technicalGateStatus: technicalChecks.every((item) => item.passed === true) ? "approved" : "blocked",
    judgeStatus: "completed",
    judgeResult: report.judge,
    applicableRubric: judgeRubric,
    minimumPerRubric: Number(asRecord(rubric).thresholds?.minimumPerRubric ?? 80),
    minimumJointAverage: Number(asRecord(rubric).thresholds?.minimumJointAverage ?? 85),
  });
  const checks = [
    ...technicalChecks,
    {
      id: "QUALITY-GATE",
      passed: qualityGate.status === "approved",
      evidence: `condução ${qualityGate.rubricScores[0]?.score ?? 0}; média ${qualityGate.jointAverage ?? 0}; pesos aplicáveis normalizados para 100`,
    },
  ];
  const recomputed = {
    ...report,
    reportVersion: "2026-07-17.q4d-smoke-recomputed-v1",
    sourceReport: reportPath,
    recomputedAt: new Date().toISOString(),
    qualityGate,
    checks,
    status: qualityGate.status,
    cost: { ...asRecord(report.cost), additionalCostUsd: 0 },
  };
  const outputPath = reportPath.replace(/\.json$/i, ".recomputed.json");
  await writePrivateJson(outputPath, recomputed);
  const ledger = await readLedger();
  const sourceRunId = reportPath.match(/strategic-q4d-smoke-([^.\/]+)\.json$/i)?.[1] ?? "q4d-unknown";
  const recomputeRunId = `${sourceRunId}-recomputed`;
  if (!ledger.runs.some((item) => item.runId === recomputeRunId)) {
    await writePrivateJson(resolve(".agents-private/strategic-eval-ledger.json"), {
      ...ledger,
      runs: [...ledger.runs, {
        runId: recomputeRunId,
        caseId: "Q4D-NATURAL-CONVERSATION-RECOMPUTED",
        totalCostUsd: 0,
        completedAt: new Date().toISOString(),
        status: qualityGate.status,
      }],
    });
  }
  console.log(`Relatório Q4D recalculado: ${outputPath}`);
  console.log(`Gate Q4D: ${qualityGate.status}; condução ${qualityGate.rubricScores[0]?.score ?? 0}; custo adicional US$ 0.`);
  if (qualityGate.status !== "approved") throw new Error(qualityGate.reasons.join(" | "));
  return { outputPath, qualityGate };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error("Uso: strategic-q4d-recompute.ts <relatorio-q4d.json>");
  await recomputeQ4dReport(reportPath);
}
