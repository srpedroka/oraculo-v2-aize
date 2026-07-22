import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serviceClient } from "../tests/helpers/staging.ts";
import { assertStaging } from "../tests/helpers/staging.ts";
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
import { repeatsPreviousQuestion, visibleQuestions } from "../supabase/functions/_shared/session-adaptive.ts";

const PRIVATE_DIR = resolve(".agents-private");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const CALL_RESERVE_USD = 0.15;
const TECHNICAL_STATE_PATTERN = /\b(?:base_confirmada|state_patch|next_phase|pending_proposal|proposal)\b|\bfase\s+(?:abertura|alinhamento|diagnostico|sintese|síntese)\b/i;

type Check = { id: string; passed: boolean; evidence: string };

function check(id: string, passed: boolean, evidence: string): Check {
  return { id, passed, evidence };
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
    swot: { strengths: ["Equipe experiente"], weaknesses: ["Previsao instavel"], opportunities: [], threats: [] },
    themes: ["Previsibilidade comercial"],
    rituals: ["Revisao mensal"],
    executive_summary: "Aumentar previsibilidade comercial sem elevar estoque.",
  }).select("id").single(), "criar plano anual sintetico");

  await must(admin.from("objectives").insert([
    {
      org_id: handle.orgId,
      area_id: null,
      level: "strategic",
      type: "harvest",
      title: "Aumentar previsibilidade comercial",
      result: "Aumentar previsibilidade comercial",
      metric: "Acuracia da previsao",
      current: "52%",
      target: "75%",
      deadline: "2027-12-31",
      owner: "PERSON_FIXTURE_OWNER",
      evidence_plan: "Relatorio semanal do funil",
      status: "on_track",
      progress: 20,
      period: "2027",
    },
    {
      org_id: handle.orgId,
      area_id: handle.areaId,
      level: "area_annual",
      type: "harvest",
      title: "Tornar a previsao comercial confiavel",
      result: "Tornar a previsao comercial confiavel",
      metric: "Acuracia da previsao",
      current: "52%",
      target: "75%",
      deadline: "2027-12-31",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatorio semanal do funil",
      status: "on_track",
      progress: 20,
      period: "2027",
    },
  ]).select("id"), "criar objetivos superiores sinteticos");
}

async function businessSnapshot(handle: EvaluationOrg) {
  const admin = serviceClient();
  const tables = ["strategic_plans", "area_plans", "objectives", "key_actions", "strategic_projects", "plan_documents"];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    const result = await admin.from(table).select("*").eq("org_id", handle.orgId);
    if (result.error) throw result.error;
    data[table] = [...(result.data ?? [])].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
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
  return await callFunction("oracle-session", token, {
    action: "message",
    sessionId,
    message,
    channel: "web",
  }, requestId);
}

async function abandonSession(token: string, sessionId: string, requestId: string) {
  await callFunction("oracle-session", token, {
    action: "abandon",
    sessionId,
  }, requestId);
}

