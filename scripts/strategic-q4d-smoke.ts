import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { visibleQuestions } from "../supabase/functions/_shared/session-adaptive.ts";
import { serviceClient, assertStaging } from "../tests/helpers/staging.ts";
import {
  assertBudgetAllowsNextCall,
  assertEvaluationEnvironment,
  buildStrategicQualityGate,
  sanitizeEvaluationText,
  sanitizeEvaluationValue,
  usageCostUsd,
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
  runJudge,
  runtimeConfiguration,
  writePrivateJson,
  type CostLedger,
  type EvaluationOrg,
} from "./strategic-eval.ts";
import { q4dJudgeRubric } from "./strategic-q4d-rubric.ts";

const PRIVATE_DIR = resolve(".agents-private");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const CALL_RESERVE_USD = 0.8;
const TECHNICAL_PATTERN = /\b(?:base_confirmada|state_patch|next_phase|pending_proposal|proposal|_adaptive)\b|\bfase\s+(?:abertura|alinhamento|diagnostico|sintese|síntese)\b/i;
const MECHANICAL_PATTERN = /^(?:entendi|perfeito|[oó]timo|boa)[.!,:-]?\s+(?:voc[eê]\s+(?:quer|disse|trouxe)|que\s+)/i;
const BARE_QUESTION_PATTERN = /^(?:qual|quem|quando|como|onde|quanto|o que|existe|h[aá])\b/i;

type Check = { id: string; passed: boolean; evidence: string };
type Usage = { promptTokens: number; completionTokens: number; totalTokens: number; totalCostUsd: number };
type TranscriptMessage = { role: "manager" | "oracle"; content: string; sequence: number };

