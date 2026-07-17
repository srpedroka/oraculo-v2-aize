import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelUsage, Provider } from "../supabase/functions/_shared/model.ts";
import { resolveKnownPricing } from "../supabase/functions/_shared/pricing.ts";
import { anonClient, assertStaging, serviceClient } from "../tests/helpers/staging.ts";
import {
  assertBudgetAllowsNextCall,
  assertEvaluationEnvironment,
  buildStrategicQualityGate,
  buildDeterministicChecks,
  comparisonFingerprint,
  hasOnlyGroundedYears,
  parseJsonObject,
  q1Gate,
  sanitizeEvaluationText,
  sanitizeEvaluationValue,
  selectApplicableRubric,
  usageCostUsd,
  validateStrategicEvaluationCase,
  type EvaluationCheck,
  type StrategicEvaluationCase,
} from "./strategic-eval-lib.ts";

const PRIVATE_DIR = resolve(".agents-private");
const LEDGER_PATH = resolve(PRIVATE_DIR, "strategic-eval-ledger.json");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");
const BASELINE_PATH = resolve("tests/evals/strategic-quality/baseline.json");
const PLANNING_CALL_RESERVE_USD = 0.15;
const JUDGE_CALL_RESERVE_USD = 0.1;
const JUDGE_TIMEOUT_MS = 180_000;

export interface TranscriptMessage {
  sequence: number;
  role: "manager" | "oracle";
  content: string;
}

export interface CostLedger {
  schemaVersion: 1;
  cumulativePlanCostUsd: number;
  runs: Array<{
    runId: string;
    caseId: string;
    totalCostUsd: number;
    completedAt: string;
    status: "approved" | "blocked";
  }>;
}

export interface RuntimeConfiguration {
  provider: Provider;
  planningModel: string;
  judgeModel: string;
  apiKey: string;
  planningPricing: {
    inputTokenPriceUsdPerMillion: number;
    outputTokenPriceUsdPerMillion: number;
    source: string;
  };
  judgePricing: {
    inputTokenPriceUsdPerMillion: number;
    outputTokenPriceUsdPerMillion: number;
    source: string;
  };
}

export interface EvaluationOrg {
  orgId: string;
  label: string;
  owner: {
    id: string;
    email: string;
    password: string;
    membershipId: string;
  };
  areaId: string;
}

const EVAL_PASSWORD = "Oraculo-Eval-Q1-123!";

export function runId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readLedger(): Promise<CostLedger> {
  try {
    const parsed = await readJson(LEDGER_PATH) as CostLedger;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs)) throw new Error("ledger invalido");
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    return { schemaVersion: 1, cumulativePlanCostUsd: 0, runs: [] };
  }
}

