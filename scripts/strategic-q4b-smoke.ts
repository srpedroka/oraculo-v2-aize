import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serviceClient, assertStaging } from "../tests/helpers/staging.ts";
import {
  assertBudgetAllowsNextCall,
  assertEvaluationEnvironment,
  sanitizeEvaluationText,
  sanitizeEvaluationValue,
} from "./strategic-eval-lib.ts";
import {
  callFunction,
  configureDisposableAi,
  createEvaluationOrg,
  destroyEvaluationOrg,
  generationUsage,
  ownerToken,
  readJson,
  readLedger,
  runId,
  runtimeConfiguration,
  writePrivateJson,
  type CostLedger,
  type EvaluationOrg,
} from "./strategic-eval.ts";
import { visibleQuestions } from "../supabase/functions/_shared/session-adaptive.ts";

const PRIVATE_DIR = resolve(".agents-private");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const CALL_RESERVE_USD = 0.6;
const ACTIVITY_TITLE_PATTERN = /^(?:implantar|implementar|instalar|criar|fazer|planejar|organizar|contratar|desenvolver|configurar)\b/i;
const ANNUAL_SWITCH_PATTERN = /\b(?:construir|montar|iniciar|come[cç]ar)\s+(?:o\s+)?(?:planejamento|plano)\s+(?:estrat[eé]gico\s+)?anual\b/i;

type Check = { id: string; passed: boolean; evidence: string };
type Usage = { promptTokens: number; completionTokens: number; totalTokens: number; totalCostUsd: number };

function check(id: string, passed: boolean, evidence: string): Check {
  return { id, passed, evidence };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function hasGuidedOptions(reply: string) {
  return /\b(?:ou|entre)\b/i.test(reply) || /(?:^|\n)\s*(?:1[.)]|[-*•]).*(?:\n|$)/.test(reply);
}

