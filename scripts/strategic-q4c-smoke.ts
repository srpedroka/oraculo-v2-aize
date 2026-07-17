import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { visibleQuestions } from "../supabase/functions/_shared/session-adaptive.ts";
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

const PRIVATE_DIR = resolve(".agents-private");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const CALL_RESERVE_USD = 0.8;
const RITUAL_SWITCH_PATTERN = /\b(?:construir|montar|iniciar|come[cç]ar)\s+(?:o\s+)?(?:planejamento|plano)\s+(?:estrat[eé]gico\s+)?(?:anual|trimestral|do trimestre)\b/i;

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

async function must<T>(operation: PromiseLike<{ data: T; error: any }>, label: string): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? String(result.error)}`);
  return result.data;
}

async function seedMonthlyContext(handle: EvaluationOrg) {
  const admin = serviceClient();
  const quarterly = await must<any>(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    level: "quarterly",
    type: "harvest",
    title: "Aumentar adoção ativa do CRM",
    result: "Elevar adoção do CRM no trimestre",
    metric: "Vendedores ativos no CRM",
    current: "40%",
    target: "75%",
    deadline: "2027-06-30",
    owner: "PERSON_FIXTURE_MANAGER",
    evidence_plan: "Relatório semanal de uso do CRM",
    status: "on_track",
    progress: 20,
    period: "T2 2027",
  }).select("id").single(), "criar objetivo trimestral sintético");

  await must(admin.from("check_ins").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    period: "Abr 2027",
    summary: "Pendência rolada: concluir integração do CRM com o ERP; fornecedor atrasou a homologação.",
    details: {
      management_pulse: {
        confidence: "yellow",
        blocker: "Atraso do fornecedor",
        nextCommitment: "Decidir novo prazo em maio",
      },
    },
    created_by: handle.userId,
  }).select("id").single(), "criar pendência sintética");
  return quarterly;
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

async function startMonthly(handle: EvaluationOrg, token: string, requestId: string) {
  return await callFunction("oracle-session", token, {
    action: "start",
    orgId: handle.orgId,
    areaId: handle.areaId,
    type: "monthly",
    period: "Mai 2027",
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
  const reportPath = resolve(PRIVATE_DIR, `strategic-q4c-smoke-${id}.json`);
  const handles: EvaluationOrg[] = [];
  let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  let executionError: string | null = null;
  let cleanupSucceeded = false;
  const checks: Check[] = [];
  const evidence: Record<string, unknown> = {};

  try {
    const primary = await createEvaluationOrg("q4c-primary");
    handles.push(primary);
    await configureDisposableAi(primary, config);
    const quarterly = await seedMonthlyContext(primary);
    const primaryToken = await ownerToken(primary);
    const beforeComplete = await businessSnapshot(primary);

    await budgetCheck(handles, startedAt, ledger, policy);
    const completeStart = await startMonthly(primary, primaryToken, `q4c-${id}-complete-start`);
    const complete = await sendMessage(primaryToken, text(completeStart.session?.id), [
      "Considere este bloco completo para o plano Comercial de maio de 2027.",
      "Vínculo trimestral: Aumentar adoção ativa do CRM, objetivo do T2 2027 já cadastrado.",
      "Resultado mensal: elevar vendedores ativos no CRM de 40% para 55% até 31/05/2027.",
      "Indicador: vendedores ativos no CRM. Fonte: relatório semanal de uso do CRM. Responsável: PERSON_FIXTURE_MANAGER.",
      "Ação 1: treinar vendedores inativos; dono PERSON_FIXTURE_MANAGER; prazo 12/05/2027; concluída quando todos os inativos estiverem treinados.",
      "Ação 2: corrigir cadastros incompletos; dono PERSON_FIXTURE_MANAGER; prazo 20/05/2027; concluída quando 95% da base passar na auditoria.",
      "Ação 3: revisar adoção toda sexta; dono PERSON_FIXTURE_MANAGER; prazo 28/05/2027; concluída quando quatro revisões estiverem registradas.",
      "Risco: atraso do fornecedor. Bloqueio atual: nenhum. Acompanhamento semanal. Próximo compromisso: revisar a primeira medição em 07/05/2027.",
      "Não há pendências herdadas nem outras prioridades para este plano. Os dados são suficientes; apresente a proposta final para uma única confirmação.",
    ].join("\n"), `q4c-${id}-complete-message`);
    const proposal = asRecord(complete.pendingProposal);
    const objective = asRecord(asArray(proposal.objectives)[0]);
    const actions = asArray(objective.actions);
    const alignment = asRecord(proposal.quarterlyAlignment);
    checks.push(
      check("COMPLETE-PROPOSAL", proposal.type === "save_monthly_plan", "gestor completo chega à proposta mensal"),
      check("COMPLETE-ONE-CONFIRM", visibleQuestions(text(complete.reply)).length === 1, "resumo final contém uma confirmação"),
      check("COMPLETE-VERIFIABLE", [objective.metric, objective.current, objective.target, objective.source, objective.deadline, objective.owner].every((value) => text(value)), "resultado preserva indicador, baseline, alvo, fonte, prazo e dono"),
      check("COMPLETE-ACTIONS", actions.length === 3 && actions.every((action) => text(asRecord(action).owner) && text(asRecord(action).deadline) && text(asRecord(action).completionCriterion)), "três ações completas foram preservadas"),
      check("COMPLETE-QUARTER-LINK", text(alignment.status).toLowerCase() === "linked" && (text(alignment.quarterlyObjectiveId) || text(objective.linkedQuarterlyObjectiveId) || text(objective.parentTitle)), "vínculo com T2 2027 aparece na proposta"),
      check("COMPLETE-NO-RITUAL-SWITCH", !RITUAL_SWITCH_PATTERN.test(text(complete.reply)), "conversa não muda para ritual anual ou trimestral"),
      check("COMPLETE-NO-PREMATURE-WRITE", beforeComplete === await businessSnapshot(primary), "nenhum dado de negócio muda antes da confirmação"),
    );

    await callFunction("oracle-session", primaryToken, { action: "confirm", sessionId: text(completeStart.session?.id), channel: "web" }, `q4c-${id}-complete-confirm`);
    const admin = serviceClient();
    const savedObjective = await must<any>(admin.from("objectives")
      .select("*")
      .eq("org_id", primary.orgId)
      .eq("level", "monthly")
      .eq("period", "Mai 2027")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(), "ler resultado mensal salvo");
    const savedActions = await must<any[]>(admin.from("key_actions").select("*").eq("objective_id", savedObjective.id), "ler ações mensais salvas");
    const savedDocument = await must<any>(admin.from("plan_documents")
      .select("*")
      .eq("org_id", primary.orgId)
      .eq("type", "monthly")
      .eq("period", "Mai 2027")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(), "ler documento mensal salvo");
    const documentContent = asRecord(savedDocument.content);
    const documentObjective = asRecord(asArray(documentContent.objetivos)[0]);
    const monthlyDocument = asRecord(documentContent.monthly);
    checks.push(
      check("SAVED-PARENT", savedObjective.parent_id === quarterly.id, "resultado mensal aponta para o objetivo de T2 2027 existente"),
      check("SAVED-OBJECTIVE", savedObjective.current === text(objective.current) && savedObjective.target === text(objective.target) && savedObjective.evidence_plan === text(objective.source), "banco preserva baseline, alvo e fonte"),
      check("SAVED-ACTIONS", savedActions.length === 3 && savedActions.every((action) => action.owner && action.deadline && action.completion_criterion), "banco preserva ações com dono, prazo e critério"),
      check("SAVED-DOCUMENT", documentObjective.atual === text(objective.current) && documentObjective.fonte === text(objective.source) && asArray(documentObjective.acoes).length === 3, "documento canônico preserva resultado e ações"),
      check("SAVED-MONTHLY-METADATA", asRecord(monthlyDocument.alinhamento_trimestral).status === "linked" && monthlyDocument.cadencia && monthlyDocument.proximo_compromisso, "documento preserva alinhamento, cadência e próximo compromisso"),
    );
    evidence.complete = { reply: complete.reply, proposal, savedObjective, savedActions, documentContent };

    await budgetCheck(handles, startedAt, ledger, policy);
    const pendingStart = await startMonthly(primary, primaryToken, `q4c-${id}-pending-start`);
    const pending = await sendMessage(primaryToken, text(pendingStart.session?.id), [
      "A integração do CRM com o ERP ficou pendente de abril porque o fornecedor atrasou.",
      "Ainda não decidi o que fazer com ela em maio.",
    ].join("\n"), `q4c-${id}-pending-message`);
    checks.push(
      check("PENDING-NO-SILENT-PROPOSAL", !pending.pendingProposal, "pendência sem decisão não entra silenciosamente no plano"),
      check("PENDING-ONE-DECISION", visibleQuestions(text(pending.reply)).length === 1 && /rol|reneg|cort|backlog|adiar/i.test(text(pending.reply)), "Oráculo pede uma decisão entre destinos executáveis"),
    );
    evidence.pending = { reply: pending.reply };
    await abandonSession(primaryToken, text(pendingStart.session?.id), `q4c-${id}-pending-abandon`);

    await budgetCheck(handles, startedAt, ledger, policy);
    const overloadStart = await startMonthly(primary, primaryToken, `q4c-${id}-overload-start`);
    const overload = await sendMessage(primaryToken, text(overloadStart.session?.id), [
      "Tenho doze ações para maio, mas a equipe comporta no máximo cinco.",
      "Três movem a adoção do CRM e duas reduzem o risco da integração; as outras sete podem ser adiadas.",
      "Quero decidir o que fica comprometido e deixar o restante visível no backlog.",
    ].join("\n"), `q4c-${id}-overload-message`);
    const overloadProposal = asRecord(overload.pendingProposal);
    const committedActions = asArray(overloadProposal.objectives).flatMap((item) => asArray(asRecord(item).actions));
    checks.push(
      check("OVERLOAD-MAX-FIVE", committedActions.length <= 5, "nenhuma proposta excede cinco ações comprometidas"),
      check("OVERLOAD-GUIDED", visibleQuestions(text(overload.reply)).length === 1 || asArray(overloadProposal.backlog).length > 0, "capacidade vira decisão guiada ou backlog explícito"),
    );
    evidence.overload = { reply: overload.reply, proposal: overload.pendingProposal ?? null };
    await abandonSession(primaryToken, text(overloadStart.session?.id), `q4c-${id}-overload-abandon`);

    const noQuarter = await createEvaluationOrg("q4c-no-quarter");
    handles.push(noQuarter);
    await configureDisposableAi(noQuarter, config);
    const noQuarterToken = await ownerToken(noQuarter);
    const beforeException = await businessSnapshot(noQuarter);
    await budgetCheck(handles, startedAt, ledger, policy);
    const exceptionStart = await startMonthly(noQuarter, noQuarterToken, `q4c-${id}-exception-start`);
    const exception = await sendMessage(noQuarterToken, text(exceptionStart.session?.id), [
      "Não existe plano trimestral para T2 2027. Quero seguir conscientemente com maio como exceção porque há uma obrigação contratual com prazo neste mês.",
      "Resultado mensal: elevar entregas contratuais no prazo de 70% para 95% até 31/05/2027.",
      "Indicador: entregas contratuais no prazo. Fonte: relatório de aceite do cliente. Responsável: PERSON_FIXTURE_MANAGER.",
      "Ação: revisar entregas abertas com o cliente; dono PERSON_FIXTURE_MANAGER; prazo 20/05/2027; concluída quando todas tiverem aceite ou plano de correção.",
      "Risco: retorno tardio do cliente. Acompanhamento semanal. Próximo compromisso: primeira revisão em 07/05/2027.",
      "Os dados estão completos; apresente a proposta final para uma única confirmação.",
    ].join("\n"), `q4c-${id}-exception-message`);
    const exceptionProposal = asRecord(exception.pendingProposal);
    const exceptionAlignment = asRecord(exceptionProposal.quarterlyAlignment);
    const exceptionObjective = asRecord(asArray(exceptionProposal.objectives)[0]);
    checks.push(
      check("EXCEPTION-PROPOSAL", exceptionProposal.type === "save_monthly_plan", "ausência trimestral não bloqueia o mês"),
      check("EXCEPTION-EXPLICIT", text(exceptionAlignment.status).toLowerCase() === "exception" && text(exceptionAlignment.rationale), "exceção trimestral fica explícita e justificada"),
      check("EXCEPTION-NO-LINK", !text(exceptionAlignment.quarterlyObjectiveId) && !text(exceptionAlignment.quarterlyObjectiveTitle) && !text(exceptionObjective.parentTitle), "exceção não inventa objetivo trimestral"),
      check("EXCEPTION-NO-RITUAL-SWITCH", !RITUAL_SWITCH_PATTERN.test(text(exception.reply)), "conversa permanece no plano mensal"),
      check("EXCEPTION-NO-PREMATURE-WRITE", beforeException === await businessSnapshot(noQuarter), "exceção não grava nada antes da confirmação"),
    );
    evidence.exception = { reply: exception.reply, proposal: exceptionProposal };
    await abandonSession(noQuarterToken, text(exceptionStart.session?.id), `q4c-${id}-exception-abandon`);

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
      caseId: "Q4C-MONTHLY-SMOKE",
      totalCostUsd: usage.totalCostUsd,
      completedAt: new Date().toISOString(),
      status: passed ? "approved" : "blocked",
    }],
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue({
    schemaVersion: 1,
    reportVersion: "2026-07-16.q4c-smoke",
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

  console.log(`Relatório Q4C: ${reportPath}`);
  console.log(`Gate Q4C: ${passed ? "approved" : "blocked"}; checks ${checks.filter((item) => item.passed).length}/${checks.length}.`);
  console.log(`Custo Q4C: US$ ${usage.totalCostUsd.toFixed(6)}; acumulado US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}.`);
  if (!passed) throw new Error(executionError ?? `Q4C falhou: ${checks.filter((item) => !item.passed).map((item) => item.id).join(", ")}`);
}

export async function main() {
  await runSmoke();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
