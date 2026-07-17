import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serviceClient } from "../tests/helpers/staging.ts";
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
  domainSnapshotHash,
  generationUsage,
  ownerToken,
  purgeEvaluationOrg,
  readJson,
  readLedger,
  runId,
  runJudge,
  runtimeConfiguration,
  writePrivateJson,
  type CostLedger,
  type EvaluationOrg,
  type TranscriptMessage,
} from "./strategic-eval.ts";
import {
  aggregateBaseline,
  baselineRunKey,
  blockPathForPhase,
  buildBaselineChecks,
  buildManagerTurns,
  classifyDefects,
  compareStrategicRegression,
  countConfirmationPrompts,
  expectedPeriod,
  expectedProposalType,
  isGenerativeCase,
  proposalShouldExist,
  selectRubricForCase,
  type BaselineRunSummary,
} from "./strategic-baseline-lib.ts";
import {
  validateReferenceCaseCatalog,
  type ReferenceCase,
  type ReferenceCaseBlock,
  type ReferenceCaseManifest,
  type ReferencePhase,
} from "./strategic-reference-cases.ts";

const PRIVATE_DIR = resolve(".agents-private");
const LEDGER_PATH = resolve(PRIVATE_DIR, "strategic-eval-ledger.json");
const REQUESTED_COHORT = String(process.env.ORACULO_STRATEGIC_COHORT ?? "q3").toLowerCase();
if (!["q3", "q5"].includes(REQUESTED_COHORT)) throw new Error("ORACULO_STRATEGIC_COHORT deve ser q3 ou q5");
const EVALUATION_COHORT = REQUESTED_COHORT as "q3" | "q5";
const COHORT_LABEL = EVALUATION_COHORT.toUpperCase();
const COHORT_VERSION = EVALUATION_COHORT === "q5" ? "2026-07-17.q5-regression" : "2026-07-16.q3-baseline";
const PROGRESS_PATH = resolve(PRIVATE_DIR, `strategic-${EVALUATION_COHORT}-progress.json`);
const SUMMARY_PATH = resolve(PRIVATE_DIR, EVALUATION_COHORT === "q5" ? "strategic-q5-regression-summary.json" : "strategic-q3-baseline-summary.json");
const DETERMINISTIC_PATH = resolve(PRIVATE_DIR, `strategic-${EVALUATION_COHORT}-deterministic-evidence.json`);
const HUMAN_REVIEW_PATH = resolve(PRIVATE_DIR, `strategic-${EVALUATION_COHORT}-human-review.md`);
const Q3_PROGRESS_PATH = resolve(PRIVATE_DIR, "strategic-q3-progress.json");
const Q5_COMPARISON_PATH = resolve(PRIVATE_DIR, "strategic-q5-comparison.json");
const Q5_HUMAN_KEY_PATH = resolve(PRIVATE_DIR, "strategic-q5-human-review-key.json");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const CATALOG_PATH = resolve("tests/evals/strategic-quality/cases/q2-catalog.json");
const COVERAGE_PATH = resolve("tests/evals/strategic-quality/deliverable-coverage.json");
const PLANNING_RESERVE_USD = 0.15;
const JUDGE_RESERVE_USD = 0.1;

interface StrategicProgress {
  schemaVersion: 1;
  baselineVersion: string;
  startedAt: string;
  initialCumulativeCostUsd: number;
  runs: BaselineRunSummary[];
  calibrationRuns?: Array<BaselineRunSummary & { calibrationReason: string; archivedAt: string }>;
  deterministic: Array<{
    caseId: string;
    status: "pass" | "fail" | "pending-human";
    evidence: string[];
  }>;
}

interface SeededContext {
  annualObjectiveId: string | null;
  areaAnnualObjectiveId: string | null;
  quarterlyObjectiveId: string | null;
  monthlyObjectiveId: string | null;
}

interface ExecuteCaseOptions {
  runLabel?: string;
  reportVersion?: string;
  ledgerLabel?: string;
}

const PHASE_SUFFIX_TO_REFERENCE: Record<string, ReferencePhase> = {
  A: "Q2A",
  B: "Q2B",
  C: "Q2C",
  D: "Q2D",
  E: "Q2E",
};

function errorMessage(error: unknown) {
  return sanitizeEvaluationText(error instanceof Error ? error.message : String(error));
}

async function readProgress(initialCostUsd: number, path = PROGRESS_PATH): Promise<StrategicProgress> {
  try {
    const parsed = await readJson(path) as StrategicProgress;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.deterministic)) {
      throw new Error(`progresso ${COHORT_LABEL} invalido`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      baselineVersion: COHORT_VERSION,
      startedAt: new Date().toISOString(),
      initialCumulativeCostUsd: initialCostUsd,
      runs: [],
      deterministic: [],
    };
  }
}

async function readRequiredProgress(path: string, label: string): Promise<StrategicProgress> {
  const parsed = await readJson(path) as StrategicProgress;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.deterministic)) {
    throw new Error(`${label} invalido ou incompleto`);
  }
  return parsed;
}

async function loadCatalog() {
  const manifest = await readJson(CATALOG_PATH) as ReferenceCaseManifest;
  const phases: ReferencePhase[] = ["Q2A", "Q2B", "Q2C", "Q2D", "Q2E"];
  const blocks = await Promise.all(phases.map(async (phase) =>
    await readJson(resolve(blockPathForPhase(phase))) as ReferenceCaseBlock
  ));
  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const coverage = await readJson(COVERAGE_PATH) as any;
  validateReferenceCaseCatalog({ manifest, blocks, rubric, coverage });
  if (manifest.gateStatus !== "owner-approved") throw new Error(`${COHORT_LABEL} exige catalogo Q2 aprovado pelo owner`);
  return { manifest, blocks, rubric };
}