export async function writePrivateJson(path: string, value: unknown) {
  await mkdir(PRIVATE_DIR, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export function runtimeConfiguration(): RuntimeConfiguration {
  const provider = String(process.env.ORACULO_EVAL_PROVIDER ?? "openai") as Provider;
  if (!(provider === "openai" || provider === "xai")) throw new Error("Q1 aceita somente OpenAI ou xAI no laboratorio atual");
  const planningModel = String(process.env.ORACULO_EVAL_PLANNING_MODEL ?? (provider === "xai" ? "grok-4.3" : "gpt-5.4")).trim();
  const judgeModel = String(process.env.ORACULO_EVAL_JUDGE_MODEL ?? (provider === "xai" ? "grok-4.5" : "gpt-5.4-mini")).trim();
  if (planningModel === judgeModel) throw new Error("judge deve usar modelo diferente do condutor");
  const planningPricing = resolveKnownPricing(provider, planningModel);
  const judgePricing = resolveKnownPricing(provider, judgeModel);
  if (!planningPricing || !judgePricing) throw new Error("modelo sem pricing versionado no catalogo");
  return {
    provider,
    planningModel,
    judgeModel,
    apiKey: String(process.env.ORACULO_EVAL_API_KEY ?? "").trim(),
    planningPricing,
    judgePricing,
  };
}

export async function callFunction(
  slug: string,
  token: string,
  body: Record<string, unknown>,
  requestId: string,
) {
  const url = String(process.env.SUPABASE_STAGING_URL);
  const anonKey = String(process.env.SUPABASE_STAGING_ANON_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${url}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json() as Record<string, any>;
    if (!response.ok) {
      const errorCode = String(payload.errorCode ?? "UNKNOWN").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
      throw new Error(`${slug} falhou (${response.status}/${errorCode}): ${String(payload.error ?? "erro desconhecido")}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function retryTransport<T extends { error: { message?: string } | null }>(operation: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await operation();
      if (!/fetch failed|network error|connection reset|timed out/i.test(result.error?.message ?? "") || attempt === 2) return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/fetch failed|network error|connection reset|timed out/i.test(message) || attempt === 2) throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, (attempt + 1) * 300));
  }
  throw new Error("retry de transporte do laboratorio terminou sem resultado");
}

export async function runStagingSql(query: string) {
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF ?? "");
  const accessToken = String(process.env.SUPABASE_STAGING_ACCESS_TOKEN ?? "");
  if (!projectRef || !accessToken) throw new Error("credenciais da Management API de staging ausentes");
  const delays = [1_000, 2_000, 5_000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (response.ok) return;
      const responseBody = await response.text();
      if ((response.status < 500 && response.status !== 429) || attempt === delays.length) {
        throw new Error(`SQL de staging falhou (${response.status}): ${responseBody.slice(0, 300)}`);
      }
    } catch (error) {
      if (attempt === delays.length) throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delays[attempt]));
  }
}

export async function purgeEvaluationOrg(orgId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orgId)) throw new Error("orgId descartavel invalido para cleanup");
  const sql = `do $$
declare t text;
begin
  set local session_replication_role = replica;
  delete from public.organization_restore_runs where source_org_id = '${orgId}' or target_org_id = '${orgId}';
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables i on i.table_schema = c.table_schema and i.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id' and i.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where org_id = %L', t, '${orgId}');
  end loop;
  delete from public.organizations where id = '${orgId}';
end $$;`;
  await runStagingSql(sql);
}

export async function createEvaluationOrg(tag: string): Promise<EvaluationOrg> {
  const admin = serviceClient();
  const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const label = `EVAL Oraculo ${stamp}`;
  const email = `eval-owner-${stamp}-${tag}@oraculo-eval.invalid`;
  let userId = "";
  let orgId = "";
  try {
    const created = await retryTransport(() => admin.auth.admin.createUser({ email, password: EVAL_PASSWORD, email_confirm: true }));
    if (created.error || !created.data.user) throw created.error ?? new Error("usuario de avaliacao nao criado");
    userId = created.data.user.id;
    const profile = await retryTransport(() => admin.from("profiles").upsert({ id: userId, full_name: "PERSON_FIXTURE_OWNER", email }));
    if (profile.error) throw profile.error;
    const org = await retryTransport(() => admin.from("organizations").insert({
      name: label,
      subtitle: "avaliacao sintetica descartavel",
      created_by: userId,
    }).select("id").single());
    if (org.error || !org.data) throw org.error ?? new Error("empresa de avaliacao nao criada");
    orgId = String(org.data.id);
    const membership = await retryTransport(() => admin.from("memberships").insert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
    }).select("id").single());
    if (membership.error || !membership.data) throw membership.error ?? new Error("membership de avaliacao nao criada");
    const area = await retryTransport(() => admin.from("areas").insert({
      org_id: orgId,
      name: "Comercial Sintetico",
      coordinator_id: membership.data.id,
    }).select("id").single());
    if (area.error || !area.data) throw area.error ?? new Error("area de avaliacao nao criada");
    return {
      orgId,
      label,
      owner: { id: userId, email, password: EVAL_PASSWORD, membershipId: String(membership.data.id) },
      areaId: String(area.data.id),
    };
  } catch (error) {
    if (orgId) await purgeEvaluationOrg(orgId).catch(() => undefined);
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }
}

export async function destroyEvaluationOrg(handle: EvaluationOrg) {
  const admin = serviceClient();
  await purgeEvaluationOrg(handle.orgId);
  const deleted = await retryTransport(() => admin.auth.admin.deleteUser(handle.owner.id));
  if (deleted.error) throw deleted.error;
  const [org, user] = await Promise.all([
    retryTransport(() => admin.from("organizations").select("id").eq("id", handle.orgId).maybeSingle()),
    retryTransport(() => admin.auth.admin.getUserById(handle.owner.id)),
  ]);
  if (org.data) throw new Error("empresa de avaliacao ainda existe apos cleanup");
  if (user.data.user) throw new Error("usuario de avaliacao ainda existe apos cleanup");
}

export async function configureDisposableAi(handle: EvaluationOrg, config: RuntimeConfiguration) {
  const admin = serviceClient();
  const keyPreview = `****${config.apiKey.slice(-4)}`;
  const now = new Date().toISOString();
  const operations = [
    admin.from("ai_model_keys").upsert({
      org_id: handle.orgId,
      provider: config.provider,
      api_key: config.apiKey,
      updated_at: now,
    }, { onConflict: "org_id,provider" }),
    admin.from("ai_provider_key_status").upsert({
      org_id: handle.orgId,
      provider: config.provider,
      has_key: true,
      key_preview: keyPreview,
      last_status: "untested",
      last_status_detail: "Chave descartavel configurada pelo laboratorio Q1.",
      updated_at: now,
    }, { onConflict: "org_id,provider" }),
    admin.from("ai_settings").upsert({
      org_id: handle.orgId,
      provider: config.provider,
      model: config.planningModel,
      has_key: true,
      key_preview: keyPreview,
      input_token_price_usd_per_million: config.planningPricing.inputTokenPriceUsdPerMillion,
      output_token_price_usd_per_million: config.planningPricing.outputTokenPriceUsdPerMillion,
      pricing_source: config.planningPricing.source,
      updated_at: now,
    }, { onConflict: "org_id" }),
    admin.from("ai_function_settings").upsert({
      org_id: handle.orgId,
      function: "planning",
      provider: config.provider,
      model: config.planningModel,
      updated_at: now,
    }, { onConflict: "org_id,function" }),
  ];
  const results = await Promise.all(operations);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;
}

async function seedPreviousAnnualContext(handle: EvaluationOrg, evaluationCase: StrategicEvaluationCase) {
  const admin = serviceClient();
  const year = Number(evaluationCase.period.match(/20\d{2}/)?.[0] ?? 2026) - 1;
  const strategicPlan = await admin.from("strategic_plans").insert({
    org_id: handle.orgId,
    year,
    profile: { sector: "fixture", size: "fixture", region: "fixture" },
    drivers: { purpose: "Executar com clareza", vision: "Operacao sintetica previsivel", values: ["Clareza"] },
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    themes: ["Aprendizado sintetico anterior"],
    rituals: ["Revisao mensal sintetica"],
    executive_summary: evaluationCase.seed.previousAnnualSignal,
  }).select("id").single();
  if (strategicPlan.error || !strategicPlan.data) throw strategicPlan.error ?? new Error("plano anual anterior sintetico nao criado");

  const strategicObjective = await admin.from("objectives").insert({
    org_id: handle.orgId,
    area_id: null,
    level: "strategic",
    type: "harvest",
    title: evaluationCase.seed.previousAnnualSignal,
    result: evaluationCase.seed.previousAnnualSignal,
    metric: "Sinal anual sintetico anterior",
    target: "Aprendizado registrado no ano anterior",
    owner: evaluationCase.scope.personAlias,
    evidence_plan: "Placar sintetico",
    status: "on_track",
    progress: 10,
    period: String(year),
  }).select("id").single();
  if (strategicObjective.error || !strategicObjective.data) throw strategicObjective.error ?? new Error("objetivo anual anterior sintetico nao criado");
}

export async function ownerToken(handle: EvaluationOrg) {
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email: handle.owner.email, password: handle.owner.password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error("login sintetico ausente");
  return signed.data.session.access_token;
}

export async function generationUsage(handle: EvaluationOrg, startedAt: string) {
  const result = await serviceClient()
    .from("ai_usage_logs")
    .select("prompt_tokens,completion_tokens,total_tokens,total_cost_usd,metadata")
    .eq("org_id", handle.orgId)
    .gte("created_at", startedAt);
  if (result.error) throw result.error;
  return (result.data ?? []).reduce((total, item) => {
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : {};
    const attempt = Number(metadata.adaptiveAttempt);
    const attemptKey = Number.isInteger(attempt) && attempt > 0 ? String(attempt) : "unclassified";
    const repairReasons = Array.isArray(metadata.adaptiveRepairReasons)
      ? metadata.adaptiveRepairReasons.map(String).filter(Boolean)
      : [];
    return {
      promptTokens: total.promptTokens + Number(item.prompt_tokens ?? 0),
      completionTokens: total.completionTokens + Number(item.completion_tokens ?? 0),
      totalTokens: total.totalTokens + Number(item.total_tokens ?? 0),
      totalCostUsd: total.totalCostUsd + Number(item.total_cost_usd ?? 0),
      callCount: total.callCount + 1,
      adaptiveAttemptCounts: {
        ...total.adaptiveAttemptCounts,
        [attemptKey]: (total.adaptiveAttemptCounts[attemptKey] ?? 0) + 1,
      },
      adaptiveRepairReasonCounts: repairReasons.reduce((counts, reason) => ({
        ...counts,
        [reason]: (counts[reason] ?? 0) + 1,
      }), total.adaptiveRepairReasonCounts),
    };
  }, {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    callCount: 0,
    adaptiveAttemptCounts: {} as Record<string, number>,
    adaptiveRepairReasonCounts: {} as Record<string, number>,
  });
}

async function targetPlanState(handle: EvaluationOrg, evaluationCase: StrategicEvaluationCase) {
  const admin = serviceClient();
  const year = Number(evaluationCase.period.match(/20\d{2}/)?.[0] ?? 2026);
  const [strategicPlans, objectives, documents] = await Promise.all([
    admin.from("strategic_plans")
      .select("id,year,profile,drivers,swot,themes,rituals,executive_summary")
      .eq("org_id", handle.orgId)
      .eq("year", year),
    admin.from("objectives")
      .select("id,title,metric,target,current,deadline,owner,evidence_plan,period,area_id,deliverables")
      .eq("org_id", handle.orgId)
      .is("area_id", null)
      .eq("level", "strategic")
      .eq("period", evaluationCase.period)
      .is("archived_at", null),
    admin.from("plan_documents")
      .select("id,type,period,area_id,origin,content")
      .eq("org_id", handle.orgId)
      .is("area_id", null)
      .eq("type", "strategic")
      .eq("period", evaluationCase.period)
      .is("archived_at", null),
  ]);
  if (strategicPlans.error) throw strategicPlans.error;
  if (objectives.error) throw objectives.error;
  if (documents.error) throw documents.error;
  return { strategicPlans: strategicPlans.data ?? [], objectives: objectives.data ?? [], documents: documents.data ?? [] };
}

export async function domainSnapshotHash(handle: EvaluationOrg) {
  const admin = serviceClient();
  const tables = ["strategic_plans", "area_plans", "objectives", "key_actions", "plan_documents", "planning_sessions", "chat_messages"];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    const result = await admin.from(table).select("*").eq("org_id", handle.orgId);
    if (result.error) throw result.error;
    data[table] = [...(result.data ?? [])].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function annualObjectives(proposal: Record<string, any>) {
  return Array.isArray(proposal.objectives) ? proposal.objectives as Array<Record<string, any>> : [];
}

function requiredProposalFieldsPresent(proposal: Record<string, any>, evaluationCase: StrategicEvaluationCase) {
  const objectives = annualObjectives(proposal);
  if (objectives.length < evaluationCase.expected.minimumObjectives || objectives.length > evaluationCase.expected.maximumObjectives) return false;
  if (!Array.isArray(proposal.projects) || proposal.projects.length < evaluationCase.expected.minimumProjects) return false;
  if (evaluationCase.expected.requiresDrivers) {
    const drivers = proposal.drivers;
    if (!drivers || !String(drivers.purpose ?? "").trim() || !String(drivers.vision ?? "").trim() || !Array.isArray(drivers.values) || !drivers.values.length) return false;
  }
  if (evaluationCase.expected.requiresSwot) {
    const swot = proposal.swot;
    if (!swot || ![swot.strengths, swot.weaknesses, swot.opportunities, swot.threats].every((items) => Array.isArray(items) && items.length)) return false;
  }
  if (evaluationCase.expected.requiresRituals && (!Array.isArray(proposal.rituals) || !proposal.rituals.length)) return false;
  if (evaluationCase.expected.requiresRisks && (!Array.isArray(proposal.risks) || !proposal.risks.length)) return false;
  if (evaluationCase.expected.requiresRenunciations && (!Array.isArray(proposal.renunciations) || !proposal.renunciations.length)) return false;
  if (evaluationCase.expected.requiresHistoricalLessons && (!Array.isArray(proposal.historicalLessons) || !proposal.historicalLessons.length)) return false;
  if (!hasOnlyGroundedYears(proposal.historicalLessons, [evaluationCase.seed.previousAnnualSignal, ...evaluationCase.turns])) return false;
  if (evaluationCase.expected.requiresPendingDecisions && (!Array.isArray(proposal.pendingDecisions) || !proposal.pendingDecisions.length)) return false;
  return objectives.every((objective) => {
    if (!String(objective.title ?? "").trim()) return false;
    if (evaluationCase.expected.requiresMetric && !String(objective.metric ?? "").trim()) return false;
    if (evaluationCase.expected.requiresTarget && !String(objective.target ?? "").trim()) return false;
    if (evaluationCase.expected.requiresBaseline && !String(objective.current ?? objective.baseline ?? "").trim()) return false;
    if (evaluationCase.expected.requiresDeadline && !String(objective.deadline ?? "").trim()) return false;
    if (evaluationCase.expected.requiresStrategies && (!Array.isArray(objective.strategies) || objective.strategies.length < 1)) return false;
    if (evaluationCase.expected.requiresOwner && !String(objective.owner ?? "").trim()) return false;
    return true;
  });
}

function proposalMatchesDatabase(proposal: Record<string, any>, state: Awaited<ReturnType<typeof targetPlanState>>, evaluationCase: StrategicEvaluationCase) {
  const proposalObjectives = annualObjectives(proposal);
  const proposalTitles = proposalObjectives.map((item) => String(item.title ?? "").trim().toLowerCase()).filter(Boolean);
  const databaseTitles = state.objectives.map((item: any) => String(item.title ?? "").trim().toLowerCase());
  const profile = state.strategicPlans[0]?.profile ?? {};
  return state.strategicPlans.length === 1
    && JSON.stringify(profile.renunciations ?? []) === JSON.stringify(proposal.renunciations ?? [])
    && JSON.stringify(profile.risks ?? []) === JSON.stringify(proposal.risks ?? [])
    && JSON.stringify(profile.pendingDecisions ?? []) === JSON.stringify(proposal.pendingDecisions ?? [])
    && JSON.stringify(profile.historicalLessons ?? []) === JSON.stringify(proposal.historicalLessons ?? [])
    && proposalTitles.length > 0
    && proposalTitles.every((title) => databaseTitles.includes(title))
    && state.objectives.every((item: any) => {
      const source = proposalObjectives.find((objective) => String(objective.title ?? "").trim().toLowerCase() === String(item.title ?? "").trim().toLowerCase());
      return item.area_id === null
        && item.period === evaluationCase.period
        && String(item.current ?? "") === String(source?.current ?? source?.baseline ?? "")
        && String(item.evidence_plan ?? "") === String(source?.source ?? "")
        && JSON.stringify(item.deliverables ?? []) === JSON.stringify(source?.strategies ?? []);
    });
}

function proposalMatchesDocument(proposal: Record<string, any>, state: Awaited<ReturnType<typeof targetPlanState>>) {
  if (state.documents.length !== 1) return false;
  const documentSource = JSON.stringify(state.documents[0]?.content ?? {}).toLowerCase();
  const objectives = annualObjectives(proposal);
  const requiredValues = [
    ...objectives.flatMap((item) => [item.title, item.current ?? item.baseline, item.source, ...(item.strategies ?? [])]),
    ...(proposal.risks ?? []),
    ...(proposal.renunciations ?? []),
    ...(proposal.pendingDecisions ?? []),
    ...(proposal.historicalLessons ?? []),
  ].map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean);
  return objectives.length > 0 && requiredValues.every((value) => documentSource.includes(value));
}

export async function runJudge(params: {
  apiKey: string;
  provider: Provider;
  model: string;
  evaluationCase: unknown;
  transcript: TranscriptMessage[];
  proposal: Record<string, unknown>;
  derivedOutputs?: unknown;
  sessionScope?: unknown;
  rubric: unknown;
}) {
  const systemPrompt = [
    "Voce e um avaliador independente e somente leitura.",
    "Nao proponha mutacoes, nao chame ferramentas e nao tente corrigir o plano.",
    "Avalie a conducao e o plano usando apenas os IDs da rubrica recebida.",
    "Responda somente JSON valido, sem markdown.",
    "Formato: {\"summary\":\"\",\"rubricScores\":[{\"rubricId\":\"\",\"criteria\":[{\"id\":\"\",\"rating\":0,\"justification\":\"\"}],\"score\":0}],\"humanCriticalFailureCandidates\":[{\"id\":\"\",\"occurred\":false,\"justification\":\"\"}]}.",
    "Rating deve ser inteiro de 0 a 4. Nao aprove o gate; apenas forneca evidencia para revisao humana.",
    "Avalie todos os criterios e todas as falhas criticas humanas recebidas. Use justificativas objetivas de no maximo 20 palavras.",
    "PROTOCOLO DOS CASOS SINTETICOS: mensagens com 'Informacoes confirmadas' ou 'Dados concretos adicionais confirmados' sao respostas explicitas do gestor, nao preenchimento automatico do sistema.",
    "Quando o gestor acelerar e enviar um bloco completo, nao exija que o Oraculo repita a entrevista campo a campo. Avalie se ele absorveu o bloco, preservou fidelidade, fez os desafios de alto valor cabiveis e fechou sem burocracia.",
    "Na rubrica do plano, avalie a qualidade objetiva da proposal e das saidas derivadas. Nao reduza a nota do artefato apenas porque os dados vieram em uma resposta completa do gestor.",
    "Na conducao, quantidade de turnos nao e qualidade: uma pergunta diagnostica ou um desafio forte pode ser suficiente quando a resposta seguinte ja resolve as lacunas. Penalize repeticao, superficialidade real ou ausencia de escolha, nao concisao adaptativa.",
    "O sessionScope recebido e contexto canonico do servidor. Citar exatamente seu periodo, tipo ou area nao e fabricacao, mesmo que o gestor nao repita esses dados na conversa.",
  ].join("\n");
  const input = sanitizeEvaluationValue({
    evaluationCase: params.evaluationCase,
    sessionScope: params.sessionScope ?? null,
    transcript: params.transcript,
    proposal: params.proposal,
    derivedOutputs: params.derivedOutputs ?? null,
    rubric: params.rubric,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Tempo limite do judge atingido"), JUDGE_TIMEOUT_MS);
  const baseUrl = params.provider === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${params.provider === "openai" ? "responses" : "chat/completions"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(params.provider === "openai" ? {
        model: params.model,
        instructions: systemPrompt,
        input: [{ role: "user", content: JSON.stringify(input) }],
        max_output_tokens: 2_000,
        store: false,
      } : {
        model: params.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(input) },
        ],
        max_tokens: 2_000,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`judge nao respondeu corretamente (${response.status}): ${await response.text()}`);
  const data = await response.json() as Record<string, any>;
  const text = params.provider === "openai"
    ? String(data.output_text ?? (Array.isArray(data.output)
      ? data.output.flatMap((item: any) => item?.content ?? []).map((item: any) => item?.text ?? "").join("\n")
      : ""))
    : String(data.choices?.[0]?.message?.content ?? "");
  const promptTokens = Number(data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0);
  const completionTokens = Number(data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0);
  const result = {
    text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: Number(data.usage?.total_tokens ?? promptTokens + completionTokens),
    },
  };
  const parsed = parseJsonObject(result.text);
  if (!Array.isArray(parsed.rubricScores)) throw new Error("judge nao devolveu rubricScores");
  return { result: sanitizeEvaluationValue(parsed), usage: result.usage };
}

function confirmationPromptCount(transcript: TranscriptMessage[], proposalSequence: number) {
  return transcript.filter((message) =>
    message.role === "oracle"
      && message.sequence >= proposalSequence
      && /(confirm|gravar|salvar)/i.test(message.content)
  ).length;
}

export async function executeLiveCase(casePath: string) {
  assertEvaluationEnvironment(process.env);
  assertStaging();
  const evaluationCase = validateStrategicEvaluationCase(await readJson(resolve(casePath)));
  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const applicableRubric = selectApplicableRubric(rubric, evaluationCase.planType);
  const baseline = await readJson(BASELINE_PATH) as Record<string, any>;
  const config = runtimeConfiguration();
  const ledger = await readLedger();
  const policy = rubric.costPolicy;
  const id = runId();
  const reportPath = resolve(PRIVATE_DIR, `strategic-eval-q1-${id}.json`);
  const startedAt = new Date().toISOString();
  let handle: EvaluationOrg | null = null;
  let transcript: TranscriptMessage[] = [];
  let proposal: Record<string, any> | null = null;
  let checks: EvaluationCheck[] = [];
  let judge: { status: "completed" | "error"; result?: unknown; error?: string; usage?: ModelUsage } = { status: "error", error: "judge nao executado" };
  let generation = { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  let judgeCostUsd = 0;
  let cleanupSucceeded = false;
  let executionError: Error | null = null;
  let sessionScopeMatches = false;
  let preConfirmMutationCount = -1;
  let confirmCalls = 0;
  let proposalSequence = Number.MAX_SAFE_INTEGER;
  let judgeSnapshotUnchanged = false;
  let databaseMatchesProposal = false;
  let documentMatchesProposal = false;

  try {
    assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
      currentCaseCostUsd: 0,
      reserveUsd: PLANNING_CALL_RESERVE_USD,
      policy,
    });
    handle = await createEvaluationOrg("strategic-eval-q1");
    await configureDisposableAi(handle, config);
    await seedPreviousAnnualContext(handle, evaluationCase);
    const token = await ownerToken(handle);
    const start = await callFunction("oracle-session", token, {
      action: "start",
      orgId: handle.orgId,
      type: evaluationCase.planType,
      period: evaluationCase.period,
      channel: evaluationCase.channel,
    }, `strategic-eval-${id}-start`);
    const sessionId = String(start.session?.id ?? "");
    if (!sessionId) throw new Error("oracle-session nao devolveu sessionId");
    sessionScopeMatches = start.session?.org_id === handle.orgId
      && !start.session?.area_id
      && start.session?.period === evaluationCase.period
      && start.session?.type === evaluationCase.planType;
    transcript.push({ sequence: 1, role: "oracle", content: String(start.reply ?? "") });

    for (const turn of evaluationCase.turns) {
      generation = await generationUsage(handle, startedAt);
      assertBudgetAllowsNextCall({
        cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
        currentCaseCostUsd: generation.totalCostUsd,
        reserveUsd: PLANNING_CALL_RESERVE_USD,
        policy,
      });
      transcript.push({ sequence: transcript.length + 1, role: "manager", content: turn });
      const response = await callFunction("oracle-session", token, {
        action: "message",
        sessionId,
        message: turn,
        channel: evaluationCase.channel,
      }, `strategic-eval-${id}-message-${transcript.length}`);
      transcript.push({ sequence: transcript.length + 1, role: "oracle", content: String(response.reply ?? "") });
      if (response.pendingProposal && typeof response.pendingProposal === "object") {
        proposal = response.pendingProposal as Record<string, any>;
        proposalSequence = transcript.length;
        break;
      }
    }
    if (!proposal) throw new Error("condutor nao gerou proposal dentro dos turnos do caso");

    const beforeConfirm = await targetPlanState(handle, evaluationCase);
    preConfirmMutationCount = beforeConfirm.strategicPlans.length + beforeConfirm.objectives.length + beforeConfirm.documents.length;
    const beforeJudgeHash = await domainSnapshotHash(handle);
    generation = await generationUsage(handle, startedAt);
    assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
      currentCaseCostUsd: generation.totalCostUsd,
      reserveUsd: JUDGE_CALL_RESERVE_USD,
      policy,
    });
    try {
      const judged = await runJudge({
        apiKey: config.apiKey,
        provider: config.provider,
        model: config.judgeModel,
        evaluationCase,
        sessionScope: { type: evaluationCase.planType, period: evaluationCase.period, channel: evaluationCase.channel },
        transcript,
        proposal: proposal as Record<string, unknown>,
        rubric: applicableRubric,
      });
      judge = { status: "completed", result: judged.result, usage: judged.usage };
      judgeCostUsd = usageCostUsd(judged.usage, config.judgePricing);
    } catch (error) {
      judge = { status: "error", error: sanitizeEvaluationText(error instanceof Error ? error.message : String(error)) };
    }
    const afterJudgeHash = await domainSnapshotHash(handle);
    judgeSnapshotUnchanged = beforeJudgeHash === afterJudgeHash;

    confirmCalls += 1;
    await callFunction("oracle-session", token, {
      action: "confirm",
      sessionId,
      channel: evaluationCase.channel,
    }, `strategic-eval-${id}-confirm`);
    const afterConfirm = await targetPlanState(handle, evaluationCase);
    databaseMatchesProposal = proposalMatchesDatabase(proposal, afterConfirm, evaluationCase);
    documentMatchesProposal = proposalMatchesDocument(proposal, afterConfirm);
    checks = buildDeterministicChecks({
      sessionScopeMatches,
      proposalTypeMatches: proposal.type === evaluationCase.expected.proposalType,
      requiredFieldsPresent: requiredProposalFieldsPresent(proposal, evaluationCase),
      preConfirmMutationCount,
      confirmationPromptCount: confirmationPromptCount(transcript, proposalSequence),
      confirmationCallCount: confirmCalls,
      databaseMatchesProposal,
      documentMatchesProposal,
      judgeSnapshotUnchanged,
    });
    generation = await generationUsage(handle, startedAt);
  } catch (error) {
    executionError = error instanceof Error ? error : new Error(String(error));
    if (handle) {
      try {
        generation = await generationUsage(handle, startedAt);
      } catch {
        // Preserve the original failure; missing usage is explicit in the report.
      }
    }
  } finally {
    if (handle) {
      try {
        await destroyEvaluationOrg(handle);
        cleanupSucceeded = true;
      } catch (error) {
        cleanupSucceeded = false;
        const cleanupError = error instanceof Error ? error : new Error(String(error));
        executionError = executionError ?? cleanupError;
      }
    }
  }

  const totalCaseCostUsd = generation.totalCostUsd + judgeCostUsd;
  const technicalGate = q1Gate({
    proposalCreated: Boolean(proposal),
    judgeStatus: judge.status,
    checks,
    cleanupSucceeded,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + totalCaseCostUsd,
    authorizedLimitUsd: policy.authorizedLimitUsd,
  });
  if (executionError) technicalGate.reasons.unshift(sanitizeEvaluationText(executionError.message));
  if (executionError) technicalGate.status = "blocked";
  const qualityGate = buildStrategicQualityGate({
    technicalGateStatus: technicalGate.status,
    judgeStatus: judge.status,
    judgeResult: judge.result,
    applicableRubric,
    minimumPerRubric: Number(rubric.thresholds?.minimumPerRubric ?? 80),
    minimumJointAverage: Number(rubric.thresholds?.minimumJointAverage ?? 85),
  });

  const report: Record<string, unknown> = {
    schemaVersion: 1,
    reportVersion: "2026-07-16.q1-r2",
    caseId: evaluationCase.caseId,
    baselineVersion: String(baseline.baselineVersion ?? "unknown"),
    rubricVersion: String(rubric.rubricVersion ?? "unknown"),
    channel: evaluationCase.channel,
    runtime: {
      runId: id,
      startedAt,
      completedAt: new Date().toISOString(),
      environment: "staging",
      generator: { provider: config.provider, model: config.planningModel },
      judge: {
        provider: config.provider,
        model: config.judgeModel,
        access: "provider-only-no-database",
        applicableRubricIds: (applicableRubric.rubrics as Array<Record<string, unknown>>).map((item) => item.id),
      },
    },
    scope: evaluationCase.scope,
    transcript: sanitizeEvaluationValue(transcript),
    proposal: sanitizeEvaluationValue(proposal),
    deterministicChecks: checks,
    judge: sanitizeEvaluationValue(judge),
    cost: {
      generationCostUsd: generation.totalCostUsd,
      judgeCostUsd,
      totalCaseCostUsd,
      cumulativePlanCostBeforeUsd: ledger.cumulativePlanCostUsd,
      cumulativePlanCostAfterUsd: ledger.cumulativePlanCostUsd + totalCaseCostUsd,
      warningAtUsd: policy.warningAtUsd,
      preventiveStopAtUsd: policy.preventiveStopAtUsd,
      authorizedLimitUsd: policy.authorizedLimitUsd,
      generationUsage: {
        promptTokens: generation.promptTokens,
        completionTokens: generation.completionTokens,
        totalTokens: generation.totalTokens,
      },
      judgeUsage: judge.usage ?? null,
    },
    cleanup: { disposableOrganizationRemoved: cleanupSucceeded, providerKeyRemovedWithOrganization: cleanupSucceeded },
    technicalGate,
    qualityGate,
  };
  report.comparisonFingerprint = comparisonFingerprint(report as any);
  const sanitizedReport = sanitizeEvaluationValue(report);
  await writePrivateJson(reportPath, sanitizedReport);

  const nextLedger: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd + totalCaseCostUsd,
    runs: [...ledger.runs, {
      runId: id,
      caseId: evaluationCase.caseId,
      totalCostUsd: totalCaseCostUsd,
      completedAt: new Date().toISOString(),
      status: qualityGate.status,
    }],
  };
  await writePrivateJson(LEDGER_PATH, nextLedger);

  console.log(`Relatorio Q1: ${reportPath}`);
  console.log(`Gate tecnico Q1: ${technicalGate.status}`);
  console.log(`Gate de qualidade Q1: ${qualityGate.status}`);
  console.log(`Custo de geracao do plano: US$ ${generation.totalCostUsd.toFixed(6)}`);
  console.log(`Custo do judge: US$ ${judgeCostUsd.toFixed(6)}`);
  console.log(`Custo total da execucao: US$ ${totalCaseCostUsd.toFixed(6)}`);
  console.log(`Acumulado do plano: US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}`);
  console.log(`Cleanup staging: ${cleanupSucceeded ? "OK" : "FALHOU"}`);
  if (qualityGate.status !== "approved") {
    throw new Error(`Q1 bloqueada: ${qualityGate.reasons.join(" | ") || "gate de qualidade nao aprovado"}`);
  }
}

export async function retryJudge(reportPathValue: string, casePath: string) {
  assertEvaluationEnvironment(process.env);
  assertStaging();
  const reportPath = resolve(reportPathValue);
  if (!reportPath.startsWith(`${PRIVATE_DIR}/strategic-eval-q1-`) || !reportPath.endsWith(".json")) {
    throw new Error("retry do judge aceita somente relatorio Q1 privado");
  }
  const report = await readJson(reportPath) as Record<string, any>;
  const evaluationCase = validateStrategicEvaluationCase(await readJson(resolve(casePath)));
  if (report.caseId !== evaluationCase.caseId) throw new Error("relatorio e caso de avaliacao nao correspondem");
  if (report.judge?.status === "completed") throw new Error("judge deste relatorio ja foi concluido");
  if (!Array.isArray(report.transcript) || !report.proposal || typeof report.proposal !== "object") {
    throw new Error("relatorio sem transcricao ou proposta reutilizavel");
  }
  if (!report.cleanup?.disposableOrganizationRemoved) throw new Error("retry recusado: cleanup anterior incompleto");

  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const applicableRubric = selectApplicableRubric(rubric, evaluationCase.planType);
  const policy = rubric.costPolicy;
  const config = runtimeConfiguration();
  const generatorModel = String(report.runtime?.generator?.model ?? "");
  if (generatorModel === config.judgeModel) throw new Error("judge deve usar modelo diferente do gerador registrado");
  const ledger = await readLedger();
  const reportRunId = String(report.runtime?.runId ?? "");
  const runIndex = ledger.runs.findIndex((item) => item.runId === reportRunId);
  if (runIndex < 0) throw new Error("execucao do relatorio nao encontrada no livro de custos");
  assertBudgetAllowsNextCall({
    cumulativePlanCostUsd: ledger.cumulativePlanCostUsd,
    currentCaseCostUsd: 0,
    reserveUsd: JUDGE_CALL_RESERVE_USD,
    policy,
  });

  let judge: { status: "completed" | "error"; result?: unknown; error?: string; usage?: ModelUsage };
  let newJudgeCostUsd = 0;
  try {
    const judged = await runJudge({
      apiKey: config.apiKey,
      provider: config.provider,
      model: config.judgeModel,
      evaluationCase,
      sessionScope: { type: evaluationCase.planType, period: evaluationCase.period, channel: evaluationCase.channel },
      transcript: report.transcript as TranscriptMessage[],
      proposal: report.proposal as Record<string, unknown>,
      rubric: applicableRubric,
    });
    judge = { status: "completed", result: judged.result, usage: judged.usage };
    newJudgeCostUsd = usageCostUsd(judged.usage, config.judgePricing);
  } catch (error) {
    judge = { status: "error", error: sanitizeEvaluationText(error instanceof Error ? error.message : String(error)) };
  }

  const checks = Array.isArray(report.deterministicChecks) ? report.deterministicChecks as EvaluationCheck[] : [];
  const previousCost = report.cost && typeof report.cost === "object" ? report.cost as Record<string, any> : {};
  const generationCostUsd = Number(previousCost.generationCostUsd ?? 0);
  const previousJudgeCostUsd = Number(previousCost.judgeCostUsd ?? 0);
  const judgeCostUsd = previousJudgeCostUsd + newJudgeCostUsd;
  const totalCaseCostUsd = generationCostUsd + judgeCostUsd;
  const cumulativePlanCostAfterUsd = ledger.cumulativePlanCostUsd + newJudgeCostUsd;
  const technicalGate = q1Gate({
    proposalCreated: true,
    judgeStatus: judge.status,
    checks,
    cleanupSucceeded: true,
    cumulativePlanCostUsd: cumulativePlanCostAfterUsd,
    authorizedLimitUsd: policy.authorizedLimitUsd,
  });
  const qualityGate = buildStrategicQualityGate({
    technicalGateStatus: technicalGate.status,
    judgeStatus: judge.status,
    judgeResult: judge.result,
    applicableRubric,
    minimumPerRubric: Number(rubric.thresholds?.minimumPerRubric ?? 80),
    minimumJointAverage: Number(rubric.thresholds?.minimumJointAverage ?? 85),
  });
  const completedAt = new Date().toISOString();
  report.runtime = {
    ...report.runtime,
    judge: {
      provider: config.provider,
      model: config.judgeModel,
      access: "provider-only-no-database",
      timeoutMs: JUDGE_TIMEOUT_MS,
      applicableRubricIds: (applicableRubric.rubrics as Array<Record<string, unknown>>).map((item) => item.id),
      lastAttemptAt: completedAt,
    },
  };
  report.judge = judge;
  report.cost = {
    ...previousCost,
    generationCostUsd,
    judgeCostUsd,
    totalCaseCostUsd,
    cumulativePlanCostAfterUsd,
    judgeUsage: judge.usage ?? null,
    lastJudgeExecution: {
      judgeCostUsd: newJudgeCostUsd,
      cumulativePlanCostBeforeUsd: ledger.cumulativePlanCostUsd,
      cumulativePlanCostAfterUsd,
    },
  };
  report.technicalGate = technicalGate;
  report.qualityGate = qualityGate;
  report.comparisonFingerprint = comparisonFingerprint(report as any);

  const nextLedger: CostLedger = {
    schemaVersion: 1,
    cumulativePlanCostUsd: cumulativePlanCostAfterUsd,
    runs: ledger.runs.map((item, index) => index === runIndex ? {
      ...item,
      totalCostUsd: item.totalCostUsd + newJudgeCostUsd,
      completedAt,
      status: qualityGate.status,
    } : item),
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue(report));
  await writePrivateJson(LEDGER_PATH, nextLedger);

  console.log(`Relatorio Q1 retomado: ${reportPath}`);
  console.log(`Gate tecnico Q1: ${technicalGate.status}`);
  console.log(`Gate de qualidade Q1: ${qualityGate.status}`);
  console.log(`Custo de geracao do plano: US$ ${generationCostUsd.toFixed(6)}`);
  console.log(`Custo desta execucao do judge: US$ ${newJudgeCostUsd.toFixed(6)}`);
  console.log(`Custo total do caso: US$ ${totalCaseCostUsd.toFixed(6)}`);
  console.log(`Acumulado do plano: US$ ${ledger.cumulativePlanCostUsd.toFixed(6)} -> US$ ${nextLedger.cumulativePlanCostUsd.toFixed(6)}`);
  console.log("Cleanup staging anterior: OK; nenhum acesso ao banco neste retry");
  if (qualityGate.status !== "approved") {
    throw new Error(`Q1 bloqueada: ${qualityGate.reasons.join(" | ") || "gate de qualidade nao aprovado"}`);
  }
}

export async function recomputeReportGate(reportPathValue: string) {
  const reportPath = resolve(reportPathValue);
  if (!reportPath.startsWith(`${PRIVATE_DIR}/strategic-eval-q1-`) || !reportPath.endsWith(".json")) {
    throw new Error("recalculo aceita somente relatorio Q1 privado");
  }
  const report = await readJson(reportPath) as Record<string, any>;
  const rubric = await readJson(RUBRIC_PATH) as Record<string, any>;
  const applicableRubric = selectApplicableRubric(rubric, "strategic");
  const technicalGateStatus = report.technicalGate?.status === "approved" ? "approved" : "blocked";
  const qualityGate = buildStrategicQualityGate({
    technicalGateStatus,
    judgeStatus: report.judge?.status === "completed" ? "completed" : "error",
    judgeResult: report.judge?.result,
    applicableRubric,
    minimumPerRubric: Number(rubric.thresholds?.minimumPerRubric ?? 80),
    minimumJointAverage: Number(rubric.thresholds?.minimumJointAverage ?? 85),
  });
  report.qualityGate = qualityGate;
  report.comparisonFingerprint = comparisonFingerprint(report as any);

  const ledger = await readLedger();
  const reportRunId = String(report.runtime?.runId ?? "");
  const runIndex = ledger.runs.findIndex((item) => item.runId === reportRunId);
  if (runIndex < 0) throw new Error("execucao do relatorio nao encontrada no livro de custos");
  const nextLedger: CostLedger = {
    ...ledger,
    runs: ledger.runs.map((item, index) => index === runIndex ? { ...item, status: qualityGate.status } : item),
  };
  await writePrivateJson(reportPath, sanitizeEvaluationValue(report));
  await writePrivateJson(LEDGER_PATH, nextLedger);
  console.log(`Relatorio Q1 recalculado: ${reportPath}`);
  console.log(`Gate tecnico Q1: ${technicalGateStatus}`);
  console.log(`Gate de qualidade Q1: ${qualityGate.status}`);
  console.log(`Media conjunta recalculada: ${qualityGate.jointAverage ?? "indisponivel"}`);
  console.log(`Acumulado do plano inalterado: US$ ${ledger.cumulativePlanCostUsd.toFixed(6)}`);
}

export async function main(args = process.argv.slice(2)) {
  const [command, primaryPath, casePath] = args;
  if (command === "run" && primaryPath) {
    await executeLiveCase(primaryPath);
  } else if (command === "judge-report" && primaryPath && casePath) {
    await retryJudge(primaryPath, casePath);
  } else if (command === "recompute-report" && primaryPath) {
    await recomputeReportGate(primaryPath);
  } else {
    console.error("Uso: strategic-eval.ts run <caso> | judge-report <relatorio> <caso> | recompute-report <relatorio>");
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
