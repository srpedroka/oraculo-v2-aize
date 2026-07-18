import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeCase } from "./strategic-baseline.ts";
import { readJson, writePrivateJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2B-QUARTERLY-MISSING-BASELINE-005";
const PRIVATE_REPORT_PATH = resolve(".agents-private/strategic-model-ab-quarterly.json");
const PRIVATE_KEY_PATH = resolve(".agents-private/strategic-model-ab-quarterly-key.json");

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function executeCandidate(
  item: ReferenceCaseBlock["cases"][number],
  rubric: Record<string, any>,
  planningModel: "grok-4.3" | "grok-4.5",
  judgeModel: "grok-4.3" | "grok-4.5",
) {
  process.env.ORACULO_EVAL_PLANNING_MODEL = planningModel;
  process.env.ORACULO_EVAL_JUDGE_MODEL = judgeModel;
  const label = planningModel.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const summary = await executeCase(item, "Q2B", 1, rubric, {
    runLabel: `model-ab-${label}`,
    reportVersion: "2026-07-18.model-ab-quarterly-v1",
    ledgerLabel: `MODEL-AB-${planningModel}`,
  });
  const report = await readJson(summary.reportPath) as Record<string, any>;
  const usage = asRecord(asRecord(report.cost).generationUsage);
  return {
    planningModel,
    crossedJudgeModel: judgeModel,
    technicalStatus: report.technicalStatus,
    qualityStatus: summary.qualityStatus,
    failedChecks: summary.failedChecks,
    criticalFailureCandidates: summary.criticalFailureCandidates,
    rubricScores: summary.rubricScores,
    generation: {
      callCount: Number(usage.callCount ?? 0),
      repairCalls: Object.entries(asRecord(usage.adaptiveAttemptCounts))
        .filter(([attempt]) => attempt !== "1")
        .reduce((sum, [, count]) => sum + Number(count), 0),
      repairReasons: asRecord(usage.adaptiveRepairReasonCounts),
      promptTokens: Number(usage.promptTokens ?? 0),
      completionTokens: Number(usage.completionTokens ?? 0),
      costUsd: summary.generationCostUsd,
    },
    judgeCostUsd: summary.judgeCostUsd,
    totalCostUsd: summary.generationCostUsd + summary.judgeCostUsd,
    proposal: report.proposal,
    transcript: report.transcript,
    reportPath: summary.reportPath,
  };
}

export async function main() {
  if (process.env.ORACULO_MODEL_AB_AUTHORIZED !== "true") {
    throw new Error("A/B pago bloqueado: defina ORACULO_MODEL_AB_AUTHORIZED=true somente apos briefing e autorizacao do owner");
  }
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "MODEL-AB");
  const originalPlanningModel = process.env.ORACULO_EVAL_PLANNING_MODEL;
  const originalJudgeModel = process.env.ORACULO_EVAL_JUDGE_MODEL;
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2b-quarterly.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);

    const results = [
      await executeCandidate(item, rubric, "grok-4.3", "grok-4.5"),
      await executeCandidate(item, rubric, "grok-4.5", "grok-4.3"),
    ];
    const blindOrder = randomBytes(1)[0] % 2 === 0 ? [0, 1] : [1, 0];
    await writePrivateJson(PRIVATE_REPORT_PATH, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      caseId: CASE_ID,
      purpose: "Comparar confiabilidade estrutural, custo e qualidade aparente sem trocar automaticamente o modelo de producao.",
      limitation: "As notas qualitativas usam judges cruzados diferentes; a decisao final exige revisao humana cega ou judge externo fixo.",
      candidates: blindOrder.map((index, blindIndex) => ({
        label: blindIndex === 0 ? "A" : "B",
        ...results[index],
        planningModel: undefined,
        crossedJudgeModel: undefined,
      })),
      totalCostUsd: results.reduce((sum, item) => sum + item.totalCostUsd, 0),
      automaticModelSwitch: false,
    });
    await writePrivateJson(PRIVATE_KEY_PATH, {
      schemaVersion: 1,
      reportPath: PRIVATE_REPORT_PATH,
      labels: Object.fromEntries(blindOrder.map((index, blindIndex) => [blindIndex === 0 ? "A" : "B", {
        planningModel: results[index].planningModel,
        crossedJudgeModel: results[index].crossedJudgeModel,
      }])),
    });
    console.log(`A/B preparado em ${PRIVATE_REPORT_PATH}; chave cega em ${PRIVATE_KEY_PATH}.`);
    console.log(`Custo desta comparacao: US$ ${results.reduce((sum, item) => sum + item.totalCostUsd, 0).toFixed(6)}.`);
    console.log("Nenhum modelo foi trocado automaticamente.");
  } finally {
    if (originalPlanningModel === undefined) delete process.env.ORACULO_EVAL_PLANNING_MODEL;
    else process.env.ORACULO_EVAL_PLANNING_MODEL = originalPlanningModel;
    if (originalJudgeModel === undefined) delete process.env.ORACULO_EVAL_JUDGE_MODEL;
    else process.env.ORACULO_EVAL_JUDGE_MODEL = originalJudgeModel;
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