async function runSmoke() {
  assertEvaluationEnvironment(process.env);
  assertStaging();
  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const policy = rubric.costPolicy;
  const config = runtimeConfiguration();
  const scenario = String(process.env.ORACULO_Q4A_SCENARIO ?? "all");
  if (!["all", "complete", "vague", "loop"].includes(scenario)) {
    throw new Error("ORACULO_Q4A_SCENARIO aceita all, complete, vague ou loop");
  }
  const ledger = await readLedger();
  assertBudgetAllowsNextCall({
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
    currentCaseCostUsd: 0,
    reserveUsd: CALL_RESERVE_USD,
    policy,
  });

  const id = runId();
  const startedAt = new Date().toISOString();
  const reportPath = resolve(PRIVATE_DIR, `strategic-q4a-smoke-${id}.json`);
  let handle: EvaluationOrg | null = null;
  let cleanupSucceeded = false;
  let executionError: string | null = null;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  const checks: Check[] = [];
  const evidence: Record<string, unknown> = {};

  try {
    handle = await createEvaluationOrg("q4a-smoke");
    await configureDisposableAi(handle, config);
    await seedQuarterlyContext(handle);
    const token = await ownerToken(handle);
    const beforeHash = await businessSnapshot(handle);

    if (scenario === "all" || scenario === "complete") {
      const completeStart = await startQuarterly(handle, token, `q4a-${id}-complete-start`);
    const completeMessage = [
      "Considere este bloco completo para o plano Comercial do T3 2027.",
      "Desafio principal: a previsao de vendas inconsistente gera excesso de estoque e pressiona o caixa.",
      "Alinhamento: o objetivo estrategico relevante e aumentar a previsibilidade comercial.",
      "Papel da area: transformar oportunidades em receita previsivel; objetivo anual: tornar a previsao comercial confiavel.",
      "Diagnostico: forcas = equipe experiente, carteira recorrente e rotina semanal; gargalos = CRM incompleto, etapas sem padrao e baixa disciplina de atualizacao.",
      "Objetivo trimestral: elevar a acuracia da previsao de 52% para 75% ate 30/09/2027, medida no relatorio semanal do funil, responsavel PERSON_FIXTURE_MANAGER.",
      "Entregas: padronizar etapas do funil ate 31/07; migrar a base ate 31/08; colocar 80% dos vendedores em uso ativo ate 30/09.",
      "Foco de aprendizado: melhorar disciplina de previsao e leitura dos gargalos do funil.",
      "Os dados sao suficientes; apresente agora a sintese e a proposta final para uma unica confirmacao.",
    ].join("\n");
    const complete = await sendMessage(token, String(completeStart.session?.id ?? ""), completeMessage, `q4a-${id}-complete-message`);
    const completeReply = String(complete.reply ?? "");
    const completeQuestions = visibleQuestions(completeReply);
    const completeState = complete.session?.state && typeof complete.session.state === "object" ? complete.session.state : {};
    const confirmedFacts = Array.isArray(completeState?._adaptive?.confirmed_facts) ? completeState._adaptive.confirmed_facts : [];
    checks.push(
      check("COMPLETE-PROPOSAL", complete.pendingProposal?.type === "save_quarterly_plan", "bloco completo deve chegar a proposta trimestral"),
      check("COMPLETE-ONE-CONFIRMATION", completeQuestions.length === 1 && /(confirm|gravar|salvar)/i.test(completeQuestions[0] ?? ""), "proposta deve ter uma confirmacao visivel"),
      check("COMPLETE-CANONICAL-FACTS", confirmedFacts.length > 0 && confirmedFacts.every((key: string) => key !== "_adaptive" && completeState[key] != null), "fatos confirmados devem existir no estado canonico"),
      check("COMPLETE-NO-TECHNICAL-LEAK", !TECHNICAL_STATE_PATTERN.test(completeReply), "resposta completa nao expoe estado tecnico"),
    );
    evidence.complete = { opening: completeStart.reply, reply: completeReply, proposalType: complete.pendingProposal?.type ?? null, confirmedFacts };
      await abandonSession(token, String(completeStart.session?.id ?? ""), `q4a-${id}-complete-abandon`);
    }

    if (scenario === "all" || scenario === "vague") {
      usage = await generationUsage(handle, startedAt);
      assertBudgetAllowsNextCall({ cumulativePlanCostUsd: ledger.cumulativePlanCostUsd, currentCaseCostUsd: usage.totalCostUsd, reserveUsd: CALL_RESERVE_USD, policy });
      const vagueStart = await startQuarterly(handle, token, `q4a-${id}-vague-start`);
    const vague = await sendMessage(token, String(vagueStart.session?.id ?? ""), "Precisamos vender mais.", `q4a-${id}-vague-message`);
    const vagueReply = String(vague.reply ?? "");
    checks.push(
      check("VAGUE-NO-PROPOSAL", !vague.pendingProposal, "resposta vaga nao pode gerar proposta"),
      check("VAGUE-ONE-QUESTION", visibleQuestions(vagueReply).length === 1, "resposta vaga deve conter uma pergunta"),
      check("VAGUE-GUIDED-OPTIONS", hasGuidedOptions(vagueReply), "resposta vaga deve oferecer possibilidades neutras"),
      check("VAGUE-NO-TECHNICAL-LEAK", !TECHNICAL_STATE_PATTERN.test(vagueReply), "resposta vaga nao expoe estado tecnico"),
    );
    evidence.vague = { opening: vagueStart.reply, reply: vagueReply };
    checks.push(check("VAGUE-FRESH-SESSION", !/retomei sua sessao/i.test(String(vagueStart.reply ?? "")), "cenario vago usa sessao isolada"));
      await abandonSession(token, String(vagueStart.session?.id ?? ""), `q4a-${id}-vague-abandon`);
    }

    if (scenario === "all" || scenario === "loop") {
      usage = await generationUsage(handle, startedAt);
      assertBudgetAllowsNextCall({ cumulativePlanCostUsd: ledger.cumulativePlanCostUsd, currentCaseCostUsd: usage.totalCostUsd, reserveUsd: CALL_RESERVE_USD, policy });
      const loopStart = await startQuarterly(handle, token, `q4a-${id}-loop-start`);
    const loop = await sendMessage(token, String(loopStart.session?.id ?? ""), "O principal desafio e a baixa conversao das oportunidades em vendas.", `q4a-${id}-loop-message`);
    const loopReply = String(loop.reply ?? "");
    checks.push(
      check("LOOP-NOT-REPEATED", !repeatsPreviousQuestion(loopReply, String(loopStart.reply ?? "")), "a pergunta seguinte nao repete a abertura"),
      check("LOOP-ONE-QUESTION", visibleQuestions(loopReply).length === 1, "a proxima lacuna aparece em uma pergunta"),
      check("LOOP-NO-TECHNICAL-LEAK", !TECHNICAL_STATE_PATTERN.test(loopReply), "resposta anti-loop nao expoe estado tecnico"),
    );
    evidence.loop = { opening: loopStart.reply, reply: loopReply };
    checks.push(check("LOOP-FRESH-SESSION", !/retomei sua sessao/i.test(String(loopStart.reply ?? "")), "cenario anti-loop usa sessao isolada"));
      await abandonSession(token, String(loopStart.session?.id ?? ""), `q4a-${id}-loop-abandon`);
    }

    const afterHash = await businessSnapshot(handle);
    checks.push(check("NO-PREMATURE-MUTATION", beforeHash === afterHash, "nenhum plano foi gravado antes de confirmacao"));
    usage = await generationUsage(handle, startedAt);
  } catch (error) {
    executionError = sanitizeEvaluationText(error instanceof Error ? error.message : String(error));
    if (handle) usage = await generationUsage(handle, startedAt).catch(() => usage);
  } finally {
    if (handle) {
      try {
        await destroyEvaluationOrg(handle);
        cleanupSucceeded = true;
      } catch (error) {
        executionError = executionError ?? sanitizeEvaluationText(error instanceof Error ? error.message : String(error));
      }
    }
  }

  checks.push(check("CLEANUP", cleanupSucceeded, "empresa, usuario e chave descartaveis foram removidos"));
  const passed = !executionError && checks.every((item) => item.passed);
  const nextLedger: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + usage.totalCostUsd,
    runs: [...ledger.runs, {
      runId: id,
      caseId: `Q4A-ADAPTIVE-SMOKE-${scenario.toUpperCase()}`,
      totalCostUsd: usage.totalCostUsd,
      completedAt: new Date().toISOString(),
      status: passed ? "approved" : "blocked",
    }],
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue({
    schemaVersion: 1,
    reportVersion: "2026-07-16.q4a-smoke",
    environment: "staging",
    runtime: { provider: config.provider, model: config.planningModel, scenario },
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
    cleanup: { disposableOrganizationRemoved: cleanupSucceeded, providerKeyRemovedWithOrganization: cleanupSucceeded },
    status: passed ? "approved" : "blocked",
  }));
  await writePrivateJson(resolve(PRIVATE_DIR, "strategic-eval-ledger.json"), nextLedger);

  console.log(`Relatorio Q4A: ${reportPath}`);
  console.log(`Gate Q4A: ${passed ? "approved" : "blocked"}; checks ${checks.filter((item) => item.passed).length}/${checks.length}.`);
  console.log(`Custo Q4A: US$ ${usage.totalCostUsd.toFixed(6)}; acumulado US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}.`);
  if (!passed) throw new Error(executionError ?? `Q4A falhou: ${checks.filter((item) => !item.passed).map((item) => item.id).join(", ")}`);
}

export async function main() {
  await runSmoke();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
