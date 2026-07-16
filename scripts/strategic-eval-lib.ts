import { createHash } from "node:crypto";

export const PRODUCTION_PROJECT_REF = "bkswkfazkjilwfzwzthz";
export const EVALUATION_KEY_SCOPE = "staging-disposable";

export type EvaluationChannel = "web" | "whatsapp";
export type CheckStatus = "pass" | "fail" | "not_applicable";

export interface StrategicEvaluationCase {
  schemaVersion: 1;
  caseId: string;
  title: string;
  channel: EvaluationChannel;
  planType: "quarterly";
  period: string;
  scope: {
    organizationAlias: string;
    areaAlias: string;
    personAlias: string;
  };
  seed: {
    strategicObjective: string;
    areaRole: string;
    annualObjective: string;
  };
  turns: string[];
  expected: {
    proposalType: "save_quarterly_plan";
    minimumQuarterlyObjectives: number;
    maximumQuarterlyObjectives: number;
    requiresMetric: boolean;
    requiresTarget: boolean;
    requiresOwner: boolean;
    requiresDeliverables: boolean;
  };
}

export interface DeterministicEvidence {
  sessionScopeMatches: boolean;
  proposalTypeMatches: boolean;
  requiredFieldsPresent: boolean;
  preConfirmMutationCount: number;
  confirmationPromptCount: number;
  confirmationCallCount: number;
  databaseMatchesProposal: boolean;
  documentMatchesProposal: boolean;
  judgeSnapshotUnchanged: boolean;
}

export interface EvaluationCheck {
  id: string;
  status: CheckStatus;
  evidence: string;
}

export interface EvaluationCostPolicy {
  authorizedLimitUsd: number;
  warningAtUsd: number;
  preventiveStopAtUsd: number;
}

