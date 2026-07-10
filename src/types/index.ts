export type ObjectiveType = "harvest" | "seed";

export type Status = "on_track" | "at_risk" | "late" | "done";

export type PlanLevel = "strategic" | "area_annual" | "quarterly" | "monthly";
export type PlanningSessionType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close" | "strategic_review";
export type PlanningSessionStatus = "active" | "completed" | "abandoned";
export type PlanDocumentType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close" | "strategic_review" | "kpi_history";
export type PlanDocumentOrigin = "session" | "historical";
export type KpiKey = "revenue" | "operating_margin" | "production" | "cash";
export type KpiUnit = "currency" | "percent" | "count" | "number";
export type KpiSecondaryUnit = "count" | "number";
export type KpiDirection = "higher_better" | "lower_better";
export type KpiFlowType = "flow" | "stock";
export type OperationalEntityType = "objective" | "key_action" | "strategic_project" | "evidence" | "check_in" | "plan_document";
export type OperationalRevisionEntityType =
  | "strategic_plan"
  | "area_plan"
  | OperationalEntityType
  | "executive_kpi"
  | "kpi_monthly_value";

export interface OperationalLifecycle {
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  archiveBatchId?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  subtitle?: string;
  createdBy?: string | null;
}

export interface Area {
  id: string;
  orgId: string;
  name: string;
  coordinator: string;
  coordinatorId?: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
}

export interface Evidence extends OperationalLifecycle {
  id: string;
  orgId?: string;
  objectiveId: string;
  text: string;
  date: string;
  createdBy?: string | null;
}

export interface KeyAction extends OperationalLifecycle {
  id: string;
  orgId?: string;
  objectiveId: string;
  description: string;
  completionCriterion: string;
  deadline: string | null;
  owner: string;
  status?: Status;
}

export interface Objective extends OperationalLifecycle {
  id: string;
  orgId?: string;
  level: PlanLevel;
  type: ObjectiveType;
  title: string;
  result: string;
  metric?: string;
  target?: string;
  current?: string;
  trend?: "up" | "down" | "flat";
  deadline: string | null;
  owner: string;
  evidencePlan: string;
  status: Status;
  progress?: number;
  deliverables?: string[];
  areaId: string | null;
  parentId: string | null;
  period: string;
}

export interface StrategicProject extends OperationalLifecycle {
  id: string;
  orgId?: string;
  planId?: string | null;
  name: string;
  owner: string;
  deadline: string | null;
  status?: Status;
  linkedObjectiveId: string | null;
}

export interface StrategicPlan {
  id: string;
  orgId: string;
  year: number;
  profile: {
    sector: string;
    size: string;
    region: string;
    founded?: string;
    mainPain: string;
  };
  drivers: {
    purpose: string;
    vision: string;
    values: string[];
  };
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  themes: string[];
  projects: StrategicProject[];
  rituals: string[];
  executiveSummary: string;
}

export interface AreaPlan {
  id: string;
  areaId: string;
  year: number;
  role: {
    mission: string;
    contribution: string[];
  };
  linkedStrategicObjectiveIds: string[];
  diagnosis: {
    strengths: string[];
    weaknesses: string[];
  };
  mainAnnualObjectiveId: string | null;
  learningFocus: {
    q1: string[];
    q2: string[];
    q3: string[];
    q4: string[];
  };
}

export interface ChatMessage {
  id: string;
  orgId?: string;
  areaId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  author: "oracle" | "user";
  text: string;
  channel?: "web" | "whatsapp";
  createdAt?: string;
}

