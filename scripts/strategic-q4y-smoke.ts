import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlanDocumentPreview } from "../supabase/functions/_shared/plan-documents.ts";
import { renderPlanForWhatsApp } from "../supabase/functions/_shared/plan-render.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2D-STRATEGIC-REVIEW-BOUNDARY-003";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4Y");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2d-reviews.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);
    const summary = await executeCase(item, "Q2D", 1, rubric, {
      runLabel: "q4y",
      reportVersion: "2026-07-18.q4y-strategic-review-output",
      ledgerLabel: "Q4Y",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const proposal = report.proposal ?? {};
    const adjustments = Array.isArray(proposal.adjustments) ? proposal.adjustments : [];
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const finalReply = text(transcript.filter((entry: any) => entry.role === "oracle").at(-1)?.content);
    const content = buildPlanDocumentPreview(proposal, {
      organizationName: "ORG_FIXTURE_A",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "strategic_review",
      period: "2027",
    }) as any;
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const currentAdjustment = adjustments.find((entry: any) => text(entry.field) === "current");
    const targetAdjustment = adjustments.find((entry: any) => text(entry.field) === "target");
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(text(proposal.type) !== "apply_strategic_review" || adjustments.length !== 2 ? ["proposta de dois microajustes ausente"] : []),
      ...(!currentAdjustment || text(currentAdjustment.from) !== "68%" || text(currentAdjustment.to) !== "72%"
        ? ["valor atual do Objetivo A incorreto"] : []),
      ...(!targetAdjustment || text(targetAdjustment.from) !== "15%" || text(targetAdjustment.to) !== "12%"
        ? ["meta do Objetivo B incorreta"] : []),
      ...(!comparable(finalReply).includes("objetivo a: valor atual, de 68% para 72%")
        || !comparable(finalReply).includes("objetivo b: meta, de 15% para 12%")
        || !comparable(finalReply).includes("base informada")
        || !comparable(finalReply).includes("demais objetivos e campos permanecem iguais")
        || !comparable(finalReply).includes("confirma aplicar estes 2 microajustes")
        || (finalReply.match(/\?/g) ?? []).length !== 1 ? ["confirmacao final perdeu diff, limite ou pergunta unica"] : []),
      ...(!content || text(content.tipo) !== "strategic_review" || content.ajustes?.length !== 2
        || content.antes?.length !== 2 || content.depois?.length !== 2 ? ["projecao canonica da revisao incompleta"] : []),
      ...(!comparable(whatsapp).includes("objetivo a: current de 68% para 72%")
        || !comparable(whatsapp).includes("objetivo b: target de 15% para 12%")
        || !comparable(whatsapp).includes("origem: proposta confirmada") ? ["whatsapp perdeu diff ou rastreabilidade"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4Y: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4Y: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4Y bloqueada: ${failures.join("; ")}`);
    console.log("Q4Y aprovada: a revisao mostra o diff completo, pede uma confirmacao e projeta documento e canais antes de gravar.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
