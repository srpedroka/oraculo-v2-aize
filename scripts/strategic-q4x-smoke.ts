import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlanDocumentPreview } from "../supabase/functions/_shared/plan-documents.ts";
import { renderPlanForWhatsApp } from "../supabase/functions/_shared/plan-render.ts";
import { executeCase } from "./strategic-baseline.ts";
import { readJson } from "./strategic-eval.ts";
import type { ReferenceCaseBlock } from "./strategic-reference-cases.ts";
import { acquireStrategicPhaseLock } from "./strategic-run-lock.ts";

const CASE_ID = "Q2D-QUARTER-CLOSE-OPEN-DECISION-002";
const MINIMUM_PER_RUBRIC = 80;
const MINIMUM_JOINT_AVERAGE = 85;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function main() {
  const releasePhaseLock = await acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4X");
  try {
    const block = await readJson(resolve("tests/evals/strategic-quality/cases/q2d-reviews.json")) as ReferenceCaseBlock;
    const rubric = await readJson(resolve("tests/evals/strategic-quality/rubric.json")) as Record<string, any>;
    const item = block.cases.find((candidate) => candidate.caseId === CASE_ID);
    if (!item) throw new Error(`caso ${CASE_ID} nao encontrado`);
    const summary = await executeCase(item, "Q2D", 1, rubric, {
      runLabel: "q4x",
      reportVersion: "2026-07-18.q4x-quarter-close-roll",
      ledgerLabel: "Q4X",
    });
    const report = await readJson(summary.reportPath) as Record<string, any>;
    const proposal = report.proposal ?? {};
    const review = Array.isArray(proposal.reviews) ? proposal.reviews[0] ?? {} : {};
    const pendencies = Array.isArray(proposal.pendencies) ? proposal.pendencies : [];
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const oracleReplies = transcript.filter((entry: any) => entry.role === "oracle").map((entry: any) => text(entry.content));
    const focusedReply = oracleReplies.find((reply: string) => comparable(reply).includes("escopo reduzido e o prazo")) ?? "";
    const finalReply = oracleReplies.at(-1) ?? "";
    const content = buildPlanDocumentPreview(proposal, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_MANAGER",
      sessionType: "quarter_close",
      period: "T2 2027",
    }) as any;
    const whatsapp = renderPlanForWhatsApp(content);
    const scoreByRubric = new Map(summary.rubricScores.map((entry) => [entry.rubricId, entry.score]));
    const requiredScores = item.rubrics.map((rubricId) => ({ rubricId, score: scoreByRubric.get(rubricId) ?? 0 }));
    const jointAverage = requiredScores.reduce((sum, entry) => sum + entry.score, 0) / requiredScores.length;
    const annualTitle = text(proposal.annualAlignment?.strategicObjectiveTitle);
    const pending = pendencies[0] ?? {};
    const failures = [
      ...(summary.status !== "measured" ? [`execucao ${summary.status}`] : []),
      ...summary.failedChecks.map((check) => `check ${check}`),
      ...summary.criticalFailureCandidates.map((failure) => `falha critica ${failure}`),
      ...(!focusedReply ? ["transicao focada com memoria ausente"] : []),
      ...(focusedReply && (!comparable(focusedReply).includes("desde o segundo mes")
        || !comparable(focusedReply).includes("objetivo anual")
        || !focusedReply.includes("78%") || !focusedReply.includes("80%")
        || (focusedReply.match(/\?/g) ?? []).length !== 1) ? ["transicao perdeu memoria, alinhamento, numeros ou pergunta unica"] : []),
      ...(oracleReplies.some((reply: string) => comparable(reply).includes("o que destrava o avanco agora"))
        ? ["pergunta generica reapareceu"] : []),
      ...(!comparable(annualTitle).includes("aumentar previsibilidade comercial") ? ["alinhamento anual ausente"] : []),
      ...(pendencies.length !== 1 || text(pending.kind) !== "action" || text(pending.decision) !== "roll"
        || text(pending.newDeadline) !== "2027-07-31" || !comparable(pending.newScope).includes("integracao principal")
        ? ["rolagem seletiva estruturada ausente"] : []),
      ...(!text(review.owner) || text(review.current) !== "78%" || text(review.target) !== "80%"
        ? ["responsavel, atingido ou meta ausente na revisao"] : []),
      ...(!comparable(finalReply).includes("78% contra meta de 80%")
        || !comparable(finalReply).includes("rolar somente integracao principal")
        || !comparable(finalReply).includes("alinhamento")
        || !comparable(finalReply).includes("aprendizado")
        || (finalReply.match(/\?/g) ?? []).length !== 1 ? ["sintese final incompleta"] : []),
      ...(!content || !comparable(content.referencia?.objetivo_anual).includes("aumentar previsibilidade comercial")
        || !text(content.fechamento?.pendencias?.[0]).includes("2027-07-31") ? ["documento perdeu alinhamento ou prazo"] : []),
      ...(!comparable(whatsapp).includes("alinhamento anual: aumentar previsibilidade comercial")
        || !comparable(whatsapp).includes("novo prazo: 2027-07-31") ? ["whatsapp perdeu alinhamento ou prazo"] : []),
      ...requiredScores.filter((entry) => entry.score < MINIMUM_PER_RUBRIC)
        .map((entry) => `${entry.rubricId} ${entry.score} < ${MINIMUM_PER_RUBRIC}`),
      ...(jointAverage < MINIMUM_JOINT_AVERAGE ? [`media conjunta ${jointAverage.toFixed(2)} < ${MINIMUM_JOINT_AVERAGE}`] : []),
    ];

    console.log(`Q4X: ${requiredScores.map((entry) => `${entry.rubricId} ${entry.score}`).join("; ")}; media ${jointAverage.toFixed(2)}.`);
    console.log(`Q4X: custo do smoke US$ ${(summary.generationCostUsd + summary.judgeCostUsd).toFixed(6)}; relatorio privado ${summary.reportPath}.`);
    if (failures.length) throw new Error(`Q4X bloqueada: ${failures.join("; ")}`);
    console.log("Q4X aprovada: o fechamento trimestral usa memoria, preserva alinhamento anual e rola somente a integracao com novo escopo e prazo.");
  } finally {
    await releasePhaseLock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