export interface PlanningSession {
  id: string;
  orgId: string;
  areaId: string | null;
  userId: string;
  conversationId: string | null;
  type: PlanningSessionType;
  period: string;
  phase: string;
  state: Record<string, unknown>;
  pendingProposal: Record<string, unknown> | null;
  status: PlanningSessionStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface PlanDocument {
  id: string;
  orgId: string;
  areaId: string | null;
  sessionId: string | null;
  type: PlanDocumentType;
  origin: PlanDocumentOrigin;
  period: string;
  title: string;
  content: Record<string, unknown>;
  version: number;
  createdBy: string | null;
  createdAt: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  archiveBatchId?: string | null;
}

export interface OperationalRevision {
  id: string;
  orgId: string;
  entityType: OperationalRevisionEntityType;
  entityId: string;
  action: "update" | "archive" | "restore";
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  changedBy: string | null;
  createdAt: string;
}

export interface HistoricalMetadataSuggestion {
  documentType: Extract<PlanDocumentType, "strategic" | "quarterly" | "monthly">;
  areaId: string | null;
  areaName: string | null;
  period: string;
  periodFound: boolean;
  title: string;
  summary: string;
  confidence: number;
  lowConfidenceFields: string[];
  source: "ai_background" | "heuristic";
}

export interface LadderStage {
  key: string;
  label: string;
  order: number;
}

export interface ExecutiveKpi {
  id: string;
  orgId: string;
  key: KpiKey;
  label: string;
  unit: KpiUnit;
  secondaryUnit: KpiSecondaryUnit | null;
  direction: KpiDirection;
  flowType: KpiFlowType;
  isLadder: boolean;
  ladder: LadderStage[];
  openingBalance: number | null;
  annualTarget: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface KpiMonthlyValue {
  id: string;
  orgId: string;
  kpiId: string;
  year: number;
  month: number;
  targetValue: number | null;
  targetStage: string | null;
  actualValue: number | null;
  secondaryActual: number | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface KpiSpreadsheetSuggestionRow {
  year: number;
  kpiKey: KpiKey;
  month: number;
  targetValue: number | null;
  targetStage: string | null;
  actualValue: number | null;
  secondaryActual: number | null;
  note: string | null;
}

export interface KpiSpreadsheetSuggestion {
  year: number;
  rows: KpiSpreadsheetSuggestionRow[];
  summary: string;
  warnings: string[];
  source: "ai_background" | "unavailable";
}

export type KpiImportKind = "spreadsheet" | "image";

export interface KpiImportImage {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
}

export interface KpiImportInput {
  kind: KpiImportKind;
  fileName: string;
  rawText?: string;
  image?: KpiImportImage;
}

export type OracleMode = "normal" | "minimized" | "expanded";

export type MembershipRole = "owner" | "admin" | "coordinator";

export interface Profile {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: MembershipRole;
  profile?: Profile | null;
}

export interface AiSettings {
  orgId: string;
  provider: AiProvider;
  model: string;
  hasKey: boolean;
  keyPreview?: string | null;
  inputTokenPriceUsdPerMillion: number;
  outputTokenPriceUsdPerMillion: number;
  pricingSource?: string | null;
}

export type AiProvider = "openai" | "anthropic" | "moonshot" | "xai";
export type AiFunction = "planning" | "daily" | "background";
export type OrgTonePreset = "equilibrado" | "acido" | "gentil" | "direto" | "motivador" | "custom";
export type AiConfigStatus = "ok" | "invalid_key" | "unknown_model" | "rate_limited" | "provider_error" | "timeout" | "no_key" | "untested";
export type AiConfigStatusSource = "save" | "manual" | "runtime";

export interface AiValidationResult {
  scope: AiFunction | AiProvider;
  provider: AiProvider;
  model: string;
  status: AiConfigStatus;
  httpStatus?: number;
  detail: string;
  checkedAt: string;
}

export interface AiSettingsSaveResult {
  ok: boolean;
  keyPreview?: string | null;
  validation?: AiValidationResult | null;
}

export interface AiFunctionSetting {
  orgId: string;
  function: AiFunction;
  provider: AiProvider;
  model: string;
  lastStatus?: AiConfigStatus | null;
  lastStatusDetail?: string | null;
  lastStatusSource?: AiConfigStatusSource | null;
  lastCheckedAt?: string | null;
  updatedAt?: string;
}

export interface AiProviderKeyStatus {
  orgId: string;
  provider: AiProvider;
  hasKey: boolean;
  keyPreview?: string | null;
  lastStatus?: AiConfigStatus | null;
  lastStatusDetail?: string | null;
  lastCheckedAt?: string | null;
  updatedAt?: string;
}

export interface AiUsageLog {
  id: string;
  orgId: string;
  provider: AiProvider;
  model: string;
  channel: "web" | "whatsapp" | "system";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputTokenPriceUsdPerMillion: number;
  outputTokenPriceUsdPerMillion: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OrgTone {
  orgId: string;
  preset: OrgTonePreset;
  acidity: number;
  drive: number;
  customNote: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface WhatsAppSettings {
  orgId: string;
  instanceUrl: string | null;
  instanceName: string | null;
  connectedNumber: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  keyPreview?: string | null;
  hasWebhookSecret: boolean;
  webhookSecretPreview?: string | null;
}

export interface CheckIn extends OperationalLifecycle {
  id: string;
  orgId: string;
  areaId: string | null;
  period: string;
  summary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AppState {
  sessionUserId: string | null;
  organizations: Organization[];
  activeOrgId: string | null;
  organization: Organization | null;
  memberships: Membership[];
  currentMembership: Membership | null;
  currentProfile: Profile | null;
  aiSettings: AiSettings | null;
  aiFunctionSettings: AiFunctionSetting[];
  aiProviderKeyStatuses: AiProviderKeyStatus[];
  aiUsageLogs: AiUsageLog[];
  orgTone: OrgTone | null;
  whatsappSettings: WhatsAppSettings | null;
  areas: Area[];
  archivedAreas: Area[];
  strategicPlan: StrategicPlan | null;
  archivedProjects: StrategicProject[];
  areaPlans: AreaPlan[];
  objectives: Objective[];
  archivedObjectives: Objective[];
  keyActions: KeyAction[];
  archivedKeyActions: KeyAction[];
  evidences: Evidence[];
  archivedEvidences: Evidence[];
  chatMessages: ChatMessage[];
  checkIns: CheckIn[];
  archivedCheckIns: CheckIn[];
  planningSessions: PlanningSession[];
  planDocuments: PlanDocument[];
  archivedPlanDocuments: PlanDocument[];
  operationalRevisions: OperationalRevision[];
  executiveKpis: ExecutiveKpi[];
  kpiValues: KpiMonthlyValue[];
  activeSession: PlanningSession | null;
  loading: boolean;
  ready: boolean;
  ui: {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    oracleMode: OracleMode;
  };
}

export const TYPE_LABEL: Record<ObjectiveType, string> = {
  harvest: "Resultado",
  seed: "Evolução",
};

export const STATUS_LABEL: Record<Status, string> = {
  on_track: "No Prazo",
  at_risk: "Em Risco",
  late: "Atrasado",
  done: "Concluído",
};

export const LEVEL_LABEL: Record<PlanLevel, string> = {
  strategic: "Estratégico",
  area_annual: "Anual da Área",
  quarterly: "Trimestral",
  monthly: "Mensal",
};

export const KPI_LABEL: Record<KpiKey, string> = {
  revenue: "Faturamento",
  operating_margin: "Margem operacional",
  production: "Produção",
  cash: "Caixa",
};
