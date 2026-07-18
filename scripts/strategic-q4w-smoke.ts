import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlanDocumentPreview } from "../supabase/functions/_shared/plan-documents.ts";
import { renderPlanForWhatsApp } from "../supabase/functions/_shared/plan-render.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2D-MONTH-CLOSE-PARTIAL-001";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4W");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2d-reviews.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);
    const summary = await executeCase(item, "Q2D", 1, rubric, {
      runLabel: "q4w",
      reportVersion: "2026-07-18.q4w-month-close-output",
      ledgerLabel: "Q4W",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const proposal = report.proposal ?? {};
    const review = Array.isArray(proposal.reviews) ? proposal.reviews[0] ?? {} : {};
    const learnings = Array.isArray(proposal.learnings) ? proposal.learnings : [];
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const oracleReplies = transcript.filter((entry: any) => entry.role === "oracle").map((entry: any) => text(entry.content));
    const focusedReply = oracleReplies.find((reply: string) => comparable(reply).includes("qual novo prazo assumimos")) ?? "";
    const content = buildPlanDocumentPreview(proposal, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_MANAGER",
      sessionType: "month_close",
      period: "Jun 2027",
    }) as any;
    const whatsapp = renderPlanForWhatsApp(content);
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!focusedReply ? ["transicao focada sobre a unica pendencia ausente"] : []),
      ...(focusedReply && ((focusedReply.match(/\?/g) ?? []).length !== 1 || !comparable(focusedReply).includes("50%")
        || !comparable(focusedReply).includes("meta de 60%") || !comparable(focusedReply).includes("parcial"))
        ? ["transicao nao preserva veredito, numeros ou pergunta unica"] : []),
      ...(oracleReplies.some((reply: string) => comparable(reply).includes("o que destrava o avanco agora"))
        ? ["pergunta generica reapareceu"] : []),
      ...(text(review.current) !== "50%" || text(review.target) !== "60%"
        ? ["atingido ou meta ausente na revisao"] : []),
      ...(!learnings.some((learning: unknown) => comparable(learning).includes("fornecedor")) ? ["aprendizado estruturado ausente"] : []),
      ...(text(proposal.nextPeriod) !== "Jul 2027" ? ["proximo periodo ausente"] : []),
      ...(!content || text(content.objetivos?.[0]?.atual) !== "50%" || text(content.objetivos?.[0]?.meta) !== "60%"
        ? ["documento canonico perdeu atingido ou meta"] : []),
      ...(text(content?.fechamento?.pendencias?.[0]).includes("[object Object]") || whatsapp.includes("[object Object]")
        ? ["pendencia sofreu coercao de objeto"] : []),
      ...(!comparable(whatsapp).includes("aprendizados: envolver o fornecedor")
        || !comparable(whatsapp).includes("confianca: yellow")
        || !comparable(whatsapp).includes("meta: 60%") ? ["whatsapp omite aprendizado, confianca ou meta"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4W: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4W: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4W bloqueada: ${failures.join("; ")}`);
    console.log("Q4W aprovada: o fechamento parcial preserva resultado, meta, aprendizado, pendencia e pulso em banco, documento e WhatsApp.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