async function must<T>(operation: PromiseLike<{ data: T; error: any }>, label: string): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? String(result.error)}`);
  return result.data;
}

async function seedQuarterlyContext(handle: EvaluationOrg) {
  const admin = serviceClient();
  await must(admin.from("strategic_plans").insert({
    org_id: handle.orgId,
    year: 2027,
    profile: { fixture: true },
    drivers: { purpose: "Executar com clareza", vision: "Crescer com previsibilidade", values: ["Clareza"] },
    swot: { strengths: ["Equipe experiente"], weaknesses: ["Previsão instável"], opportunities: [], threats: [] },
    themes: ["Previsibilidade comercial"],
    rituals: ["Revisão mensal"],
    executive_summary: "Aumentar previsibilidade comercial sem elevar estoque.",
  }).select("id").single(), "criar plano anual sintético");

  const strategic = await must<any>(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: null,
    level: "strategic",
    type: "harvest",
    title: "Aumentar previsibilidade comercial",
    result: "Aumentar previsibilidade comercial",
    metric: "Acurácia da previsão",
    current: "52%",
    target: "80%",
    deadline: "2027-12-31",
    owner: "PERSON_FIXTURE_OWNER",
    evidence_plan: "Relatório semanal do funil",
    status: "on_track",
    progress: 20,
    period: "2027",
  }).select("id").single(), "criar objetivo estratégico sintético");

  await must(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    level: "area_annual",
    type: "harvest",
    title: "Tornar a previsão comercial confiável",
    result: "Tornar a previsão comercial confiável",
    metric: "Oportunidades com próxima ação",
    current: "40%",
    target: "85%",
    deadline: "2027-12-31",
    owner: "PERSON_FIXTURE_MANAGER",
    evidence_plan: "Relatório semanal do funil",
    status: "on_track",
    progress: 20,
    parent_id: strategic.id,
    period: "2027",
  }).select("id").single(), "criar objetivo anual da área");
}

async function businessSnapshot(handle: EvaluationOrg) {
  const admin = serviceClient();
  const tables = ["strategic_plans", "area_plans", "objectives", "key_actions", "plan_documents"];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    const result = await admin.from(table).select("*").eq("org_id", handle.orgId);
    if (result.error) throw result.error;
    data[table] = [...(result.data ?? [])].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function combinedUsage(handles: EvaluationOrg[], startedAt: string): Promise<Usage> {
  const usages = await Promise.all(handles.map((handle) => generationUsage(handle, startedAt)));
  return usages.reduce((total, current) => ({
    promptTokens: total.promptTokens + current.promptTokens,
    completionTokens: total.completionTokens + current.completionTokens,
    totalTokens: total.totalTokens + current.totalTokens,
    totalCostUsd: total.totalCostUsd + current.totalCostUsd,
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 });
}

async function startQuarterly(handle: EvaluationOrg, token: string, requestId: string) {
  return await callFunction("oracle-session", token, {
    action: "start",
    orgId: handle.orgId,
    areaId: handle.areaId,
    type: "quarterly",
    period: "T3 2027",
    channel: "web",
  }, requestId);
}

async function sendMessage(token: string, sessionId: string, message: string, requestId: string) {
  return await callFunction("oracle-session", token, { action: "message", sessionId, message, channel: "web" }, requestId);
}

async function abandonSession(token: string, sessionId: string, requestId: string) {
  await callFunction("oracle-session", token, { action: "abandon", sessionId }, requestId);
}

async function budgetCheck(handles: EvaluationOrg[], startedAt: string, ledger: CostLedger, policy: any) {
  const usage = await combinedUsage(handles, startedAt);
  assertBudgetAllowsNextCall({
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
    currentCaseCostUsd: usage.totalCostUsd,
    reserveUsd: CALL_RESERVE_USD,
    policy,
  });
}

async function runSmoke() {
  assertEvaluationEnvironment(process.env);
  assertStaging();
  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const policy = rubric.costPolicy;
  const config = runtimeConfiguration();
  const ledger = await readLedger();
  assertBudgetAllowsNextCall({ cumulativePlanCostUsd: ledger.cumulativePlanCostUsd, currentCaseCostUsd: 0, reserveUsd: CALL_RESERVE_USD, policy });

  const id = runId();
  const startedAt = new Date().toISOString();
  const reportPath = resolve(PRIVATE_DIR, `strategic-q4b-smoke-${id}.json`);
  const handles: EvaluationOrg[] = [];
  let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  let executionError: string | null = null;
  let cleanupSucceeded = false;
  const checks: Check[] = [];
  const evidence: Record<string, unknown> = {};

  try {
    const primary = await createEvaluationOrg("q4b-primary");
    handles.push(primary);
    await configureDisposableAi(primary, config);
    await seedQuarterlyContext(primary);
    const primaryToken = await ownerToken(primary);
    const beforeComplete = await businessSnapshot(primary);

    await budgetCheck(handles, startedAt, ledger, policy);
    const completeStart = await startQuarterly(primary, primaryToken, `q4b-${id}-complete-start`);
    const completeMessage = [
      "Considere este bloco completo para o plano Comercial do T3 2027.",
      "Vínculo anual: Tornar a previsão comercial confiável, ligado ao estratégico Aumentar previsibilidade comercial.",
      "Resultado trimestral: elevar oportunidades com próxima ação registrada de 40% para 85% até 30/09/2027.",
      "Indicador: oportunidades com próxima ação. Fonte: relatório semanal do funil. Responsável: PERSON_FIXTURE_MANAGER.",
      "Ação 1: padronizar etapas do funil; dono PERSON_FIXTURE_MANAGER; prazo 31/07/2027; concluída quando as etapas estiverem publicadas e aprovadas.",
      "Ação 2: revisar oportunidades sem próxima ação toda semana; dono PERSON_FIXTURE_MANAGER; prazo 30/09/2027; concluída quando houver quatro revisões seguidas registradas.",
      "Risco: baixa adesão dos vendedores. Aprendizado: melhorar disciplina de funil. Acompanhamento semanal.",
      "Não há outras prioridades neste trimestre. Os dados são suficientes; apresente a proposta final para uma única confirmação.",
    ].join("\n");
    const complete = await sendMessage(primaryToken, text(completeStart.session?.id), completeMessage, `q4b-${id}-complete-message`);
    const proposal = asRecord(complete.pendingProposal);
    const objective = asRecord(asArray(proposal.quarterlyObjectives)[0]);
    checks.push(
      check("COMPLETE-PROPOSAL", proposal.type === "save_quarterly_plan", "gestor completo chega à proposta trimestral"),
      check("COMPLETE-ONE-CONFIRM", visibleQuestions(text(complete.reply)).length === 1, "resumo final contém uma confirmação"),
      check("COMPLETE-VERIFIABLE", [objective.metric, objective.current, objective.target, objective.source, objective.deadline, objective.owner].every((value) => text(value)), "objetivo preserva indicador, baseline, alvo, fonte, prazo e dono"),
      check("COMPLETE-ACTIONS", asArray(objective.actions).length === 2, "duas ações estruturadas foram preservadas"),
      check("COMPLETE-ANNUAL-LINK", text(asRecord(proposal.annualAlignment).status).toLowerCase() === "linked" && text(objective.parentTitle), "vínculo anual real aparece na proposta"),
    );
    checks.push(check("COMPLETE-NO-PREMATURE-WRITE", beforeComplete === await businessSnapshot(primary), "nenhum dado de negócio muda antes da confirmação"));

    await callFunction("oracle-session", primaryToken, { action: "confirm", sessionId: text(completeStart.session?.id), channel: "web" }, `q4b-${id}-complete-confirm`);
    const admin = serviceClient();
    const savedObjective = await must<any>(admin.from("objectives")
      .select("*")
      .eq("org_id", primary.orgId)
      .eq("level", "quarterly")
      .eq("period", "T3 2027")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(), "ler objetivo trimestral salvo");
    const savedActions = await must<any[]>(admin.from("key_actions").select("*").eq("objective_id", savedObjective.id), "ler ações trimestrais salvas");
    const savedDocument = await must<any>(admin.from("plan_documents")
      .select("*")
      .eq("org_id", primary.orgId)
      .eq("type", "quarterly")
      .eq("period", "T3 2027")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(), "ler documento trimestral salvo");
    const documentObjective = asRecord(asArray(asRecord(savedDocument.content).objetivos)[0]);
    checks.push(
      check("SAVED-OBJECTIVE", savedObjective.current === text(objective.current) && savedObjective.target === text(objective.target) && savedObjective.evidence_plan === text(objective.source), "banco preserva baseline, alvo e fonte"),
      check("SAVED-ACTIONS", savedActions.length === 2 && savedActions.every((action) => action.owner && action.deadline && action.completion_criterion), "banco preserva ações com dono, prazo e critério"),
      check("SAVED-DOCUMENT", documentObjective.atual === text(objective.current) && documentObjective.fonte === text(objective.source) && asArray(documentObjective.acoes).length === 2, "documento canônico preserva objetivo e ações"),
    );
    evidence.complete = { reply: complete.reply, proposal, savedObjective, savedActions, documentContent: savedDocument.content };

    await budgetCheck(handles, startedAt, ledger, policy);
    const vagueStart = await startQuarterly(primary, primaryToken, `q4b-${id}-vague-start`);
    const vague = await sendMessage(primaryToken, text(vagueStart.session?.id), "Precisamos vender mais neste trimestre.", `q4b-${id}-vague-message`);
    checks.push(
      check("VAGUE-NO-PROPOSAL", !vague.pendingProposal, "resposta vaga não gera proposta"),
      check("VAGUE-GUIDED", visibleQuestions(text(vague.reply)).length === 1 && hasGuidedOptions(text(vague.reply)), "resposta vaga recebe uma pergunta com opções"),
    );
    evidence.vague = { reply: vague.reply };
    await abandonSession(primaryToken, text(vagueStart.session?.id), `q4b-${id}-vague-abandon`);

    await budgetCheck(handles, startedAt, ledger, policy);
    const overloadStart = await startQuarterly(primary, primaryToken, `q4b-${id}-overload-start`);
    const overload = await sendMessage(primaryToken, text(overloadStart.session?.id), [
      "Tenho oito objetivos igualmente importantes para o trimestre.",
      "A equipe comporta no máximo três resultados. Prazo de entrega, retrabalho e capacidade são os gargalos centrais; o restante pode ir para backlog.",
    ].join("\n"), `q4b-${id}-overload-message`);
    checks.push(
      check("OVERLOAD-NO-LARGE-PROPOSAL", asArray(asRecord(overload.pendingProposal).quarterlyObjectives).length <= 3, "nenhuma proposta excede três resultados"),
      check("OVERLOAD-ONE-QUESTION", visibleQuestions(text(overload.reply)).length === 1, "priorização é conduzida com uma pergunta"),
    );
    evidence.overload = { reply: overload.reply, proposal: overload.pendingProposal ?? null };
    await abandonSession(primaryToken, text(overloadStart.session?.id), `q4b-${id}-overload-abandon`);

    await budgetCheck(handles, startedAt, ledger, policy);
    const activityStart = await startQuarterly(primary, primaryToken, `q4b-${id}-activity-start`);
    const activity = await sendMessage(primaryToken, text(activityStart.session?.id), [
      "Objetivo proposto: implantar um CRM no T3 2027.",
      "O resultado que ele precisa produzir é elevar oportunidades com próxima ação registrada de 40% para 85% até 30/09/2027, fonte relatório semanal do funil, dono PERSON_FIXTURE_MANAGER.",
      "Vincule ao anual Tornar a previsão comercial confiável.",
      "Ação: implantar e migrar o CRM; dono PERSON_FIXTURE_MANAGER; prazo 31/08/2027; conclusão quando a base estiver migrada e 80% dos vendedores ativos.",
      "Risco: adesão desigual. Aprendizado: disciplina de uso. Acompanhamento semanal. Não há outra prioridade.",
      "Os dados estão completos; apresente a proposta final para uma única confirmação.",
    ].join("\n"), `q4b-${id}-activity-message`);
    const activityProposal = asRecord(activity.pendingProposal);
    const activityObjective = asRecord(asArray(activityProposal.quarterlyObjectives)[0]);
    checks.push(
      check("ACTIVITY-PROPOSAL", activityProposal.type === "save_quarterly_plan", "atividade completa chega a proposta"),
      check("ACTIVITY-BECOMES-RESULT", !ACTIVITY_TITLE_PATTERN.test(text(activityObjective.title)) && !ACTIVITY_TITLE_PATTERN.test(text(activityObjective.result)), "objetivo descreve resultado, não instalação"),
      check("ACTIVITY-KEPT-AS-ACTION", asArray(activityObjective.actions).some((action) => /crm/i.test(text(asRecord(action).description))), "CRM permanece como ação subordinada"),
    );
    evidence.activity = { reply: activity.reply, proposal: activityProposal };
    await abandonSession(primaryToken, text(activityStart.session?.id), `q4b-${id}-activity-abandon`);

    const noAnnual = await createEvaluationOrg("q4b-no-annual");
    handles.push(noAnnual);
    await configureDisposableAi(noAnnual, config);
    const noAnnualToken = await ownerToken(noAnnual);
    const beforeException = await businessSnapshot(noAnnual);
    await budgetCheck(handles, startedAt, ledger, policy);
    const exceptionStart = await startQuarterly(noAnnual, noAnnualToken, `q4b-${id}-exception-start`);
    const exception = await sendMessage(noAnnualToken, text(exceptionStart.session?.id), [
      "A empresa ainda não concluiu o plano anual. Quero seguir conscientemente com esta exceção porque precisamos estabilizar o funil agora.",
      "No T3 2027, elevar oportunidades com próxima ação de 35% para 70% até 30/09/2027.",
      "Indicador oportunidades com próxima ação; fonte relatório semanal do funil; dono PERSON_FIXTURE_MANAGER.",
      "Ação: revisar o funil semanalmente; dono PERSON_FIXTURE_MANAGER; prazo 30/09/2027; concluída com quatro revisões consecutivas registradas.",
      "Risco: baixa disciplina. Aprendizado: gestão visual. Acompanhamento semanal. Não há outra prioridade.",
      "Os dados estão completos; apresente a proposta final para uma única confirmação.",
    ].join("\n"), `q4b-${id}-exception-message`);
    const exceptionProposal = asRecord(exception.pendingProposal);
    const alignment = asRecord(exceptionProposal.annualAlignment);
    checks.push(
      check("EXCEPTION-PROPOSAL", exceptionProposal.type === "save_quarterly_plan", "ausência anual não bloqueia o trimestre"),
      check("EXCEPTION-EXPLICIT", text(alignment.status).toLowerCase() === "exception" && text(alignment.rationale), "exceção anual fica explícita e justificada"),
      check("EXCEPTION-NO-ANNUAL-SWITCH", !ANNUAL_SWITCH_PATTERN.test(text(exception.reply)), "conversa não muda para ritual anual"),
      check("EXCEPTION-NO-PREMATURE-WRITE", beforeException === await businessSnapshot(noAnnual), "exceção não grava nada antes da confirmação"),
    );
    evidence.exception = { reply: exception.reply, proposal: exceptionProposal };
    await abandonSession(noAnnualToken, text(exceptionStart.session?.id), `q4b-${id}-exception-abandon`);

    usage = await combinedUsage(handles, startedAt);
  } catch (error) {
    executionError = sanitizeEvaluationText(error instanceof Error ? error.message : String(error));
    usage = await combinedUsage(handles, startedAt).catch(() => usage);
  } finally {
    let removed = 0;
    for (const handle of handles.reverse()) {
      try {
        await destroyEvaluationOrg(handle);
        removed += 1;
      } catch (error) {
        executionError = executionError ?? sanitizeEvaluationText(error instanceof Error ? error.message : String(error));
      }
    }
    cleanupSucceeded = removed === handles.length;
  }

  checks.push(check("CLEANUP", cleanupSucceeded, "empresas, usuários e chaves descartáveis foram removidos"));
  const passed = !executionError && checks.every((item) => item.passed);
  const nextLedger: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + usage.totalCostUsd,
    runs: [...ledger.runs, {
      runId: id,
      caseId: "Q4B-QUARTERLY-SMOKE",
      totalCostUsd: usage.totalCostUsd,
      completedAt: new Date().toISOString(),
      status: passed ? "approved" : "blocked",
    }],
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue({
    schemaVersion: 1,
    reportVersion: "2026-07-16.q4b-smoke",
    environment: "staging",
    runtime: { provider: config.provider, model: config.planningModel },
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    evidence,
    executionError,
    cost: {
      generationCostUsd: usage.totalCostUsd,
      judgeCostUsd: 0,
      totalCaseCostUsd: usage.totalCostUsd,
      cumulativePlanCostBeforeUsd: ledger.cumulativePlanCostUsd,
      cumulativePlanCostAfterUsd: nextLedger.cumulativePlanCostUsd,
    },
    cleanup: { disposableOrganizationsRemoved: cleanupSucceeded },
    status: passed ? "approved" : "blocked",
  }));
  await writePrivateJson(resolve(PRIVATE_DIR, "strategic-eval-ledger.json"), nextLedger);

  console.log(`Relatório Q4B: ${reportPath}`);
  console.log(`Gate Q4B: ${passed ? "approved" : "blocked"}; checks ${checks.filter((item) => item.passed).length}/${checks.length}.`);
  console.log(`Custo Q4B: US$ ${usage.totalCostUsd.toFixed(6)}; acumulado US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}.`);
  if (!passed) throw new Error(executionError ?? `Q4B falhou: ${checks.filter((item) => !item.passed).map((item) => item.id).join(", ")}`);
}

export async function main() {
  await runSmoke();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