async function must<T>(operation: PromiseLike<{ data: T; error: any }>, label: string): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? String(result.error)}`);
  return result.data;
}

function areaNameForCase(item: ReferenceCase) {
  const text = `${item.caseId} ${item.input.opening}`.toLowerCase();
  if (text.includes("equivalent-area") || text.includes("industrial") || text.includes("producao")) return "Producao";
  if (text.includes("marketing")) return "Marketing";
  if (text.includes("operacoes")) return "Operacoes";
  return "Comercial";
}

function upperObjectiveTitle(item: ReferenceCase) {
  const afterColon = item.input.upperLevelContext.split(":").slice(1).join(":").trim();
  return afterColon || "Executar a prioridade estrategica sintetica de 2027";
}

async function insertHistoricalDocuments(handle: EvaluationOrg, item: ReferenceCase) {
  const admin = serviceClient();
  let competingAreaId: string | null = null;
  if (item.input.competingContext.length) {
    const area = await must(admin.from("areas").insert({
      org_id: handle.orgId,
      name: "Financeiro",
      coordinator_id: handle.owner.membershipId,
    }).select("id").single(), "criar area concorrente");
    competingAreaId = String((area as any).id);
  }
  const historicalType = item.sessionType === "strategic" ? "strategic"
    : item.sessionType === "monthly" || item.sessionType === "month_close" ? "monthly"
    : "quarterly";
  const rows = [
    ...item.input.histories.map((raw, index) => ({
      org_id: handle.orgId,
      area_id: item.sessionType === "strategic" ? null : handle.areaId,
      type: historicalType,
      period: item.sessionType === "strategic" ? "2026" : item.sessionType === "monthly" || item.sessionType === "month_close" ? "Jun 2027" : "T2 2027",
      title: `Historico relevante ${index + 1}`,
      content: { raw, source: "fixture Q3", note: "referencia sintetica" },
      version: 1,
      origin: "historical",
      created_by: handle.owner.id,
    })),
    ...item.input.competingContext.map((raw, index) => ({
      org_id: handle.orgId,
      area_id: competingAreaId,
      type: "monthly",
      period: "Jun 2027",
      title: `Contexto concorrente ${index + 1}`,
      content: { raw, source: "fixture Q3", note: "nao aplicavel ao escopo principal" },
      version: 1,
      origin: "historical",
      created_by: handle.owner.id,
    })),
  ];
  if (rows.length) await must(admin.from("plan_documents").insert(rows).select("id"), "criar historicos sinteticos");
}

async function seedCaseContext(handle: EvaluationOrg, item: ReferenceCase): Promise<SeededContext> {
  const admin = serviceClient();
  const areaName = areaNameForCase(item);
  await must(admin.from("areas").update({ name: areaName }).eq("id", handle.areaId).eq("org_id", handle.orgId).select("id"), "renomear area sintetica");
  await insertHistoricalDocuments(handle, item);

  if (item.sessionType === "strategic") {
    return { annualObjectiveId: null, areaAnnualObjectiveId: null, quarterlyObjectiveId: null, monthlyObjectiveId: null };
  }

  const noAnnual = /nenhum plano anual|ausencia proposital/i.test(item.input.upperLevelContext);
  let annualObjectiveId: string | null = null;
  let areaAnnualObjectiveId: string | null = null;
  let quarterlyObjectiveId: string | null = null;
  let monthlyObjectiveId: string | null = null;

  if (!noAnnual) {
    await must(admin.from("strategic_plans").insert({
      org_id: handle.orgId,
      year: 2027,
      profile: { fixture: true },
      drivers: { purpose: "Executar com clareza", vision: "Crescer com previsibilidade", values: ["Clareza"] },
      swot: { strengths: ["Equipe comprometida"], weaknesses: ["Previsibilidade baixa"], opportunities: ["Padronizacao"], threats: ["Capacidade limitada"] },
      themes: ["Previsibilidade com disciplina"],
      rituals: ["Revisao mensal"],
      executive_summary: "Plano superior sintetico para a avaliacao Q3.",
    }).select("id").single(), "criar plano anual sintetico");
    const strategic = await must(admin.from("objectives").insert({
      org_id: handle.orgId,
      area_id: null,
      level: "strategic",
      type: "harvest",
      title: upperObjectiveTitle(item),
      result: upperObjectiveTitle(item),
      metric: "Indicador estrategico sintetico",
      target: "Resultado verificavel ate Dez 2027",
      current: "Baseline sintetico confirmado",
      deadline: "2027-12-31",
      owner: "PERSON_FIXTURE_OWNER",
      evidence_plan: "Relatorio mensal sintetico",
      status: "on_track",
      progress: 20,
      period: "2027",
    }).select("id").single(), "criar objetivo estrategico sintetico");
    annualObjectiveId = String((strategic as any).id);
  }

  if (item.sessionType === "strategic_review") {
    const additional = await must(admin.from("objectives").insert([
      {
        org_id: handle.orgId, area_id: null, level: "strategic", type: "harvest", title: "Objetivo A",
        result: "Elevar confiabilidade", metric: "Indice A", target: "80%", current: "68%", deadline: "2027-12-31",
        owner: "PERSON_FIXTURE_OWNER", evidence_plan: "Fechamento validado", status: "on_track", progress: 60, period: "2027",
      },
      {
        org_id: handle.orgId, area_id: null, level: "strategic", type: "harvest", title: "Objetivo B",
        result: "Reduzir perda", metric: "Indice B", target: "15%", current: "18%", deadline: "2027-12-31",
        owner: "PERSON_FIXTURE_OWNER", evidence_plan: "Fechamento validado", status: "at_risk", progress: 45, period: "2027",
      },
      {
        org_id: handle.orgId, area_id: null, level: "strategic", type: "seed", title: "Objetivo C inalterado",
        result: "Fortalecer gestao", metric: "Indice C", target: "90%", current: "70%", deadline: "2027-11-30",
        owner: "PERSON_FIXTURE_OWNER", evidence_plan: "Auditoria", status: "on_track", progress: 50, period: "2027",
      },
    ]).select("id"), "criar objetivos da revisao");
    if (!annualObjectiveId) annualObjectiveId = String((additional as any[])[0]?.id ?? "") || null;
    return { annualObjectiveId, areaAnnualObjectiveId: null, quarterlyObjectiveId: null, monthlyObjectiveId: null };
  }

  if (annualObjectiveId) {
    const areaAnnual = await must(admin.from("objectives").insert({
      org_id: handle.orgId,
      area_id: handle.areaId,
      level: "area_annual",
      type: "harvest",
      title: upperObjectiveTitle(item),
      result: upperObjectiveTitle(item),
      metric: "Indicador anual da area",
      target: "Meta anual sintetica",
      owner: "PERSON_FIXTURE_MANAGER",
      status: "on_track",
      progress: 25,
      parent_id: annualObjectiveId,
      period: "2027",
    }).select("id").single(), "criar objetivo anual da area");
    areaAnnualObjectiveId = String((areaAnnual as any).id);
    await must(admin.from("area_plans").insert({
      org_id: handle.orgId,
      area_id: handle.areaId,
      year: 2027,
      role: { mission: `Executar prioridades de ${areaName}`, contribution: [upperObjectiveTitle(item)] },
      linked_strategic_objective_ids: [annualObjectiveId],
      diagnosis: { strengths: ["Equipe disponivel"], weaknesses: ["Previsibilidade baixa"] },
      main_annual_objective_id: areaAnnualObjectiveId,
      learning_focus: {},
    }).select("id").single(), "criar plano anual da area");
  }

  if (["monthly", "month_close", "quarter_close"].includes(String(item.sessionType))) {
    const quarterly = await must(admin.from("objectives").insert({
      org_id: handle.orgId,
      area_id: handle.areaId,
      level: "quarterly",
      type: "harvest",
      title: item.sessionType === "quarter_close" ? "Elevar adocao do processo comercial" : "Elevar qualidade do funil comercial",
      result: "Melhorar previsibilidade do trimestre",
      metric: item.sessionType === "quarter_close" ? "Adocao do processo" : "Oportunidades com proxima acao",
      target: item.sessionType === "quarter_close" ? "80%" : "85%",
      current: item.sessionType === "quarter_close" ? "78%" : "40%",
      deadline: item.sessionType === "quarter_close" ? "2027-06-30" : "2027-09-30",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatorio semanal",
      status: "at_risk",
      progress: 60,
      parent_id: areaAnnualObjectiveId,
      period: item.sessionType === "quarter_close" ? "T2 2027" : "T3 2027",
    }).select("id").single(), "criar objetivo trimestral sintetico");
    quarterlyObjectiveId = String((quarterly as any).id);
  }

  if (item.sessionType === "month_close" && quarterlyObjectiveId) {
    const monthly = await must(admin.from("objectives").insert({
      org_id: handle.orgId,
      area_id: handle.areaId,
      level: "monthly",
      type: "harvest",
      title: "Elevar oportunidades com proxima acao no mes",
      result: "Melhorar a qualidade do funil no mes",
      metric: "Oportunidades com proxima acao",
      target: "60%",
      current: "50%",
      deadline: "2027-06-30",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatorio semanal",
      status: "at_risk",
      progress: 50,
      parent_id: quarterlyObjectiveId,
      period: "Jun 2027",
    }).select("id").single(), "criar objetivo mensal sintetico");
    monthlyObjectiveId = String((monthly as any).id);
    await must(admin.from("key_actions").insert([
      { org_id: handle.orgId, objective_id: monthlyObjectiveId, description: "Publicar padrao", completion_criterion: "Padrao publicado", deadline: "2027-06-10", owner: "PERSON_FIXTURE_MANAGER", status: "done" },
      { org_id: handle.orgId, objective_id: monthlyObjectiveId, description: "Revisar carteira", completion_criterion: "Carteira revisada", deadline: "2027-06-20", owner: "PERSON_FIXTURE_MANAGER", status: "done" },
      { org_id: handle.orgId, objective_id: monthlyObjectiveId, description: "Concluir integracao externa", completion_criterion: "Integracao validada", deadline: "2027-06-30", owner: "PERSON_FIXTURE_MANAGER", status: "late" },
    ]).select("id"), "criar acoes mensais sinteticas");
  }

  if (item.sessionType === "quarter_close" && quarterlyObjectiveId) {
    await must(admin.from("key_actions").insert({
      org_id: handle.orgId,
      objective_id: quarterlyObjectiveId,
      description: "Concluir integracao externa",
      completion_criterion: "Integracao validada",
      deadline: "2027-06-30",
      owner: "PERSON_FIXTURE_MANAGER",
      status: "late",
    }).select("id"), "criar acao trimestral sintetica");
  }

  return { annualObjectiveId, areaAnnualObjectiveId, quarterlyObjectiveId, monthlyObjectiveId };
}

async function businessSnapshotHash(handle: EvaluationOrg) {
  const admin = serviceClient();
  const tables = [
    "strategic_plans",
    "area_plans",
    "objectives",
    "key_actions",
    "strategic_projects",
    "evidences",
    "check_ins",
    "plan_documents",
    "objective_kpi_links",
  ];
  const snapshot: Record<string, unknown[]> = {};
  for (const table of tables) {
    const result = await admin.from(table).select("*").eq("org_id", handle.orgId);
    if (result.error) throw result.error;
    snapshot[table] = [...(result.data ?? [])].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function canonicalDocumentCount(handle: EvaluationOrg, sessionId: string) {
  const result = await serviceClient().from("plan_documents").select("id", { count: "exact", head: true })
    .eq("org_id", handle.orgId).eq("session_id", sessionId);
  if (result.error) throw result.error;
  return Number(result.count ?? 0);
}

async function appendLedger(run: BaselineRunSummary, qualityStatus: "approved" | "blocked", ledgerLabel = COHORT_LABEL) {
  const ledger = await readLedger();
  const totalCostUsd = run.generationCostUsd + run.judgeCostUsd;
  const next: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + totalCostUsd,
    runs: [...ledger.runs, {
      runId: run.reportPath.split("-").slice(-2).join("-").replace(/\.json$/, ""),
      caseId: `${ledgerLabel}:${run.caseId}-R${run.round}`,
      totalCostUsd,
      completedAt: new Date().toISOString(),
      status: qualityStatus,
    }],
  };
  await writePrivateJson(LEDGER_PATH, next);
  return { before: ledger.cumulativePlanCostUsd, after: next.cumulativePlanCostUsd };
}

export async function executeCase(
  item: ReferenceCase,
  phase: ReferencePhase,
  round: number,
  rubric: Record<string, any>,
  options: ExecuteCaseOptions = {},
): Promise<BaselineRunSummary> {
  assertEvaluationEnvironment(process.env);
  const config = runtimeConfiguration();
  const ledgerAtStart = await readLedger();
  const policy = rubric.costPolicy;
  assertBudgetAllowsNextCall({ cumulativePlanCostUsd: ledgerAtStart.cumulativePlanCostUsd, currentCaseCostUsd: 0, reserveUsd: PLANNING_RESERVE_USD, policy });

  const id = runId();
  const runLabel = String(options.runLabel ?? EVALUATION_COHORT).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!runLabel) throw new Error("rotulo da execucao estrategica invalido");
  const reportPath = resolve(PRIVATE_DIR, `strategic-${runLabel}-${phase.toLowerCase()}-${item.caseId.toLowerCase()}-r${round}-${id}.json`);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let handle: EvaluationOrg | null = null;
  let sessionId = "";
  let transcript: TranscriptMessage[] = [];
  let proposal: Record<string, any> | null = null;
  let proposalSequence = Number.MAX_SAFE_INTEGER;
  let generation = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  let judge: { status: "completed" | "error"; result?: any; error?: string; usage?: any } = { status: "error", error: "judge nao executado" };
  let judgeCostUsd = 0;
  let sessionScopeMatches = false;
  let preConfirmSnapshotUnchanged = false;
  let businessSnapshotObserved = false;
  let judgeSnapshotUnchanged = false;
  let judgeSnapshotObserved = false;
  let confirmationCallCount = 0;
  let databaseChangedAfterConfirmation = false;
  let canonicalDocumentCreated = false;
  let cleanupSucceeded = false;
  let executionError: string | null = null;
  const shouldCreateProposal = proposalShouldExist(item);

  try {
    // Preserve the synthetic organization identity used by Q3 so the model input remains comparable.
    handle = await createEvaluationOrg(`q3-${phase.toLowerCase()}-r${round}`);
    await configureDisposableAi(handle, config);
    await seedCaseContext(handle, item);
    const seedHash = await businessSnapshotHash(handle);
    const token = await ownerToken(handle);
    const period = expectedPeriod(item);
    const start = await callFunction("oracle-session", token, {
      action: "start",
      orgId: handle.orgId,
      areaId: item.sessionType === "strategic" || item.sessionType === "strategic_review" ? null : handle.areaId,
      type: item.sessionType,
      period,
      channel: "web",
    }, `strategic-${runLabel}-${id}-start`);
    sessionId = String(start.session?.id ?? "");
    if (!sessionId) throw new Error("oracle-session nao devolveu sessionId");
    sessionScopeMatches = start.session?.org_id === handle.orgId
      && String(start.session?.area_id ?? "") === (item.sessionType === "strategic" || item.sessionType === "strategic_review" ? "" : handle.areaId)
      && start.session?.period === period
      && start.session?.type === item.sessionType;
    transcript.push({ sequence: 1, role: "oracle", content: String(start.reply ?? "") });

    for (const turn of buildManagerTurns(item)) {
      generation = await generationUsage(handle, startedAt);
      assertBudgetAllowsNextCall({
        cumulativePlanCostUsd: ledgerAtStart.cumulativePlanCostUsd,
        currentCaseCostUsd: generation.totalCostUsd,
        reserveUsd: PLANNING_RESERVE_USD,
        policy,
      });
      transcript.push({ sequence: transcript.length + 1, role: "manager", content: turn });
      const response = await callFunction("oracle-session", token, {
        action: "message",
        sessionId,
        message: turn,
        channel: "web",
      }, `strategic-${runLabel}-${id}-message-${transcript.length}`);
      transcript.push({ sequence: transcript.length + 1, role: "oracle", content: String(response.reply ?? "") });
      if (response.pendingProposal && typeof response.pendingProposal === "object") {
        proposal = response.pendingProposal as Record<string, any>;
        proposalSequence = transcript.length;
        break;
      }
    }

    preConfirmSnapshotUnchanged = seedHash === await businessSnapshotHash(handle);
    businessSnapshotObserved = true;
    const beforeJudgeHash = await domainSnapshotHash(handle);
    generation = await generationUsage(handle, startedAt);
    assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: ledgerAtStart.cumulativePlanCostUsd,
      currentCaseCostUsd: generation.totalCostUsd,
      reserveUsd: JUDGE_RESERVE_USD,
      policy,
    });
    try {
      const judged = await runJudge({
        apiKey: config.apiKey,
        provider: config.provider,
        model: config.judgeModel,
        evaluationCase: item,
        transcript,
        proposal: proposal ?? { status: "not-generated", reason: shouldCreateProposal ? "missing" : "blocking-gap-preserved" },
        rubric: selectRubricForCase(rubric, item),
      });
      judge = { status: "completed", result: judged.result, usage: judged.usage };
      judgeCostUsd = usageCostUsd(judged.usage, config.judgePricing);
    } catch (error) {
      judge = { status: "error", error: errorMessage(error) };
    }
    judgeSnapshotUnchanged = beforeJudgeHash === await domainSnapshotHash(handle);
    judgeSnapshotObserved = true;

    if (proposal && shouldCreateProposal) {
      const beforeConfirmHash = await businessSnapshotHash(handle);
      confirmationCallCount += 1;
      await callFunction("oracle-session", token, { action: "confirm", sessionId, channel: "web" }, `strategic-${runLabel}-${id}-confirm`);
      databaseChangedAfterConfirmation = beforeConfirmHash !== await businessSnapshotHash(handle);
      canonicalDocumentCreated = await canonicalDocumentCount(handle, sessionId) === 1;
    }
    generation = await generationUsage(handle, startedAt);
  } catch (error) {
    executionError = errorMessage(error);
    if (handle) generation = await generationUsage(handle, startedAt).catch(() => generation);
  } finally {
    if (handle) {
      try {
        await destroyEvaluationOrg(handle);
        cleanupSucceeded = true;
      } catch (error) {
        executionError = executionError ?? errorMessage(error);
      }
    }
  }

  const checks = buildBaselineChecks({
    sessionScopeMatches,
    proposalExpected: shouldCreateProposal,
    proposalCreated: Boolean(proposal),
    proposalTypeMatches: Boolean(proposal && proposal.type === expectedProposalType(item)),
    confirmationExpected: Boolean(proposal && shouldCreateProposal),
    executionCompleted: !executionError,
    businessSnapshotObserved,
    preConfirmSnapshotUnchanged,
    confirmationPromptCount: proposal ? countConfirmationPrompts(transcript, proposalSequence) : 0,
    confirmationCallCount,
    databaseChangedAfterConfirmation,
    canonicalDocumentCreated,
    judgeSnapshotUnchanged,
    judgeSnapshotObserved,
    cleanupSucceeded,
  });
  const applicableRubric = selectRubricForCase(rubric, item);
  const technicalStatus = !executionError && checks.every((check) => check.status !== "fail") && judge.status === "completed" ? "approved" : "blocked";
  const qualityGate = buildStrategicQualityGate({
    technicalGateStatus: technicalStatus,
    judgeStatus: judge.status,
    judgeResult: judge.result,
    applicableRubric,
    minimumPerRubric: Number(rubric.thresholds?.minimumPerRubric ?? 80),
    minimumJointAverage: Number(rubric.thresholds?.minimumJointAverage ?? 85),
  });
  const criticalFailureCandidates = qualityGate.criticalFailureCandidates;
  const summary: BaselineRunSummary = {
    phase,
    caseId: item.caseId,
    round,
    status: executionError ? "execution-error" : "measured",
    rubricScores: qualityGate.rubricScores.map((entry) => ({ rubricId: entry.rubricId, score: entry.score })),
    criticalFailureCandidates,
    failedChecks: checks.filter((check) => check.status === "fail").map((check) => check.id),
    generationCostUsd: generation.totalCostUsd,
    judgeCostUsd,
    latencyMs: Date.now() - startedMs,
    defectClasses: classifyDefects({ item, checks, criticalFailureCandidates, executionError }),
    reportPath,
  };
  const report = {
    schemaVersion: 1,
    reportVersion: options.reportVersion ?? COHORT_VERSION,
    catalogVersion: "2026-07-16.q2",
    phase,
    caseId: item.caseId,
    round,
    startedAt,
    completedAt: new Date().toISOString(),
    environment: "staging",
    generator: { provider: config.provider, model: config.planningModel },
    judgeRuntime: { provider: config.provider, model: config.judgeModel, access: "provider-only-no-database" },
    expectedProposal: shouldCreateProposal,
    evaluationParameters: {
      syntheticManagerTurns: buildManagerTurns(item).length,
      stopAtFirstProposal: true,
      planningReserveUsd: PLANNING_RESERVE_USD,
      judgeReserveUsd: JUDGE_RESERVE_USD,
    },
    transcript,
    proposal,
    deterministicChecks: checks,
    judge,
    technicalStatus,
    qualityGate,
    executionError,
    cost: {
      generationCostUsd: generation.totalCostUsd,
      judgeCostUsd,
      totalCostUsd: generation.totalCostUsd + judgeCostUsd,
      cumulativeBeforeUsd: ledgerAtStart.cumulativePlanCostUsd,
      generationUsage: generation,
      judgeUsage: judge.usage ?? null,
    },
    cleanup: { disposableOrganizationRemoved: cleanupSucceeded, providerKeyRemovedWithOrganization: cleanupSucceeded },
    defectClasses: summary.defectClasses,
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue(report));
  const ledgerMove = await appendLedger(summary, qualityGate.status, options.ledgerLabel ?? COHORT_LABEL);
  console.log(`${item.caseId} R${round}: ${summary.status}; qualidade ${qualityGate.status}; US$ ${(generation.totalCostUsd + judgeCostUsd).toFixed(6)}; acumulado US$ ${ledgerMove.before.toFixed(6)} -> US$ ${ledgerMove.after.toFixed(6)}`);
  if (!cleanupSucceeded) throw new Error(`${item.caseId}: cleanup descartavel falhou; ${COHORT_LABEL} interrompida`);
  return summary;
}

async function runPhase(requestedPhase: string) {
  assertEvaluationEnvironment(process.env);
  const normalizedPhase = requestedPhase.toUpperCase();
  if (!normalizedPhase.startsWith(COHORT_LABEL) || normalizedPhase.length !== 3) {
    throw new Error(`Use ${COHORT_LABEL}A, ${COHORT_LABEL}B, ${COHORT_LABEL}C ou ${COHORT_LABEL}D para casos generativos`);
  }
  const phase = PHASE_SUFFIX_TO_REFERENCE[normalizedPhase.slice(-1)];
  if (!phase || phase === "Q2E") throw new Error(`Use ${COHORT_LABEL}A, ${COHORT_LABEL}B, ${COHORT_LABEL}C ou ${COHORT_LABEL}D para casos generativos`);
  const { blocks, rubric } = await loadCatalog();
  const block = blocks.find((entry) => entry.phase === phase);
  if (!block) throw new Error(`bloco ${phase} ausente`);
  const cases = block.cases.filter(isGenerativeCase);
  const initialLedger = await readLedger();
  const progress = await readProgress(initialLedger.cumulativePlanCostUsd);

  for (const item of cases) {
    for (const round of [1, 2]) {
      if (progress.runs.some((run) => run.caseId === item.caseId && run.round === round)) {
        console.log(`${item.caseId} R${round}: ja registrada, ignorada para evitar custo duplicado`);
        continue;
      }
      const summary = await executeCase(item, phase, round, rubric);
      progress.runs.push(summary);
      await writePrivateJson(PROGRESS_PATH, progress);
      if (summary.status === "execution-error") {
        throw new Error(`${item.caseId} R${round}: erro tecnico registrado; fase interrompida antes da proxima chamada`);
      }
    }
  }
  const phaseRuns = progress.runs.filter((run) => run.phase === phase);
  const generationCostUsd = phaseRuns.reduce((sum, run) => sum + run.generationCostUsd, 0);
  const judgeCostUsd = phaseRuns.reduce((sum, run) => sum + run.judgeCostUsd, 0);
  const finalLedger = await readLedger();
  console.log(`${normalizedPhase} concluida: ${cases.length * 2} medicoes previstas; ${phaseRuns.length} registradas.`);
  console.log(`Custo ${normalizedPhase}: geracao US$ ${generationCostUsd.toFixed(6)}; judge US$ ${judgeCostUsd.toFixed(6)}; total US$ ${(generationCostUsd + judgeCostUsd).toFixed(6)}; acumulado US$ ${finalLedger.cumulativePlanCostUsd.toFixed(6)}.`);
}

async function writeSummary() {
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  const aggregate = aggregateBaseline(progress.runs);
  const lowestRuns = [...progress.runs]
    .sort((left, right) => {
      const leftAverage = left.rubricScores.length ? left.rubricScores.reduce((sum, item) => sum + item.score, 0) / left.rubricScores.length : -1;
      const rightAverage = right.rubricScores.length ? right.rubricScores.reduce((sum, item) => sum + item.score, 0) / right.rubricScores.length : -1;
      return leftAverage - rightAverage;
    })
    .slice(0, 8)
    .map((run) => ({ caseId: run.caseId, round: run.round, reportPath: run.reportPath }));
  const representative = ["Q2A", "Q2B", "Q2C", "Q2D"].flatMap((phase) =>
    progress.runs.filter((run) => run.phase === phase).slice(0, 1).map((run) => ({ caseId: run.caseId, round: run.round, reportPath: run.reportPath }))
  );
  const summary = {
    schemaVersion: 1,
    baselineVersion: progress.baselineVersion,
    startedAt: progress.startedAt,
    generatedAt: new Date().toISOString(),
    initialCumulativeCostUsd: progress.initialCumulativeCostUsd,
    finalCumulativeCostUsd: ledger.cumulativePlanCostUsd,
    cohort: EVALUATION_COHORT,
    incrementalCostUsd: ledger.cumulativePlanCostUsd - progress.initialCumulativeCostUsd,
    aggregate,
    deterministic: progress.deterministic,
    calibration: {
      runCount: progress.calibrationRuns?.length ?? 0,
      costUsd: (progress.calibrationRuns ?? []).reduce((sum, run) => sum + run.generationCostUsd + run.judgeCostUsd, 0),
      reason: progress.calibrationRuns?.[0]?.calibrationReason ?? null,
    },
    humanReview: {
      status: "pending-owner",
      representativeSample: [...representative, ...lowestRuns].filter((item, index, list) =>
        list.findIndex((candidate) => candidate.caseId === item.caseId && candidate.round === item.round) === index
      ),
    },
    gate: {
      status: EVALUATION_COHORT === "q5" ? "pending-comparison-and-owner-review" : "pending-owner-review",
      reasons: [EVALUATION_COHORT === "q5"
        ? "comparacao automatica e revisao humana cega ainda nao foram registradas"
        : "revisao humana cega da amostra representativa ainda nao foi registrada"],
    },
  };
  await writePrivateJson(SUMMARY_PATH, sanitizeEvaluationValue(summary));
  console.log(`Resumo ${COHORT_LABEL}: ${SUMMARY_PATH}`);
  console.log(`Medicoes generativas: ${aggregate.runCount}; custo incremental registrado: US$ ${(ledger.cumulativePlanCostUsd - progress.initialCumulativeCostUsd).toFixed(6)}`);
}

async function archiveCalibration() {
  if (EVALUATION_COHORT !== "q3") throw new Error("archive-calibration e exclusivo da baseline Q3");
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  if (!progress.runs.length) throw new Error("nenhuma medicao oficial para arquivar como calibracao");
  const archivedAt = new Date().toISOString();
  const calibrationReason = "casos de referencia descreviam campos completos sem fornecer os valores concretos ao gestor sintetico";
  progress.calibrationRuns = [
    ...(progress.calibrationRuns ?? []),
    ...progress.runs.map((run) => ({ ...run, calibrationReason, archivedAt })),
  ];
  progress.runs = [];
  progress.baselineVersion = "2026-07-16.q3-baseline-r2";
  await writePrivateJson(PROGRESS_PATH, progress);
  console.log(`${progress.calibrationRuns.length} medicao(oes) preservada(s) como calibracao; baseline oficial reiniciada sem alterar o livro de custos.`);
}

async function archiveExecutionErrors() {
  if (EVALUATION_COHORT !== "q3") throw new Error("erros da Q5 exigem diagnostico e parada; nao podem ser arquivados automaticamente");
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  const failed = progress.runs.filter((run) => run.status === "execution-error");
  if (!failed.length) throw new Error("nenhum erro tecnico oficial para arquivar");
  const archivedAt = new Date().toISOString();
  const calibrationReason = "rodada descartada por erro tecnico de transporte ou processamento; custo preservado no livro";
  progress.calibrationRuns = [
    ...(progress.calibrationRuns ?? []),
    ...failed.map((run) => ({ ...run, calibrationReason, archivedAt })),
  ];
  progress.runs = progress.runs.filter((run) => run.status !== "execution-error");
  await writePrivateJson(PROGRESS_PATH, progress);
  console.log(`${failed.length} erro(s) tecnico(s) arquivado(s); as combinacoes podem ser repetidas sem apagar o custo.`);
}

async function cleanupStaleFixtures() {
  assertEvaluationEnvironment(process.env);
  const admin = serviceClient();
  const stale = await admin.from("organizations")
    .select("id,name,subtitle")
    .like("name", "EVAL Oraculo %")
    .eq("subtitle", "avaliacao sintetica descartavel");
  if (stale.error) throw stale.error;
  for (const org of stale.data ?? []) {
    const memberships = await admin.from("memberships").select("user_id").eq("org_id", org.id);
    if (memberships.error) throw memberships.error;
    await purgeEvaluationOrg(String(org.id));
    for (const membership of memberships.data ?? []) {
      const deleted = await admin.auth.admin.deleteUser(String(membership.user_id));
      if (deleted.error) throw deleted.error;
    }
  }
  console.log(`${stale.data?.length ?? 0} fixture(s) de avaliacao removida(s) do staging; nenhuma outra organizacao foi consultada para exclusao.`);
}

async function runCommand(label: string, args: string[]) {
  const startedAt = Date.now();
  return await new Promise<{ label: string; passed: boolean; durationMs: number; output: string }>((resolveCommand) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-6_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => child.kill("SIGTERM"), 240_000);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveCommand({
        label,
        passed: code === 0,
        durationMs: Date.now() - startedAt,
        output: sanitizeEvaluationText(output.trim()),
      });
    });
  });
}

async function runDeterministicBaseline() {
  assertEvaluationEnvironment(process.env);
  await loadCatalog();
  const vitest = resolve("node_modules/vitest/vitest.mjs");
  const commands = [
    await runCommand("historical-import", ["--experimental-strip-types", "scripts/verify-historical-import.ts"]),
    await runCommand("kpi-format", ["--experimental-strip-types", "scripts/verify-kpi-format.ts"]),
    await runCommand("conversation-memory", ["--experimental-strip-types", "scripts/verify-conversation-memory.ts"]),
    await runCommand("unit-contracts", [vitest, "run",
      "src/test/strategic-annual-quality-fix.test.ts",
      "src/test/strategic-reference-cases.test.ts",
      "src/test/administrative-audit.test.ts",
    ]),
    await runCommand("staging-integration", [vitest, "--config", "vitest.integration.config.ts", "run",
      "tests/integration/quick-update-guard.test.ts",
      "tests/integration/kpi-import-atomicity.test.ts",
      "tests/integration/administrative-audit.test.ts",
      "tests/integration/proposal-atomicity.test.ts",
      "--passWithNoTests=false",
    ]),
  ];
  const byLabel = new Map(commands.map((command) => [command.label, command]));
  const sourceFiles = await Promise.all([
    readFile("supabase/functions/weekly-pulse/index.ts", "utf8"),
    readFile("supabase/functions/_shared/plan-documents.ts", "utf8"),
    readFile("supabase/functions/_shared/plan-render.ts", "utf8"),
    readFile("tests/e2e/error-boundary.spec.ts", "utf8"),
  ]);
  const [pulseSource, documentSource, renderSource, uxSource] = sourceFiles;
  const pulseContracts = [
    '.eq("weekly_pulse_enabled", true)',
    "if (activeSession) continue",
    "if (already) continue",
    'from("weekly_pulse_log").insert',
    "Teve algum avanço, sucesso ou dificuldade",
  ].every((fragment) => pulseSource.includes(fragment));
  const canonicalContracts = [
    'proposalType === "save_strategic_plan"',
    'proposalType === "save_quarterly_plan"',
    'proposalType === "save_monthly_plan"',
  ].every((fragment) => documentSource.includes(fragment))
    && renderSource.includes("renderPlanForWhatsApp");
  const uxContracts = uxSource.includes("document.documentElement.scrollWidth")
    && uxSource.includes("AxeBuilder")
    && uxSource.includes("Tentar novamente");
  const passed = (label: string) => Boolean(byLabel.get(label)?.passed);
  const commandEvidence = (label: string) => {
    const command = byLabel.get(label);
    return `${label}: ${command?.passed ? "pass" : "fail"} (${command?.durationMs ?? 0} ms)`;
  };
  const deterministic: StrategicProgress["deterministic"] = [
    {
      caseId: "Q2D-QUICK-UPDATE-AMBIGUOUS-004",
      status: passed("staging-integration") ? "pass" : "fail",
      evidence: [commandEvidence("staging-integration"), "Piloto ok nao grava; alvo inferido exige confirmacao revalidada."],
    },
    {
      caseId: "Q2D-WEEKLY-PULSE-NATURAL-005",
      status: pulseContracts && passed("staging-integration") ? "pass" : "fail",
      evidence: ["Flag, plano ativo, sessao ativa e weekly_pulse_log guardam elegibilidade e deduplicacao.", commandEvidence("staging-integration")],
    },
    {
      caseId: "Q2E-HISTORY-IMPORT-METADATA-001",
      status: passed("historical-import") ? "pass" : "fail",
      evidence: [commandEvidence("historical-import"), "Cabecalho prevalece sobre nome generico; conflitos obrigatorios permanecem visiveis."],
    },
    {
      caseId: "Q2E-KPI-IMPORT-CONFLICT-002",
      status: passed("historical-import") && passed("staging-integration") ? "pass" : "fail",
      evidence: [commandEvidence("historical-import"), commandEvidence("staging-integration")],
    },
    {
      caseId: "Q2E-MEMORY-RELEVANCE-003",
      status: passed("conversation-memory") ? "pass" : "fail",
      evidence: [commandEvidence("conversation-memory"), "Limite de cinco historicos, filtro por area e fronteira de conteudo nao confiavel verificados."],
    },
    {
      caseId: "Q2E-CANONICAL-OUTPUT-EQUALITY-004",
      status: canonicalContracts && passed("unit-contracts") && passed("staging-integration") ? "pass" : "fail",
      evidence: [commandEvidence("unit-contracts"), commandEvidence("staging-integration"), "Documento e WhatsApp derivam deterministicamente da proposta, sem nova IA."],
    },
    {
      caseId: "Q2E-DASHBOARD-NUMERICAL-005",
      status: passed("kpi-format") && passed("unit-contracts") ? "pass" : "fail",
      evidence: [commandEvidence("kpi-format"), "Card e tooltip validam precisao compacta; caso de referencia valida Jun como mes fechado."],
    },
    {
      caseId: "Q2E-ARCHIVE-AUDIT-TRACEABILITY-006",
      status: passed("unit-contracts") && passed("staging-integration") ? "pass" : "fail",
      evidence: [commandEvidence("unit-contracts"), commandEvidence("staging-integration"), "Auditoria sanitizada e RLS owner-only exercitadas em staging."],
    },
    {
      caseId: "Q2E-UX-CROSS-CUTTING-007",
      status: uxContracts ? "pending-human" : "fail",
      evidence: ["Contrato E2E cobre overflow, foco, recuperacao e axe; capturas desktop/mobile ainda dependem de revisao humana."],
    },
  ];
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  progress.deterministic = deterministic;
  await writePrivateJson(PROGRESS_PATH, progress);
  await writePrivateJson(DETERMINISTIC_PATH, sanitizeEvaluationValue({
    schemaVersion: 1,
    cohort: EVALUATION_COHORT,
    generatedAt: new Date().toISOString(),
    commands,
    sourceContracts: { pulseContracts, canonicalContracts, uxContracts },
    cases: deterministic,
  }));
  for (const item of deterministic) console.log(`${item.caseId}: ${item.status}`);
  if (commands.some((command) => !command.passed) || deterministic.some((item) => item.status === "fail")) {
    throw new Error("baseline deterministica encontrou falha; consulte o artefato privado de evidencia");
  }
}

async function writeHumanReviewPacket() {
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  const targets = [
    ["Q2A-ANNUAL-EXPERIENCED-OWNER-005", 2, "planejamento anual"],
    ["Q2B-QUARTERLY-EXPERIENCED-MANAGER-008", 2, "planejamento trimestral"],
    ["Q2C-MONTHLY-EXPERIENCED-MANAGER-004", 2, "planejamento mensal"],
    ["Q2D-MONTH-CLOSE-PARTIAL-001", 1, "fechamento mensal"],
    ["Q2D-STRATEGIC-REVIEW-BOUNDARY-003", 1, "revisao estrategica"],
  ] as const;
  const sections: string[] = [
    EVALUATION_COHORT === "q5" ? "# Revisao humana cega A/B - regressao Q5" : "# Revisao humana cega - baseline Q3",
    "",
    "Este pacote contem somente casos sinteticos. Versoes, notas do judge, falhas detectadas e status foram omitidos para nao influenciar a avaliacao.",
    "",
    "Para cada amostra, avalie de 0 a 4: naturalidade da conducao, fidelidade aos fatos, objetividade, qualidade da entrega e confianca para uso por um gestor.",
    "Registre tambem qualquer invencao, troca de area/periodo/nivel, repeticao desnecessaria ou confirmacao duplicada.",
  ];
  const renderVersion = (label: string, report: Record<string, any>) => [
    "",
    `### Versao ${label}`,
    "",
    "#### Conversa",
    "",
    ...(Array.isArray(report.transcript) ? report.transcript.map((message: any) =>
      `**${message.role === "oracle" ? "Oraculo" : "Gestor"}:** ${String(message.content ?? "").replace(/\n/g, "  \n")}`
    ) : ["Transcricao indisponivel."]),
    "",
    "#### Proposta final",
    "",
    "```json",
    JSON.stringify(sanitizeEvaluationValue(report.proposal), null, 2),
    "```",
  ];
  const reviewFields = (label: string) => [
    "",
    `### Avaliacao da versao ${label}`,
    "",
    "- Naturalidade (0-4):",
    "- Fidelidade (0-4):",
    "- Objetividade (0-4):",
    "- Qualidade da entrega (0-4):",
    "- Confianca para uso (0-4):",
    "- Falha critica observada:",
    "- Comentario:",
  ];

  if (EVALUATION_COHORT === "q5") {
    const baseline = await readRequiredProgress(Q3_PROGRESS_PATH, "baseline Q3");
    const key: Array<{ sample: number; caseId: string; round: number; versionA: "q3" | "q5"; versionB: "q3" | "q5" }> = [];
    for (const [index, [caseId, round, scenario]] of targets.entries()) {
      const q3Run = baseline.runs.find((item) => item.caseId === caseId && item.round === round);
      const q5Run = progress.runs.find((item) => item.caseId === caseId && item.round === round);
      if (!q3Run || !q5Run) throw new Error(`par humano ausente: ${caseId} R${round}`);
      const q3Report = await readJson(q3Run.reportPath) as Record<string, any>;
      const q5Report = await readJson(q5Run.reportPath) as Record<string, any>;
      const q5First = index % 2 === 1;
      const reportA = q5First ? q5Report : q3Report;
      const reportB = q5First ? q3Report : q5Report;
      key.push({ sample: index + 1, caseId, round, versionA: q5First ? "q5" : "q3", versionB: q5First ? "q3" : "q5" });
      sections.push(
        "",
        `## Amostra ${index + 1} - ${scenario}`,
        ...renderVersion("A", reportA),
        ...reviewFields("A"),
        ...renderVersion("B", reportB),
        ...reviewFields("B"),
        "",
        "### Preferencia",
        "",
        "- Melhor versao (A/B/empate):",
        "- Motivo principal:",
      );
    }
    await writePrivateJson(Q5_HUMAN_KEY_PATH, sanitizeEvaluationValue({ schemaVersion: 1, generatedAt: new Date().toISOString(), key }));
  } else {
    for (const [caseId, round, scenario] of targets) {
      const run = progress.runs.find((item) => item.caseId === caseId && item.round === round);
      if (!run) throw new Error(`amostra humana ausente: ${caseId} R${round}`);
      const report = await readJson(run.reportPath) as Record<string, any>;
      sections.push("", `## Amostra - ${scenario}`, ...renderVersion("unica", report), ...reviewFields("unica"));
    }
  }
  const path = HUMAN_REVIEW_PATH;
  await mkdir(PRIVATE_DIR, { recursive: true });
  await writeFile(path, `${sections.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
  console.log(`Pacote privado de revisao humana: ${path}`);
}

async function readRunEvidence(progress: StrategicProgress, casesById: Map<string, ReferenceCase>) {
  const managerTurns: Record<string, number> = {};
  const inputMismatches: string[] = [];
  const cleanupFailures: string[] = [];
  const runtimeByRun: Record<string, string> = {};
  const catalogVersions = new Set<string>();
  for (const run of progress.runs) {
    const key = baselineRunKey(run);
    const item = casesById.get(run.caseId);
    if (!item) {
      inputMismatches.push(`${key}:caso-ausente`);
      continue;
    }
    const report = await readJson(run.reportPath) as Record<string, any>;
    const transcript = Array.isArray(report.transcript) ? report.transcript : [];
    const actualManagerTurns = transcript
      .filter((message: any) => message.role === "manager")
      .map((message: any) => String(message.content ?? ""));
    const expectedManagerTurns = buildManagerTurns(item);
    managerTurns[key] = actualManagerTurns.length;
    if (actualManagerTurns.length > expectedManagerTurns.length
      || actualManagerTurns.some((turn: string, index: number) => turn !== expectedManagerTurns[index])) {
      inputMismatches.push(key);
    }
    if (!report.cleanup?.disposableOrganizationRemoved || !report.cleanup?.providerKeyRemovedWithOrganization) {
      cleanupFailures.push(key);
    }
    runtimeByRun[key] = JSON.stringify({
      generator: report.generator ?? null,
      judge: report.judgeRuntime ? {
        provider: report.judgeRuntime.provider,
        model: report.judgeRuntime.model,
        access: report.judgeRuntime.access,
      } : null,
    });
    catalogVersions.add(String(report.catalogVersion ?? "missing"));
  }
  return { managerTurns, inputMismatches, cleanupFailures, runtimeByRun, catalogVersions: [...catalogVersions].sort() };
}

async function compareQ5Regression() {
  if (EVALUATION_COHORT !== "q5") throw new Error("compare e exclusivo da regressao Q5");
  assertEvaluationEnvironment(process.env);
  const { manifest, blocks, rubric } = await loadCatalog();
  const ledger = await readLedger();
  const baseline = await readRequiredProgress(Q3_PROGRESS_PATH, "baseline Q3");
  const current = await readRequiredProgress(PROGRESS_PATH, "regressao Q5");
  const allCases = blocks.flatMap((block) => block.cases);
  const generativeCases = allCases.filter(isGenerativeCase);
  const deterministicCases = allCases.filter((item) => !isGenerativeCase(item));
  const casesById = new Map(allCases.map((item) => [item.caseId, item]));
  const expectedRunKeys = generativeCases.flatMap((item) => [1, 2].map((round) => `${item.caseId}:R${round}`));
  const baselineEvidence = await readRunEvidence(baseline, casesById);
  const currentEvidence = await readRunEvidence(current, casesById);
  const runtimeMismatches = expectedRunKeys.filter((key) =>
    !baselineEvidence.runtimeByRun[key]
      || !currentEvidence.runtimeByRun[key]
      || baselineEvidence.runtimeByRun[key] !== currentEvidence.runtimeByRun[key]
  );
  if (baselineEvidence.catalogVersions.length !== 1 || baselineEvidence.catalogVersions[0] !== manifest.catalogVersion) {
    runtimeMismatches.push("Q3:catalog-version");
  }
  if (currentEvidence.catalogVersions.length !== 1 || currentEvidence.catalogVersions[0] !== manifest.catalogVersion) {
    runtimeMismatches.push("Q5:catalog-version");
  }

  const currentRunKeys = new Set(current.runs.filter((run) => run.status === "measured").map(baselineRunKey));
  const deterministicById = new Map(current.deterministic.map((item) => [item.caseId, item.status]));
  const coveredDeliveryIds = [...new Set(allCases.flatMap((item) => {
    if (isGenerativeCase(item)) {
      return [1, 2].every((round) => currentRunKeys.has(`${item.caseId}:R${round}`)) ? [item.deliveryId] : [];
    }
    const status = deterministicById.get(item.caseId);
    return status && status !== "fail" ? [item.deliveryId] : [];
  }))].sort();
  const expectedDeliveryIds = [...new Set(allCases.map((item) => item.deliveryId))].sort();
  const comparison = compareStrategicRegression({
    baselineRuns: baseline.runs,
    currentRuns: current.runs,
    baselineManagerTurns: baselineEvidence.managerTurns,
    currentManagerTurns: currentEvidence.managerTurns,
    expectedRunKeys,
    deterministic: current.deterministic,
    expectedDeterministicCaseIds: deterministicCases.map((item) => item.caseId),
    coveredDeliveryIds,
    expectedDeliveryIds,
    cleanupFailures: currentEvidence.cleanupFailures,
    inputMismatches: [...baselineEvidence.inputMismatches.map((item) => `Q3:${item}`), ...currentEvidence.inputMismatches.map((item) => `Q5:${item}`)],
    runtimeMismatches,
    cumulativeCostUsd: ledger.cumulativePlanCostUsd,
    authorizedLimitUsd: Number(rubric.costPolicy.authorizedLimitUsd),
    minimumPerRubric: Number(rubric.thresholds.minimumPerRubric),
    minimumJointAverage: Number(rubric.thresholds.minimumJointAverage),
    maximumRubricRegression: 5,
    maximumMedianTurnIncreaseRatio: 0.25,
  });
  const result = sanitizeEvaluationValue({
    schemaVersion: 1,
    comparisonVersion: "2026-07-17.q5",
    generatedAt: new Date().toISOString(),
    environment: "staging",
    catalogVersion: manifest.catalogVersion,
    modelsMatchQ3: runtimeMismatches.length === 0,
    exactSyntheticInputs: baselineEvidence.inputMismatches.length === 0 && currentEvidence.inputMismatches.length === 0,
    expectedRunCount: expectedRunKeys.length,
    expectedDeterministicCount: deterministicCases.length,
    expectedDeliveryCount: expectedDeliveryIds.length,
    coveredDeliveryIds,
    cumulativeCostUsd: ledger.cumulativePlanCostUsd,
    automaticGate: comparison,
    humanReview: { status: "pending-owner-blind-review", packetPath: HUMAN_REVIEW_PATH },
  });
  await writePrivateJson(Q5_COMPARISON_PATH, result);
  try {
    const summary = await readJson(SUMMARY_PATH) as Record<string, any>;
    summary.comparison = {
      status: comparison.status,
      reportPath: Q5_COMPARISON_PATH,
      reasons: comparison.reasons,
    };
    summary.gate = comparison.status === "approved-automatic"
      ? { status: "pending-owner-review", reasons: ["revisao humana cega A/B ainda nao foi registrada"] }
      : { status: "blocked", reasons: comparison.reasons };
    await writePrivateJson(SUMMARY_PATH, sanitizeEvaluationValue(summary));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  console.log(`Comparacao Q5: ${comparison.status}; media conjunta ${comparison.current.jointAverage ?? "n/a"}; turnos ${comparison.managerTurns.baselineMedian} -> ${comparison.managerTurns.currentMedian}.`);
  console.log(`Cobertura: ${coveredDeliveryIds.length}/${expectedDeliveryIds.length} entregas; custo acumulado US$ ${ledger.cumulativePlanCostUsd.toFixed(6)}.`);
  if (comparison.status === "blocked") throw new Error(`gate automatico Q5 bloqueado: ${comparison.reasons.join("; ")}`);
}

async function repairExecutionChecks() {
  const ledger = await readLedger();
  const progress = await readProgress(ledger.cumulativePlanCostUsd);
  let repaired = 0;
  for (const run of progress.runs.filter((item) => item.status === "execution-error")) {
    const report = await readJson(run.reportPath) as Record<string, any>;
    const previousChecks = Array.isArray(report.deterministicChecks) ? report.deterministicChecks : [];
    const sessionScopeMatches = previousChecks.find((check: any) => check.id === "DET-SESSION-SCOPE-001")?.status === "pass";
    const proposalCreated = Boolean(report.proposal);
    const checks = buildBaselineChecks({
      sessionScopeMatches,
      proposalExpected: Boolean(report.expectedProposal),
      proposalCreated,
      proposalTypeMatches: proposalCreated,
      confirmationExpected: false,
      executionCompleted: false,
      businessSnapshotObserved: false,
      preConfirmSnapshotUnchanged: false,
      confirmationPromptCount: 0,
      confirmationCallCount: 0,
      databaseChangedAfterConfirmation: false,
      canonicalDocumentCreated: false,
      judgeSnapshotUnchanged: false,
      judgeSnapshotObserved: false,
      cleanupSucceeded: Boolean(report.cleanup?.disposableOrganizationRemoved),
    });
    report.deterministicChecks = checks;
    report.technicalStatus = "blocked";
    await writePrivateJson(run.reportPath, sanitizeEvaluationValue(report));
    run.failedChecks = checks.filter((check) => check.status === "fail").map((check) => check.id);
    run.defectClasses = ["state"];
    repaired += 1;
  }
  await writePrivateJson(PROGRESS_PATH, progress);
  console.log(`${repaired} relatorio(s) de erro tecnico reclassificado(s) sem alterar custo, transcricao ou resposta.`);
}

async function preflight() {
  assertEvaluationEnvironment(process.env);
  const { manifest, blocks, rubric } = await loadCatalog();
  const config = runtimeConfiguration();
  const ledger = await readLedger();
  assertBudgetAllowsNextCall({
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
    currentCaseCostUsd: 0,
    reserveUsd: PLANNING_RESERVE_USD,
    policy: rubric.costPolicy,
  });
  const staging = serviceClient();
  const connection = await staging.from("organizations").select("id", { count: "exact", head: true });
  if (connection.error) throw connection.error;
  const stale = await staging.from("organizations").select("id,name").like("name", "EVAL Oraculo %");
  if (stale.error) throw stale.error;
  if ((stale.data ?? []).length) throw new Error(`preflight encontrou ${(stale.data ?? []).length} organizacao(oes) descartavel(is) sem cleanup`);
  if (EVALUATION_COHORT === "q5") {
    const baseline = await readRequiredProgress(Q3_PROGRESS_PATH, "baseline Q3");
    const baselineKeys = new Set(baseline.runs.map(baselineRunKey));
    if (baseline.runs.length !== 40 || baselineKeys.size !== 40) {
      throw new Error("Q5 exige baseline Q3 completa com 40 rodadas unicas");
    }
    const baselineReport = await readJson(baseline.runs[0].reportPath) as Record<string, any>;
    const generatorMatches = baselineReport.generator?.provider === config.provider
      && baselineReport.generator?.model === config.planningModel;
    const judgeMatches = baselineReport.judgeRuntime?.provider === config.provider
      && baselineReport.judgeRuntime?.model === config.judgeModel;
    if (!generatorMatches || !judgeMatches) throw new Error("modelos configurados para Q5 divergem dos modelos registrados na Q3");
    console.log("Baseline Q3 completa: 40 rodadas, incluindo falhas observadas; modelos da regressao conferem com a referencia.");
  }
  console.log(`Catalogo ${manifest.catalogVersion}: ${blocks.reduce((sum, block) => sum + block.cases.length, 0)} casos; gate owner-approved.`);
  console.log(`Staging acessivel; nenhuma organizacao de avaliacao pendente.`);
  console.log(`Gerador ${config.provider}/${config.planningModel}; judge ${config.provider}/${config.judgeModel}; chave descartavel presente e nao exibida.`);
  console.log(`Custo acumulado atual: US$ ${ledger.cumulativePlanCostUsd.toFixed(6)}; limite US$ ${Number(rubric.costPolicy.authorizedLimitUsd).toFixed(2)}.`);
}

export async function main(args = process.argv.slice(2)) {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [command, value] = normalizedArgs;
  if (command === "preflight") await preflight();
  else if (command === "archive-calibration") await archiveCalibration();
  else if (command === "archive-errors") await archiveExecutionErrors();
  else if (command === "cleanup-stale") await cleanupStaleFixtures();
  else if (command === "deterministic") await runDeterministicBaseline();
  else if (command === "human-packet") await writeHumanReviewPacket();
  else if (command === "repair-execution-checks") await repairExecutionChecks();
  else if (command === "phase" && value) await runPhase(value);
  else if (command === "summary") await writeSummary();
  else if (command === "compare") await compareQ5Regression();
  else {
    console.error(`Uso: strategic-baseline.ts preflight | archive-calibration | archive-errors | cleanup-stale | deterministic | human-packet | repair-execution-checks | phase ${COHORT_LABEL}A|${COHORT_LABEL}B|${COHORT_LABEL}C|${COHORT_LABEL}D | summary | compare`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