function check(id: string, passed: boolean, evidence: string): Check {
  return { id, passed, evidence };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstVisibleLine(value: string) {
  return value.split("\n").map((line) => line.replace(/^[\s\-*>#]+/, "").trim()).find(Boolean) ?? "";
}

function regularTurnSentenceCount(value: string) {
  const prose = value.replace(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/g, " ").trim();
  return (prose.match(/[.!?]+(?=\s|$)/g) ?? []).length || (prose ? 1 : 0);
}

function naturalReplyChecks(label: string, reply: string, hasProposal: boolean): Check[] {
  const questions = visibleQuestions(reply);
  return [
    check(`${label}-NO-TECHNICAL`, !TECHNICAL_PATTERN.test(reply), `${label}: nenhum estado técnico aparece`),
    check(`${label}-NO-MECHANICAL`, !MECHANICAL_PATTERN.test(firstVisibleLine(reply)), `${label}: sem bordão seguido de paráfrase`),
    check(`${label}-ONE-QUESTION`, questions.length === 1, `${label}: uma única pergunta visível`),
    check(`${label}-BRIEF`, hasProposal || regularTurnSentenceCount(reply) <= 4, `${label}: resposta comum permanece curta`),
    check(`${label}-GROUNDED`, hasProposal || !BARE_QUESTION_PATTERN.test(firstVisibleLine(reply)), `${label}: pergunta parte do contexto em vez de pedir campo isolado`),
  ];
}

async function must<T>(operation: PromiseLike<{ data: T; error: any }>, label: string): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? String(result.error)}`);
  return result.data;
}

async function seedRitualContext(handle: EvaluationOrg) {
  const admin = serviceClient();
  await must(admin.from("strategic_plans").insert({
    org_id: handle.orgId,
    year: 2027,
    profile: { fixture: true },
    drivers: { purpose: "Crescer com previsibilidade", vision: "Operação comercial confiável", values: ["Clareza"] },
    swot: { strengths: ["Equipe experiente"], weaknesses: ["Funil instável"], opportunities: [], threats: [] },
    themes: ["Previsibilidade comercial"],
    rituals: ["Revisão mensal"],
    executive_summary: "Recuperar margem e previsibilidade comercial.",
  }).select("id").single(), "criar plano estratégico sintético");

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

  const annual = await must<any>(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    level: "area_annual",
    type: "harvest",
    title: "Tornar o funil comercial confiável",
    result: "Tornar o funil comercial confiável",
    metric: "Oportunidades com próxima ação",
    current: "40%",
    target: "85%",
    deadline: "2027-12-31",
    owner: "PERSON_FIXTURE_MANAGER",
    evidence_plan: "Relatório semanal do CRM",
    status: "on_track",
    progress: 20,
    parent_id: strategic.id,
    period: "2027",
  }).select("id").single(), "criar objetivo anual da área");

  const quarterly = await must<any>(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    level: "quarterly",
    type: "harvest",
    title: "Elevar adoção ativa do CRM",
    result: "Elevar adoção ativa do CRM",
    metric: "Vendedores ativos no CRM",
    current: "40%",
    target: "75%",
    deadline: "2027-06-30",
    owner: "PERSON_FIXTURE_MANAGER",
    evidence_plan: "Relatório semanal de uso do CRM",
    status: "at_risk",
    progress: 45,
    parent_id: annual.id,
    period: "T2 2027",
  }).select("id").single(), "criar objetivo trimestral sintético");

  const monthly = await must<any>(admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: handle.areaId,
    level: "monthly",
    type: "harvest",
    title: "Elevar uso disciplinado do CRM",
    result: "Elevar uso disciplinado do CRM",
    metric: "Vendedores ativos no CRM",
    current: "40%",
    target: "55%",
    deadline: "2027-05-31",
    owner: "PERSON_FIXTURE_MANAGER",
    evidence_plan: "Relatório semanal de uso do CRM",
    status: "at_risk",
    progress: 60,
    parent_id: quarterly.id,
    period: "Mai 2027",
  }).select("id").single(), "criar objetivo mensal sintético");

  await must(admin.from("key_actions").insert({
    org_id: handle.orgId,
    objective_id: monthly.id,
    description: "Treinar vendedores inativos",
    completion_criterion: "Todos os vendedores inativos treinados",
    deadline: "2027-05-20",
    owner: "PERSON_FIXTURE_MANAGER",
    status: "at_risk",
  }).select("id").single(), "criar ação mensal sintética");
}

async function businessSnapshot(handle: EvaluationOrg) {
  const admin = serviceClient();
  const tables = ["strategic_plans", "area_plans", "objectives", "key_actions", "plan_documents", "evidences", "check_ins"];
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
  const reportPath = resolve(PRIVATE_DIR, `strategic-q4d-smoke-${id}.json`);
  const handles: EvaluationOrg[] = [];
  const checks: Check[] = [];
  const evidence: Record<string, unknown> = {};
  const transcript: TranscriptMessage[] = [];
  let sequence = 0;
  let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  let judgeCostUsd = 0;
  let judgeResult: unknown = null;
  let qualityGate: ReturnType<typeof buildStrategicQualityGate> | null = null;
  let executionError: string | null = null;
  let cleanupSucceeded = false;
  const diagnosticMode = process.env.ORACULO_Q4D_DIAGNOSTIC === "1";
  const requestedLabels = new Set(String(process.env.ORACULO_Q4D_CASES ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean));

  try {
    const handle = await createEvaluationOrg("q4d-naturalidade");
    handles.push(handle);
    await configureDisposableAi(handle, config);
    await seedRitualContext(handle);
    const token = await ownerToken(handle);
    const before = await businessSnapshot(handle);

    const allCases = [
      {
        label: "ANNUAL",
        type: "strategic",
        areaId: null,
        period: "2027",
        message: "Quero colocar 'fazer uma campanha' como principal objetivo anual e crescer só 2%, mesmo sem saber se o maior problema é margem, volume ou previsibilidade.",
      },
      {
        label: "QUARTERLY",
        type: "quarterly",
        areaId: handle.areaId,
        period: "T2 2027",
        message: "Tenho oito prioridades para o trimestre, mas a equipe comporta duas. O funil está imprevisível e quero escolher o que mais ajuda o objetivo anual de torná-lo confiável.",
      },
      {
        label: "MONTHLY",
        type: "monthly",
        areaId: handle.areaId,
        period: "Jun 2027",
        message: [
          "Considere este bloco completo para junho de 2027.",
          "Vínculo: Elevar adoção ativa do CRM no T2 2027.",
          "Resultado: elevar vendedores ativos no CRM de 40% para 60% até 30/06/2027.",
          "Indicador: vendedores ativos no CRM. Fonte: relatório semanal de uso. Responsável: PERSON_FIXTURE_MANAGER.",
          "Ação: treinar vendedores inativos; responsável PERSON_FIXTURE_MANAGER; prazo 20/06/2027; concluída quando todos estiverem treinados.",
          "Risco: baixa adesão. Sem bloqueio atual. Acompanhamento semanal. Próximo compromisso: primeira revisão em 07/06/2027.",
          "Não há pendências nem outras prioridades. Os dados são suficientes; apresente a proposta final para uma única confirmação.",
        ].join("\n"),
      },
      {
        label: "STRATEGIC-REVIEW",
        type: "strategic_review",
        areaId: null,
        period: "2027",
        message: "A acurácia da previsão caiu de 52% para 45% segundo o relatório semanal. Quero revisar apenas o valor atual desse objetivo porque o fechamento validado mudou o cenário.",
      },
      {
        label: "MONTH-CLOSE",
        type: "month_close",
        areaId: handle.areaId,
        period: "Mai 2027",
        message: "O objetivo terminou em 60%, comprovado pelo relatório do CRM. Ficou parcial porque metade da equipe não adotou o processo; aprendemos que o treinamento precisa acontecer por equipe.",
      },
      {
        label: "QUARTER-CLOSE",
        type: "quarter_close",
        areaId: handle.areaId,
        period: "T2 2027",
        message: "O trimestre fechou parcial: adoção em 60% contra meta de 75%, conforme o relatório do CRM. O aprendizado foi envolver os líderes de equipe desde o início.",
      },
    ];
    const cases = requestedLabels.size > 0
      ? allCases.filter((item) => requestedLabels.has(item.label))
      : allCases;
    if (cases.length === 0) throw new Error("Nenhum caso Q4D corresponde ao filtro solicitado");

    for (const item of cases) {
      await budgetCheck(handles, startedAt, ledger, policy);
      transcript.push({
        role: "manager",
        content: `[INICIO DE RITUAL INDEPENDENTE: ${item.label}. Confirmações e perguntas devem ser avaliadas somente dentro deste ritual.]`,
        sequence: sequence += 1,
      });
      const start = await callFunction("oracle-session", token, {
        action: "start",
        orgId: handle.orgId,
        areaId: item.areaId,
        type: item.type,
        period: item.period,
        channel: "web",
      }, `q4d-${id}-${item.label.toLowerCase()}-start`);
      transcript.push({ role: "oracle", content: text(start.reply), sequence: sequence += 1 });
      transcript.push({ role: "manager", content: item.message, sequence: sequence += 1 });
      const response = await callFunction("oracle-session", token, {
        action: "message",
        sessionId: text(start.session?.id),
        message: item.message,
        channel: "web",
      }, `q4d-${id}-${item.label.toLowerCase()}-message`);
      const reply = text(response.reply);
      const hasProposal = Boolean(response.pendingProposal);
      transcript.push({ role: "oracle", content: reply, sequence: sequence += 1 });
      checks.push(...naturalReplyChecks(item.label, reply, hasProposal));
      if (item.label === "ANNUAL") {
        const diagnosisMessage = "O problema principal é margem: caiu de 12% para 7% mesmo com o volume estável, porque os descontos aumentaram e o mix piorou.";
        transcript.push({ role: "manager", content: diagnosisMessage, sequence: sequence += 1 });
        const diagnosis = await callFunction("oracle-session", token, {
          action: "message",
          sessionId: text(start.session?.id),
          message: diagnosisMessage,
          channel: "web",
        }, `q4d-${id}-annual-diagnosis`);
        const diagnosisReply = text(diagnosis.reply);
        transcript.push({ role: "oracle", content: diagnosisReply, sequence: sequence += 1 });
        checks.push(...naturalReplyChecks("ANNUAL-DIAGNOSIS", diagnosisReply, Boolean(diagnosis.pendingProposal)));
        evidence.annualDiagnosis = { message: diagnosisMessage, reply: diagnosisReply };
      }
      if (item.label === "MONTHLY") {
        checks.push(check("MONTHLY-PROPOSAL", asRecord(response.pendingProposal).type === "save_monthly_plan", "bloco mensal completo chega à proposta"));
      }
      evidence[item.label] = { opening: start.reply, message: item.message, reply, pendingProposal: response.pendingProposal ?? null };
      await callFunction("oracle-session", token, { action: "abandon", sessionId: text(start.session?.id) }, `q4d-${id}-${item.label.toLowerCase()}-abandon`);
    }

    checks.push(check("NO-PREMATURE-MUTATION", before === await businessSnapshot(handle), `${cases.length} ritual(is) não alteram o domínio sem confirmação`));
    usage = await combinedUsage(handles, startedAt);
    await budgetCheck(handles, startedAt, ledger, policy);

    if (diagnosticMode) {
      qualityGate = {
        status: checks.every((item) => item.passed) ? "approved" : "blocked",
        reasons: ["modo diagnóstico: judge qualitativo não executado"],
        rubricScores: [],
        jointAverage: null,
        criticalFailureCandidates: [],
      };
      checks.push(check("DIAGNOSTIC-GATE", qualityGate.status === "approved", "caso técnico isolado concluiu sem judge pago"));
    } else {
      const judgeRubric = q4dJudgeRubric(rubric);
      const judged = await runJudge({
        apiKey: config.apiKey,
        provider: config.provider,
        model: config.judgeModel,
        evaluationCase: {
          id: "Q4D-NATURAL-CONVERSATION",
          purpose: "Avaliar naturalidade, eficiência, fidelidade e qualidade das perguntas nos seis rituais.",
          expected: "A transcrição concatena seis rituais independentes, marcados explicitamente. Avalie repetição e confirmação dentro de cada ritual, nunca entre rituais. Espere uma pergunta por vez, sem bordões, ligada ao fato e à decisão, desafio a atividade/meta fraca e uma única confirmação quando houver proposta. Memória histórica não faz parte deste smoke e seu critério foi omitido.",
          authorizedContext: {
            annualPlan: "Recuperar margem e previsibilidade comercial em 2027.",
            strategicObjective: "Aumentar previsibilidade comercial; acurácia atual 52%, meta 80%, fonte relatório semanal do funil.",
            areaAnnualObjective: "Tornar o funil comercial confiável; atual 40%, meta 85%.",
            quarterlyObjective: "Elevar adoção ativa do CRM no T2 2027; atual 40%, meta 75%.",
            rule: "Esses fatos foram carregados pelo sistema antes dos turnos e podem ser usados sem serem tratados como invenção do Oráculo.",
          },
        },
        transcript,
        proposal: asRecord(asRecord(evidence.MONTHLY).pendingProposal),
        rubric: judgeRubric,
      });
      judgeResult = judged.result;
      judgeCostUsd = usageCostUsd(judged.usage, config.judgePricing);
      qualityGate = buildStrategicQualityGate({
        technicalGateStatus: checks.every((item) => item.passed) ? "approved" : "blocked",
        judgeStatus: "completed",
        judgeResult,
        applicableRubric: judgeRubric,
        minimumPerRubric: Number(rubric.thresholds?.minimumPerRubric ?? 80),
        minimumJointAverage: Number(rubric.thresholds?.minimumJointAverage ?? 85),
      });
      checks.push(check("QUALITY-GATE", qualityGate.status === "approved", `condução ${qualityGate.rubricScores[0]?.score ?? 0}; média ${qualityGate.jointAverage ?? 0}`));
    }
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

  checks.push(check("CLEANUP", cleanupSucceeded, "empresa, usuário e chave descartáveis foram removidos"));
  const totalCostUsd = usage.totalCostUsd + judgeCostUsd;
  const passed = !executionError && checks.every((item) => item.passed) && qualityGate?.status === "approved";
  const nextLedger: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + totalCostUsd,
    runs: [...ledger.runs, {
      runId: id,
      caseId: diagnosticMode ? "Q4D-NATURAL-CONVERSATION-DIAGNOSTIC" : "Q4D-NATURAL-CONVERSATION",
      totalCostUsd,
      completedAt: new Date().toISOString(),
      status: passed ? "approved" : "blocked",
    }],
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue({
    schemaVersion: 1,
    reportVersion: "2026-07-17.q4d-smoke",
    environment: "staging",
    mode: diagnosticMode ? "diagnostic" : "quality-gate",
    runtime: { provider: config.provider, planningModel: config.planningModel, judgeModel: config.judgeModel },
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    evidence,
    qualityGate,
    judge: judgeResult,
    executionError,
    cost: {
      generationCostUsd: usage.totalCostUsd,
      judgeCostUsd,
      totalCaseCostUsd: totalCostUsd,
      cumulativePlanCostBeforeUsd: ledger.cumulativePlanCostUsd,
      cumulativePlanCostAfterUsd: nextLedger.cumulativePlanCostUsd,
    },
    cleanup: { disposableOrganizationsRemoved: cleanupSucceeded },
    status: passed ? "approved" : "blocked",
  }));
  await writePrivateJson(resolve(PRIVATE_DIR, "strategic-eval-ledger.json"), nextLedger);

  console.log(`Relatório Q4D: ${reportPath}`);
  console.log(`Gate Q4D: ${passed ? "approved" : "blocked"}; checks ${checks.filter((item) => item.passed).length}/${checks.length}; condução ${qualityGate?.rubricScores[0]?.score ?? 0}.`);
  console.log(`Custo Q4D: geração US$ ${usage.totalCostUsd.toFixed(6)} + judge US$ ${judgeCostUsd.toFixed(6)} = US$ ${totalCostUsd.toFixed(6)}; acumulado US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}.`);
  if (!passed) throw new Error(executionError ?? qualityGate?.reasons.join(" | ") ?? `Q4D falhou: ${checks.filter((item) => !item.passed).map((item) => item.id).join(", ")}`);
}

export async function main() {
  await runSmoke();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