export interface UsageLike {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface EvaluationReportLike {
  caseId: string;
  baselineVersion: string;
  rubricVersion: string;
  channel: EvaluationChannel;
  transcript: unknown;
  proposal: unknown;
  deterministicChecks: EvaluationCheck[];
  judge: unknown;
  runtime?: unknown;
  cost?: unknown;
  cleanup?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("objeto esperado");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, maxLength = 1_000): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} obrigatorio`);
  if (text.length > maxLength) throw new Error(`${field} excede ${maxLength} caracteres`);
  return text;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} deve ser booleano`);
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} deve ser inteiro nao negativo`);
  return parsed;
}

export function assertSyntheticMaterial(value: unknown): void {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    { label: "referencia de producao", pattern: new RegExp(PRODUCTION_PROJECT_REF, "i") },
    { label: "UUID real", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
    { label: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
    { label: "telefone brasileiro", pattern: /\+55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/ },
    { label: "chave OpenAI", pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/ },
    { label: "token GitHub", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
    { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{20,}\b/ },
  ];
  for (const item of forbidden) {
    if (item.pattern.test(source)) throw new Error(`material de avaliacao contem ${item.label}`);
  }
}

export function validateStrategicEvaluationCase(value: unknown): StrategicEvaluationCase {
  const record = asRecord(value);
  if (record.schemaVersion !== 1) throw new Error("schemaVersion do caso deve ser 1");
  const scope = asRecord(record.scope);
  const seed = asRecord(record.seed);
  const expected = asRecord(record.expected);
  const turns = Array.isArray(record.turns) ? record.turns.map((turn, index) => requiredText(turn, `turns[${index}]`)) : [];
  if (turns.length < 2 || turns.length > 12) throw new Error("caso deve ter entre 2 e 12 turnos");

  const channel = requiredText(record.channel, "channel") as EvaluationChannel;
  if (!(["web", "whatsapp"] as string[]).includes(channel)) throw new Error("channel invalido");
  if (record.planType !== "quarterly") throw new Error("Q1 aceita somente plano quarterly");
  if (expected.proposalType !== "save_quarterly_plan") throw new Error("proposalType invalido para Q1");

  const parsed: StrategicEvaluationCase = {
    schemaVersion: 1,
    caseId: requiredText(record.caseId, "caseId", 80),
    title: requiredText(record.title, "title", 160),
    channel,
    planType: "quarterly",
    period: requiredText(record.period, "period", 40),
    scope: {
      organizationAlias: requiredText(scope.organizationAlias, "scope.organizationAlias", 80),
      areaAlias: requiredText(scope.areaAlias, "scope.areaAlias", 80),
      personAlias: requiredText(scope.personAlias, "scope.personAlias", 80),
    },
    seed: {
      strategicObjective: requiredText(seed.strategicObjective, "seed.strategicObjective", 300),
      areaRole: requiredText(seed.areaRole, "seed.areaRole", 300),
      annualObjective: requiredText(seed.annualObjective, "seed.annualObjective", 300),
    },
    turns,
    expected: {
      proposalType: "save_quarterly_plan",
      minimumQuarterlyObjectives: requiredInteger(expected.minimumQuarterlyObjectives, "expected.minimumQuarterlyObjectives"),
      maximumQuarterlyObjectives: requiredInteger(expected.maximumQuarterlyObjectives, "expected.maximumQuarterlyObjectives"),
      requiresMetric: requiredBoolean(expected.requiresMetric, "expected.requiresMetric"),
      requiresTarget: requiredBoolean(expected.requiresTarget, "expected.requiresTarget"),
      requiresOwner: requiredBoolean(expected.requiresOwner, "expected.requiresOwner"),
      requiresDeliverables: requiredBoolean(expected.requiresDeliverables, "expected.requiresDeliverables"),
    },
  };
  if (!/^[A-Z0-9][A-Z0-9-]+$/.test(parsed.caseId)) throw new Error("caseId deve usar somente A-Z, 0-9 e hifen");
  if (parsed.expected.minimumQuarterlyObjectives < 1) throw new Error("caso precisa esperar ao menos um objetivo trimestral");
  if (parsed.expected.maximumQuarterlyObjectives < parsed.expected.minimumQuarterlyObjectives) {
    throw new Error("maximumQuarterlyObjectives menor que minimumQuarterlyObjectives");
  }
  assertSyntheticMaterial(parsed);
  return parsed;
}

export function assertEvaluationEnvironment(env: NodeJS.ProcessEnv): void {
  const url = requiredText(env.SUPABASE_STAGING_URL, "SUPABASE_STAGING_URL");
  const projectRef = requiredText(env.SUPABASE_STAGING_PROJECT_REF, "SUPABASE_STAGING_PROJECT_REF");
  requiredText(env.SUPABASE_STAGING_ANON_KEY, "SUPABASE_STAGING_ANON_KEY");
  requiredText(env.SUPABASE_STAGING_SERVICE_ROLE_KEY, "SUPABASE_STAGING_SERVICE_ROLE_KEY");
  requiredText(env.SUPABASE_STAGING_ACCESS_TOKEN, "SUPABASE_STAGING_ACCESS_TOKEN");
  requiredText(env.ORACULO_EVAL_API_KEY, "ORACULO_EVAL_API_KEY");
  if (env.ORACULO_EVAL_KEY_SCOPE !== EVALUATION_KEY_SCOPE) {
    throw new Error(`ORACULO_EVAL_KEY_SCOPE deve ser ${EVALUATION_KEY_SCOPE}`);
  }
  if (url.includes(PRODUCTION_PROJECT_REF) || projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("RECUSADO: laboratorio de avaliacao aponta para PRODUCAO");
  }
  if (!url.includes(projectRef)) throw new Error("SUPABASE_STAGING_URL nao corresponde ao project ref de staging");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(url)) throw new Error("Q1 exige staging hospedado no Supabase");
}

export function sanitizeEvaluationText(value: string): string {
  return value
    .replace(new RegExp(PRODUCTION_PROJECT_REF, "gi"), "PROJECT_REF_REDACTED")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "ID_REDACTED")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "EMAIL_REDACTED")
    .replace(/\+55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g, "PHONE_REDACTED")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "KEY_REDACTED")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "TOKEN_REDACTED")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, "TOKEN_REDACTED");
}

export function sanitizeEvaluationValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeEvaluationText(value);
  if (Array.isArray(value)) return value.map(sanitizeEvaluationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/api[_-]?key|secret|password|authorization|token$/i.test(key))
      .map(([key, nested]) => [key, sanitizeEvaluationValue(nested)]),
  );
}

export function usageCostUsd(
  usage: UsageLike,
  pricing: { inputTokenPriceUsdPerMillion: number; outputTokenPriceUsdPerMillion: number },
): number {
  const promptTokens = Math.max(0, Number(usage.promptTokens) || 0);
  const completionTokens = Math.max(0, Number(usage.completionTokens) || 0);
  return (promptTokens * pricing.inputTokenPriceUsdPerMillion + completionTokens * pricing.outputTokenPriceUsdPerMillion) / 1_000_000;
}

export function assertBudgetAllowsNextCall(params: {
  cumulativePlanCostUsd: number;
  currentCaseCostUsd: number;
  reserveUsd: number;
  caseLimitUsd: number;
  policy: EvaluationCostPolicy;
}): void {
  const projectedPlan = params.cumulativePlanCostUsd + params.currentCaseCostUsd + params.reserveUsd;
  const projectedCase = params.currentCaseCostUsd + params.reserveUsd;
  if (projectedCase > params.caseLimitUsd) throw new Error("RECUSADO: proxima chamada pode ultrapassar o limite da fatia");
  if (projectedPlan >= params.policy.preventiveStopAtUsd) throw new Error("RECUSADO: parada preventiva de custo atingida");
  if (projectedPlan > params.policy.authorizedLimitUsd) throw new Error("RECUSADO: teto financeiro do plano atingido");
}

export function buildSessionRequests(
  evaluationCase: StrategicEvaluationCase,
  ids: { orgId: string; areaId: string; sessionId: string },
) {
  return [
    {
      action: "start",
      body: {
        action: "start",
        orgId: ids.orgId,
        areaId: ids.areaId,
        type: evaluationCase.planType,
        period: evaluationCase.period,
        channel: evaluationCase.channel,
      },
    },
    ...evaluationCase.turns.map((message) => ({
      action: "message",
      body: { action: "message", sessionId: ids.sessionId, message, channel: evaluationCase.channel },
    })),
    {
      action: "confirm",
      body: { action: "confirm", sessionId: ids.sessionId, channel: evaluationCase.channel },
    },
  ];
}

export function buildDeterministicChecks(evidence: DeterministicEvidence): EvaluationCheck[] {
  const check = (id: string, passed: boolean, detail: string): EvaluationCheck => ({
    id,
    status: passed ? "pass" : "fail",
    evidence: detail,
  });
  return [
    check("DET-SESSION-SCOPE-001", evidence.sessionScopeMatches, "tipo, area e periodo da sessao correspondem ao caso"),
    check("DET-PROPOSAL-TYPE-001", evidence.proposalTypeMatches, "proposal usa o tipo esperado pelo caso"),
    check("DET-REQUIRED-FIELDS-001", evidence.requiredFieldsPresent, "objetivos respeitam quantidade e campos obrigatorios"),
    check("CRIT-PREMATURE-WRITE-001", evidence.preConfirmMutationCount === 0, `mutacoes antes da confirmacao: ${evidence.preConfirmMutationCount}`),
    check("CRIT-MULTI-CONFIRM-001", evidence.confirmationPromptCount === 1 && evidence.confirmationCallCount === 1, `pedidos finais: ${evidence.confirmationPromptCount}; chamadas de confirmacao: ${evidence.confirmationCallCount}`),
    check("DET-DATABASE-SCOPE-001", evidence.databaseMatchesProposal, "banco preserva area, periodo e conteudo central da proposta"),
    check("CRIT-DIVERGENCE-001", evidence.databaseMatchesProposal && evidence.documentMatchesProposal, "proposta, banco e documento canonico correspondem"),
    check("CRIT-JUDGE-MUTATION-001", evidence.judgeSnapshotUnchanged, "snapshot do dominio permaneceu identico durante o judge"),
  ];
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);
  return asRecord(parsed);
}

export function comparisonFingerprint(report: EvaluationReportLike): string {
  const stable = {
    caseId: report.caseId,
    baselineVersion: report.baselineVersion,
    rubricVersion: report.rubricVersion,
    channel: report.channel,
    transcript: sanitizeEvaluationValue(report.transcript),
    proposal: sanitizeEvaluationValue(report.proposal),
    deterministicChecks: [...report.deterministicChecks]
      .map((item) => ({ id: item.id, status: item.status }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    judge: sanitizeEvaluationValue(report.judge),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function q1Gate(params: {
  proposalCreated: boolean;
  judgeStatus: "completed" | "error";
  checks: EvaluationCheck[];
  cleanupSucceeded: boolean;
  totalCaseCostUsd: number;
  caseLimitUsd: number;
}) {
  const reasons: string[] = [];
  if (!params.proposalCreated) reasons.push("proposta nao foi criada");
  if (params.judgeStatus !== "completed") reasons.push("judge nao concluiu");
  for (const check of params.checks.filter((item) => item.status === "fail")) reasons.push(`checagem falhou: ${check.id}`);
  if (!params.cleanupSucceeded) reasons.push("limpeza descartavel nao concluiu");
  if (params.totalCaseCostUsd > params.caseLimitUsd) reasons.push("custo da fatia excedido");
  return { status: reasons.length ? "blocked" as const : "approved" as const, reasons };
}
