import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  AiSettings,
  AiSettingsSaveResult,
  AiFunction,
  AiFunctionSetting,
  AiProvider,
  AiProviderKeyStatus,
  AiUsageLog,
  AppState,
  Area,
  AreaPlan,
  ChatMessage,
  CheckIn,
  Evidence,
  ExecutiveKpi,
  HistoricalMetadataSuggestion,
  KeyAction,
  KpiImportInput,
  KpiImportKind,
  KpiMonthlyValue,
  KpiSpreadsheetSuggestion,
  LadderStage,
  Membership,
  MembershipRole,
  Objective,
  OracleMode,
  OrgTone,
  Organization,
  PlanDocument,
  PlanDocumentType,
  PlanningSession,
  PlanningSessionType,
  Profile,
  StrategicPlan,
  StrategicProject,
  WhatsAppSettings,
} from "../types";

type AppAction =
  | { type: "toggle_sidebar" }
  | { type: "set_sidebar_width"; width: number }
  | { type: "set_oracle_mode"; mode: OracleMode }
  | { type: "set_active_org"; orgId: string }
  | { type: "create_organization"; name: string; subtitle?: string }
  | { type: "create_area"; name: string; coordinatorId?: string | null }
  | { type: "update_area"; areaId: string; name: string; coordinatorId?: string | null }
  | { type: "archive_area"; areaId: string; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "restore_area"; areaId: string; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "create_member"; email: string; fullName?: string; phone?: string | null; role: MembershipRole; areaId?: string | null }
  | { type: "set_member_role"; membershipId: string; role: Exclude<MembershipRole, "owner">; onSuccess?: () => void; onError?: (message: string) => void }
  | {
      type: "remove_member";
      membershipId: string;
      areaReassignments: Record<string, string | null>;
      onSuccess?: () => void;
      onError?: (message: string) => void;
    }
  | { type: "add_chat_message"; message: ChatMessage }
  | { type: "send_oracle_message"; text: string; areaId?: string | null; context?: string }
  | { type: "start_session"; sessionType: PlanningSessionType; areaId?: string | null; period: string }
  | { type: "import_ready_strategic_plan"; period: string; text: string; fileName?: string | null }
  | { type: "import_ready_quarterly_plan"; areaId: string; period: string; text: string; fileName?: string | null }
  | {
      type: "suggest_historical_metadata";
      rawText: string;
      fileName?: string | null;
      onSuccess?: (suggestion: HistoricalMetadataSuggestion) => void;
      onError?: (message: string) => void;
    }
  | {
      type: "import_historical_document";
      documentType: PlanDocumentType;
      areaId?: string | null;
      period: string;
      rawText: string;
      source?: string | null;
      note?: string | null;
      title?: string | null;
      classification?: Record<string, unknown> | null;
      onSuccess?: () => void;
      onError?: (message: string) => void;
    }
  | { type: "send_session_message"; sessionId: string; text: string }
  | { type: "confirm_session_proposal"; sessionId: string }
  | { type: "abandon_session"; sessionId: string }
  | { type: "add_evidence"; evidence: Evidence }
  | { type: "add_objective"; objective: Objective; keyActions?: KeyAction[] }
  | { type: "update_objective"; objective: Objective }
  | { type: "update_key_action"; keyAction: KeyAction }
  | {
      type: "upsert_kpi_definition";
      kpiId: string;
      annualTarget?: number | null;
      openingBalance?: number | null;
      onSuccess?: () => void;
      onError?: (message: string) => void;
    }
  | {
      type: "upsert_kpi_month";
      kpiId: string;
      year: number;
      values: Array<{
        month: number;
        targetValue?: number | null;
        targetStage?: string | null;
        actualValue?: number | null;
        secondaryActual?: number | null;
        note?: string | null;
      }>;
      onSuccess?: () => void;
      onError?: (message: string) => void;
    }
  | { type: "update_strategic_plan"; plan: StrategicPlan }
  | { type: "upsert_area_plan"; plan: AreaPlan }
  | {
      type: "upsert_ai_settings";
      provider: AiProvider;
      model: string;
      apiKey?: string;
      inputTokenPriceUsdPerMillion: number;
      outputTokenPriceUsdPerMillion: number;
      pricingSource?: string;
    }
  | { type: "upsert_ai_provider_key"; provider: AiProvider; apiKey: string }
  | { type: "upsert_ai_function_settings"; function: AiFunction; provider: AiProvider; model: string }
  | {
      type: "upsert_whatsapp_settings";
      instanceUrl: string;
      instanceName: string;
      connectedNumber: string;
      apiKey?: string;
      webhookSecret?: string;
      enabled: boolean;
    };

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  oracleMode: OracleMode;
}

interface AppContextValue {
  state: AppState;
  dispatch: (action: AppAction) => void;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  passwordRecoveryActive: boolean;
  updateProfile: (profile: { fullName: string; phone: string | null }) => Promise<void>;
  refresh: () => void;
  saveAiProviderKey: (provider: AiProvider, apiKey: string) => Promise<AiSettingsSaveResult>;
  saveAiFunctionSetting: (fn: AiFunction, provider: AiProvider, model: string) => Promise<AiSettingsSaveResult>;
  testAiProviderKey: (provider: AiProvider) => Promise<AiSettingsSaveResult>;
  testAiFunction: (fn: AiFunction, provider: AiProvider, model: string) => Promise<AiSettingsSaveResult>;
  saveOrgTone: (tone: Pick<OrgTone, "preset" | "acidity" | "drive" | "customNote">) => Promise<OrgTone>;
  suggestKpiSpreadsheet: (input: KpiImportInput) => Promise<KpiSpreadsheetSuggestion>;
  applyKpiSpreadsheetSuggestion: (suggestion: KpiSpreadsheetSuggestion, source: { fileName: string; kind: KpiImportKind }) => Promise<number>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const INITIAL_UI: UiState = {
  sidebarCollapsed: false,
  sidebarWidth: 240,
  oracleMode: "minimized",
};

const EMPTY_STATE: AppState = {
  sessionUserId: null,
  organizations: [],
  activeOrgId: null,
  organization: null,
  memberships: [],
  currentMembership: null,
  currentProfile: null,
  aiSettings: null,
  aiFunctionSettings: [],
  aiProviderKeyStatuses: [],
  aiUsageLogs: [],
  orgTone: null,
  whatsappSettings: null,
  areas: [],
  archivedAreas: [],
  strategicPlan: null,
  areaPlans: [],
  objectives: [],
  keyActions: [],
  evidences: [],
  chatMessages: [],
  checkIns: [],
  planningSessions: [],
  planDocuments: [],
  executiveKpis: [],
  kpiValues: [],
  activeSession: null,
  loading: true,
  ready: false,
  ui: INITIAL_UI,
};

function uiReducer(state: UiState, action: AppAction): UiState {
  switch (action.type) {
    case "toggle_sidebar":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case "set_sidebar_width":
      return {
        ...state,
        sidebarWidth: Math.max(188, Math.min(320, action.width)),
        sidebarCollapsed: false,
      };
    case "set_oracle_mode":
      return { ...state, oracleMode: action.mode };
    default:
      return state;
  }
}

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase não configurado");
  }
  return supabase;
}

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? undefined,
    createdBy: row.created_by ?? null,
  };
}

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    fullName: row.full_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
  };
}

function mapMembership(row: any, profiles: Profile[] = []): Membership {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    profile: profiles.find((profile) => profile.id === row.user_id) ?? null,
  };
}

function mapArea(row: any, memberships: Membership[]): Area {
  const membership = memberships.find((item) => item.id === row.coordinator_id);
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    coordinator: membership?.profile?.fullName ?? "Sem coordenador",
    coordinatorId: row.coordinator_id ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
  };
}

function mapProject(row: any): StrategicProject {
  return {
    id: row.id,
    orgId: row.org_id,
    planId: row.plan_id ?? null,
    name: row.name,
    owner: row.owner ?? "",
    deadline: row.deadline ?? null,
    status: row.status ?? "on_track",
    linkedObjectiveId: row.linked_objective_id ?? null,
  };
}

function mapStrategicPlan(row: any, projects: StrategicProject[]): StrategicPlan {
  return {
    id: row.id,
    orgId: row.org_id,
    year: row.year,
    profile: {
      sector: row.profile?.sector ?? "",
      size: row.profile?.size ?? "",
      region: row.profile?.region ?? "",
      founded: row.profile?.founded ?? "",
      mainPain: row.profile?.mainPain ?? row.profile?.main_pain ?? "",
    },
    drivers: {
      purpose: row.drivers?.purpose ?? "",
      vision: row.drivers?.vision ?? "",
      values: Array.isArray(row.drivers?.values) ? row.drivers.values : [],
    },
    swot: {
      strengths: Array.isArray(row.swot?.strengths) ? row.swot.strengths : [],
      weaknesses: Array.isArray(row.swot?.weaknesses) ? row.swot.weaknesses : [],
      opportunities: Array.isArray(row.swot?.opportunities) ? row.swot.opportunities : [],
      threats: Array.isArray(row.swot?.threats) ? row.swot.threats : [],
    },
    themes: row.themes ?? [],
    projects,
    rituals: row.rituals ?? [],
    executiveSummary: row.executive_summary ?? "",
  };
}

function mapAreaPlan(row: any): AreaPlan {
  return {
    id: row.id,
    areaId: row.area_id,
    year: row.year,
    role: {
      mission: row.role?.mission ?? "",
      contribution: Array.isArray(row.role?.contribution) ? row.role.contribution : [],
    },
    linkedStrategicObjectiveIds: row.linked_strategic_objective_ids ?? [],
    diagnosis: {
      strengths: Array.isArray(row.diagnosis?.strengths) ? row.diagnosis.strengths : [],
      weaknesses: Array.isArray(row.diagnosis?.weaknesses) ? row.diagnosis.weaknesses : [],
    },
    mainAnnualObjectiveId: row.main_annual_objective_id ?? null,
    learningFocus: {
      q1: Array.isArray(row.learning_focus?.q1) ? row.learning_focus.q1 : [],
      q2: Array.isArray(row.learning_focus?.q2) ? row.learning_focus.q2 : [],
      q3: Array.isArray(row.learning_focus?.q3) ? row.learning_focus.q3 : [],
      q4: Array.isArray(row.learning_focus?.q4) ? row.learning_focus.q4 : [],
    },
  };
}

function mapObjective(row: any): Objective {
  return {
    id: row.id,
    orgId: row.org_id,
    areaId: row.area_id ?? null,
    level: row.level,
    type: row.type,
    title: row.title,
    result: row.result ?? "",
    metric: row.metric ?? undefined,
    target: row.target ?? undefined,
    current: row.current ?? undefined,
    trend: row.trend ?? undefined,
    deadline: row.deadline ?? null,
    owner: row.owner ?? "",
    evidencePlan: row.evidence_plan ?? "",
    status: row.status,
    progress: row.progress ?? 0,
    deliverables: row.deliverables ?? [],
    parentId: row.parent_id ?? null,
    period: row.period,
  };
}

function mapKeyAction(row: any): KeyAction {
  return {
    id: row.id,
    orgId: row.org_id,
    objectiveId: row.objective_id,
    description: row.description,
    completionCriterion: row.completion_criterion ?? "",
    deadline: row.deadline ?? null,
    owner: row.owner ?? "",
    status: row.status ?? "on_track",
  };
}

function mapEvidence(row: any): Evidence {
  return {
    id: row.id,
    orgId: row.org_id,
    objectiveId: row.objective_id,
    text: row.text,
    date: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

function mapChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    orgId: row.org_id,
    areaId: row.area_id ?? null,
    userId: row.user_id ?? null,
    conversationId: row.conversation_id ?? null,
    author: row.author,
    text: row.text,
    channel: row.channel ?? "web",
    createdAt: row.created_at,
  };
}

function mapPlanningSession(row: any): PlanningSession {
  return {
    id: row.id,
    orgId: row.org_id,
    areaId: row.area_id ?? null,
    userId: row.user_id,
    conversationId: row.conversation_id ?? null,
    type: row.type,
    period: row.period,
    phase: row.phase,
    state: row.state ?? {},
    pendingProposal: row.pending_proposal ?? null,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  };
}

function mapPlanDocument(row: any): PlanDocument {
  return {
    id: row.id,
    orgId: row.org_id,
    areaId: row.area_id ?? null,
    sessionId: row.session_id ?? null,
    type: row.type,
    origin: row.origin ?? "session",
    period: row.period,
    title: row.title,
    content: row.content ?? {},
    version: Number(row.version ?? 1),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function mapLadderStage(item: any): LadderStage | null {
  if (!item || typeof item !== "object") return null;
  const key = typeof item.key === "string" ? item.key : "";
  const label = typeof item.label === "string" ? item.label : key;
  const order = Number(item.order ?? 0);
  if (!key) return null;
  return { key, label, order: Number.isFinite(order) ? order : 0 };
}

function mapExecutiveKpi(row: any): ExecutiveKpi {
  return {
    id: row.id,
    orgId: row.org_id,
    key: row.kpi_key,
    label: row.label,
    unit: row.unit,
    secondaryUnit: row.secondary_unit ?? null,
    direction: row.direction ?? "higher_better",
    flowType: row.flow_type ?? "flow",
    isLadder: row.is_ladder ?? false,
    ladder: Array.isArray(row.ladder) ? row.ladder.map(mapLadderStage).filter(Boolean) as LadderStage[] : [],
    openingBalance: nullableNumber(row.opening_balance),
    annualTarget: nullableNumber(row.annual_target),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
  };
}

function mapKpiMonthlyValue(row: any): KpiMonthlyValue {
  return {
    id: row.id,
    orgId: row.org_id,
    kpiId: row.kpi_id,
    year: Number(row.year),
    month: Number(row.month),
    targetValue: nullableNumber(row.target_value),
    targetStage: row.target_stage ?? null,
    actualValue: nullableNumber(row.actual_value),
    secondaryActual: nullableNumber(row.secondary_actual),
    note: row.note ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at,
  };
}

function mapAiSettings(row: any): AiSettings {
  return {
    orgId: row.org_id,
    provider: row.provider,
    model: row.model,
    hasKey: row.has_key,
    keyPreview: row.key_preview ?? null,
    inputTokenPriceUsdPerMillion: Number(row.input_token_price_usd_per_million ?? 0),
    outputTokenPriceUsdPerMillion: Number(row.output_token_price_usd_per_million ?? 0),
    pricingSource: row.pricing_source ?? null,
  };
}

function mapAiFunctionSetting(row: any): AiFunctionSetting {
  return {
    orgId: row.org_id,
    function: row.function,
    provider: row.provider,
    model: row.model,
    lastStatus: row.last_status ?? null,
    lastStatusDetail: row.last_status_detail ?? null,
    lastStatusSource: row.last_status_source ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    updatedAt: row.updated_at,
  };
}

function mapAiProviderKeyStatus(row: any): AiProviderKeyStatus {
  return {
    orgId: row.org_id,
    provider: row.provider,
    hasKey: row.has_key ?? false,
    keyPreview: row.key_preview ?? null,
    lastStatus: row.last_status ?? null,
    lastStatusDetail: row.last_status_detail ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    updatedAt: row.updated_at,
  };
}

function mapAiUsageLog(row: any): AiUsageLog {
  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    model: row.model,
    channel: row.channel ?? "web",
    promptTokens: Number(row.prompt_tokens ?? 0),
    completionTokens: Number(row.completion_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    inputTokenPriceUsdPerMillion: Number(row.input_token_price_usd_per_million ?? 0),
    outputTokenPriceUsdPerMillion: Number(row.output_token_price_usd_per_million ?? 0),
    inputCostUsd: Number(row.input_cost_usd ?? 0),
    outputCostUsd: Number(row.output_cost_usd ?? 0),
    totalCostUsd: Number(row.total_cost_usd ?? 0),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapOrgTone(row: any): OrgTone {
  return {
    orgId: row.org_id,
    preset: row.preset,
    acidity: Number(row.axis_acidity ?? 0),
    drive: Number(row.axis_drive ?? 0),
    customNote: row.custom_note ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapWhatsAppSettings(row: any): WhatsAppSettings {
  return {
    orgId: row.org_id,
    instanceUrl: row.instance_url ?? null,
    instanceName: row.instance_name ?? null,
    connectedNumber: row.connected_number ?? null,
    enabled: row.enabled ?? false,
    hasApiKey: row.has_api_key ?? false,
    keyPreview: row.key_preview ?? null,
    hasWebhookSecret: row.has_webhook_secret ?? false,
    webhookSecretPreview: row.webhook_secret_preview ?? null,
  };
}

function mapCheckIn(row: any): CheckIn {
  return {
    id: row.id,
    orgId: row.org_id,
    areaId: row.area_id ?? null,
    period: row.period,
    summary: row.summary ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

function toObjectiveInsert(objective: Objective, orgId: string) {
  return {
    id: objective.id.startsWith("draft") ? undefined : objective.id,
    org_id: orgId,
    area_id: objective.areaId,
    level: objective.level,
    type: objective.type,
    title: objective.title,
    result: objective.result,
    metric: objective.metric ?? null,
    target: objective.target ?? null,
    current: objective.current ?? null,
    trend: objective.trend ?? null,
    deadline: objective.deadline,
    owner: objective.owner,
    evidence_plan: objective.evidencePlan,
    status: objective.status,
    progress: objective.progress ?? 0,
    deliverables: objective.deliverables ?? [],
    parent_id: objective.parentId,
    period: objective.period,
  };
}

function toKeyActionInsert(keyAction: KeyAction, orgId: string) {
  return {
    id: keyAction.id,
    org_id: orgId,
    objective_id: keyAction.objectiveId,
    description: keyAction.description,
    completion_criterion: keyAction.completionCriterion,
    deadline: keyAction.deadline,
    owner: keyAction.owner,
    status: keyAction.status ?? "on_track",
  };
}

function defaultExecutiveKpiRows(orgId: string) {
  return [
    {
      org_id: orgId,
      kpi_key: "revenue",
      label: "Faturamento",
      unit: "currency",
      secondary_unit: null,
      direction: "higher_better",
      flow_type: "flow",
      is_ladder: false,
      ladder: [],
      sort_order: 10,
    },
    {
      org_id: orgId,
      kpi_key: "operating_margin",
      label: "Margem operacional",
      unit: "percent",
      secondary_unit: null,
      direction: "higher_better",
      flow_type: "flow",
      is_ladder: false,
      ladder: [],
      sort_order: 20,
    },
    {
      org_id: orgId,
      kpi_key: "production",
      label: "Produção",
      unit: "currency",
      secondary_unit: "count",
      direction: "higher_better",
      flow_type: "flow",
      is_ladder: false,
      ladder: [],
      sort_order: 30,
    },
    {
      org_id: orgId,
      kpi_key: "cash",
      label: "Caixa",
      unit: "currency",
      secondary_unit: null,
      direction: "higher_better",
      flow_type: "stock",
      is_ladder: true,
      ladder: [
        { key: "stop_bleed", label: "Estancar sangria", order: 1 },
        { key: "operational_zero", label: "Operacional >= 0", order: 2 },
        { key: "service_debt", label: "Aguentar a dívida", order: 3 },
        { key: "surplus", label: "Sobrar", order: 4 },
      ],
      sort_order: 40,
    },
  ];
}

async function callEdgeFunction<TBody extends Record<string, unknown>>(name: string, body: TBody) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let payload: { error?: unknown } | null = null;
      try {
        payload = await response.clone().json() as { error?: unknown };
      } catch {
        payload = null;
      }
      if (typeof payload?.error === "string" && payload.error.trim()) throw new Error(payload.error);
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ui, uiDispatch] = useReducer(uiReducer, INITIAL_UI);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => window.localStorage.getItem("oraculo.activeOrgId"));
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryActive(true);
        window.history.replaceState(null, "", "/redefinir-senha");
      }
      setSession(nextSession);
      queryClient.clear();
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const rawMembershipsQuery = useQuery({
    queryKey: ["memberships", userId],
    enabled: Boolean(supabase && userId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("memberships")
        .select("id, org_id, user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rawMemberships = rawMembershipsQuery.data ?? [];
  const orgIds = useMemo(() => [...new Set(rawMemberships.map((item: any) => item.org_id))], [rawMemberships]);
  const profileIds = useMemo(() => [...new Set(rawMemberships.map((item: any) => item.user_id))], [rawMemberships]);

  const currentProfileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(supabase && userId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("profiles").select("id, full_name, email, phone").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data) : null;
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles", profileIds],
    enabled: Boolean(supabase && profileIds.length),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("profiles").select("id, full_name, email").in("id", profileIds);
      if (error) throw error;
      return (data ?? []).map(mapProfile);
    },
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations", orgIds],
    enabled: Boolean(supabase && orgIds.length),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("organizations").select("id, name, subtitle, created_by").in("id", orgIds);
      if (error) throw error;
      return (data ?? []).map(mapOrganization);
    },
  });

  const profiles = profilesQuery.data ?? [];
  const memberships = useMemo(() => rawMemberships.map((row: any) => mapMembership(row, profiles)), [profiles, rawMemberships]);
  const organizations = organizationsQuery.data ?? [];

  useEffect(() => {
    if (!organizations.length) {
      setActiveOrgId(null);
      window.localStorage.removeItem("oraculo.activeOrgId");
      return;
    }

    if (!activeOrgId || !organizations.some((organization) => organization.id === activeOrgId)) {
      setActiveOrgId(organizations[0].id);
      window.localStorage.setItem("oraculo.activeOrgId", organizations[0].id);
    }
  }, [activeOrgId, organizations]);

  const orgId = activeOrgId && organizations.some((organization) => organization.id === activeOrgId) ? activeOrgId : null;

  const organization = useMemo(
    () => organizations.find((item) => item.id === orgId) ?? null,
    [orgId, organizations],
  );

  const orgMemberships = useMemo(
    () => memberships.filter((membership) => membership.orgId === orgId),
    [memberships, orgId],
  );

  const currentMembership = useMemo(
    () => orgMemberships.find((membership) => membership.userId === userId) ?? null,
    [orgMemberships, userId],
  );

  const areasQuery = useQuery({
    queryKey: ["areas", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("areas").select("*").eq("org_id", orgId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const areaPlansQuery = useQuery({
    queryKey: ["area_plans", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("area_plans").select("*").eq("org_id", orgId).order("year", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapAreaPlan);
    },
  });

  const objectivesQuery = useQuery({
    queryKey: ["objectives", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("objectives").select("*").eq("org_id", orgId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapObjective);
    },
  });

  const strategicProjectsQuery = useQuery({
    queryKey: ["strategic_projects", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("strategic_projects").select("*").eq("org_id", orgId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapProject);
    },
  });

  const strategicPlanQuery = useQuery({
    queryKey: ["strategic_plan", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("strategic_plans")
        .select("*")
        .eq("org_id", orgId)
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const keyActionsQuery = useQuery({
    queryKey: ["key_actions", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("key_actions").select("*").eq("org_id", orgId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapKeyAction);
    },
  });

  const evidencesQuery = useQuery({
    queryKey: ["evidences", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("evidences").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapEvidence);
    },
  });

  const chatMessagesQuery = useQuery({
    queryKey: ["chat_messages", orgId],
    enabled: Boolean(supabase && orgId && userId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("chat_messages")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("channel", "web")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapChatMessage);
    },
  });

  const planningSessionsQuery = useQuery({
    queryKey: ["planning_sessions", orgId, userId],
    enabled: Boolean(supabase && orgId && userId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("planning_sessions")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPlanningSession);
    },
  });

  const planDocumentsQuery = useQuery({
    queryKey: ["plan_documents", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("plan_documents")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPlanDocument);
    },
  });

  const executiveKpisQuery = useQuery({
    queryKey: ["executive_kpis", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("executive_kpis").select("*").eq("org_id", orgId).order("sort_order");
      if (error) throw error;
      return (data ?? []).map(mapExecutiveKpi);
    },
  });

  const kpiValuesQuery = useQuery({
    queryKey: ["kpi_monthly_values", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("kpi_monthly_values")
        .select("*")
        .eq("org_id", orgId)
        .order("year", { ascending: false })
        .order("month", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapKpiMonthlyValue);
    },
  });

  const aiSettingsQuery = useQuery({
    queryKey: ["ai_settings", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data ? mapAiSettings(data) : null;
    },
  });

  const aiFunctionSettingsQuery = useQuery({
    queryKey: ["ai_function_settings", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("ai_function_settings").select("*").eq("org_id", orgId).order("function");
      if (error) throw error;
      return (data ?? []).map(mapAiFunctionSetting);
    },
  });

  const aiProviderKeyStatusesQuery = useQuery({
    queryKey: ["ai_provider_key_status", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("ai_provider_key_status").select("*").eq("org_id", orgId).order("provider");
      if (error) throw error;
      return (data ?? []).map(mapAiProviderKeyStatus);
    },
  });

  const aiUsageLogsQuery = useQuery({
    queryKey: ["ai_usage_logs", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("ai_usage_logs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(mapAiUsageLog);
    },
  });

  const orgToneQuery = useQuery({
    queryKey: ["org_ai_tone", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("org_ai_tone").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data
        ? mapOrgTone(data)
        : {
            orgId: orgId as string,
            preset: "equilibrado" as const,
            acidity: 0,
            drive: 0,
            customNote: null,
            updatedBy: null,
            updatedAt: null,
          };
    },
  });

  const whatsappSettingsQuery = useQuery({
    queryKey: ["whatsapp_settings", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("whatsapp_settings").select("*").eq("org_id", orgId).maybeSingle();
      if (error) throw error;
      return data ? mapWhatsAppSettings(data) : null;
    },
  });

  const checkInsQuery = useQuery({
    queryKey: ["check_ins", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("check_ins").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapCheckIn);
    },
  });

  const allAreas = useMemo(
    () => (areasQuery.data ?? []).map((row: any) => mapArea(row, orgMemberships)),
    [areasQuery.data, orgMemberships],
  );

  const areas = useMemo(() => allAreas.filter((area) => !area.archivedAt), [allAreas]);
  const archivedAreas = useMemo(() => allAreas.filter((area) => Boolean(area.archivedAt)), [allAreas]);
  const activeAreaIds = useMemo(() => new Set(areas.map((area) => area.id)), [areas]);
  const activeObjectives = useMemo(
    () => (objectivesQuery.data ?? []).filter((objective) => !objective.areaId || activeAreaIds.has(objective.areaId)),
    [activeAreaIds, objectivesQuery.data],
  );
  const activeObjectiveIds = useMemo(() => new Set(activeObjectives.map((objective) => objective.id)), [activeObjectives]);
  const activePlanningSessions = useMemo(
    () => (planningSessionsQuery.data ?? []).filter((planningSession) => !planningSession.areaId || activeAreaIds.has(planningSession.areaId)),
    [activeAreaIds, planningSessionsQuery.data],
  );

  const strategicPlan = useMemo(() => {
    if (!strategicPlanQuery.data) return null;
    return mapStrategicPlan(strategicPlanQuery.data, strategicProjectsQuery.data ?? []);
  }, [strategicPlanQuery.data, strategicProjectsQuery.data]);

  const invalidateOrg = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["memberships"] });
    queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    queryClient.invalidateQueries({ queryKey: ["profiles"] });
    if (!orgId) return;
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
    queryClient.invalidateQueries({ queryKey: ["areas", orgId] });
    queryClient.invalidateQueries({ queryKey: ["area_plans", orgId] });
    queryClient.invalidateQueries({ queryKey: ["objectives", orgId] });
    queryClient.invalidateQueries({ queryKey: ["strategic_projects", orgId] });
    queryClient.invalidateQueries({ queryKey: ["strategic_plan", orgId] });
    queryClient.invalidateQueries({ queryKey: ["key_actions", orgId] });
    queryClient.invalidateQueries({ queryKey: ["evidences", orgId] });
    queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
    queryClient.invalidateQueries({ queryKey: ["planning_sessions", orgId, userId] });
    queryClient.invalidateQueries({ queryKey: ["plan_documents", orgId] });
    queryClient.invalidateQueries({ queryKey: ["executive_kpis", orgId] });
    queryClient.invalidateQueries({ queryKey: ["kpi_monthly_values", orgId] });
    queryClient.invalidateQueries({ queryKey: ["ai_settings", orgId] });
    queryClient.invalidateQueries({ queryKey: ["ai_function_settings", orgId] });
    queryClient.invalidateQueries({ queryKey: ["ai_provider_key_status", orgId] });
    queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
    queryClient.invalidateQueries({ queryKey: ["org_ai_tone", orgId] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp_settings", orgId] });
    queryClient.invalidateQueries({ queryKey: ["check_ins", orgId] });
  }, [orgId, queryClient, userId]);

  useEffect(() => {
    if (!supabase || !orgId) return;
    const client = supabase;

    const channel = client
      .channel(`oraculo-org-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "areas", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "objectives", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "key_actions", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "evidences", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_usage_logs", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_function_settings", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_provider_key_status", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_ai_tone", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_sessions", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_documents", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "executive_kpis", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "kpi_monthly_values", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [invalidateOrg, orgId]);

  const state = useMemo<AppState>(() => {
    const loading =
      authLoading ||
      rawMembershipsQuery.isLoading ||
      currentProfileQuery.isLoading ||
      profilesQuery.isLoading ||
      organizationsQuery.isLoading ||
      areasQuery.isLoading ||
      areaPlansQuery.isLoading ||
      objectivesQuery.isLoading ||
      strategicProjectsQuery.isLoading ||
      strategicPlanQuery.isLoading ||
      keyActionsQuery.isLoading ||
      evidencesQuery.isLoading ||
      chatMessagesQuery.isLoading ||
      planningSessionsQuery.isLoading ||
      planDocumentsQuery.isLoading ||
      executiveKpisQuery.isLoading ||
      kpiValuesQuery.isLoading ||
      aiSettingsQuery.isLoading ||
      aiFunctionSettingsQuery.isLoading ||
      aiProviderKeyStatusesQuery.isLoading ||
      aiUsageLogsQuery.isLoading ||
      orgToneQuery.isLoading ||
      whatsappSettingsQuery.isLoading ||
      checkInsQuery.isLoading;

    return {
      ...EMPTY_STATE,
      sessionUserId: userId,
      organizations,
      activeOrgId: orgId,
      organization,
      memberships: orgMemberships,
      currentMembership,
      currentProfile: currentProfileQuery.data ?? currentMembership?.profile ?? null,
      aiSettings: aiSettingsQuery.data ?? null,
      aiFunctionSettings: aiFunctionSettingsQuery.data ?? [],
      aiProviderKeyStatuses: aiProviderKeyStatusesQuery.data ?? [],
      aiUsageLogs: aiUsageLogsQuery.data ?? [],
      orgTone: orgToneQuery.data ?? null,
      whatsappSettings: whatsappSettingsQuery.data ?? null,
      areas,
      archivedAreas,
      strategicPlan,
      areaPlans: (areaPlansQuery.data ?? []).filter((plan) => activeAreaIds.has(plan.areaId)),
      objectives: activeObjectives,
      keyActions: (keyActionsQuery.data ?? []).filter((keyAction) => activeObjectiveIds.has(keyAction.objectiveId)),
      evidences: (evidencesQuery.data ?? []).filter((evidence) => activeObjectiveIds.has(evidence.objectiveId)),
      chatMessages: chatMessagesQuery.data ?? [],
      checkIns: (checkInsQuery.data ?? []).filter((checkIn) => !checkIn.areaId || activeAreaIds.has(checkIn.areaId)),
      planningSessions: activePlanningSessions,
      planDocuments: planDocumentsQuery.data ?? [],
      executiveKpis: executiveKpisQuery.data ?? [],
      kpiValues: kpiValuesQuery.data ?? [],
      activeSession: activePlanningSessions.find((planningSession) => planningSession.pendingProposal) ?? activePlanningSessions[0] ?? null,
      loading,
      ready: Boolean(session && organization),
      ui,
    };
  }, [
    aiFunctionSettingsQuery.data,
    aiFunctionSettingsQuery.isLoading,
    aiProviderKeyStatusesQuery.data,
    aiProviderKeyStatusesQuery.isLoading,
    aiSettingsQuery.data,
    aiSettingsQuery.isLoading,
    aiUsageLogsQuery.data,
    aiUsageLogsQuery.isLoading,
    orgToneQuery.data,
    orgToneQuery.isLoading,
    activeAreaIds,
    activeObjectiveIds,
    activeObjectives,
    activePlanningSessions,
    areaPlansQuery.data,
    areaPlansQuery.isLoading,
    areas,
    archivedAreas,
    areasQuery.isLoading,
    authLoading,
    chatMessagesQuery.data,
    chatMessagesQuery.isLoading,
    checkInsQuery.data,
    checkInsQuery.isLoading,
    currentMembership,
    currentProfileQuery.data,
    currentProfileQuery.isLoading,
    evidencesQuery.data,
    evidencesQuery.isLoading,
    executiveKpisQuery.data,
    executiveKpisQuery.isLoading,
    keyActionsQuery.data,
    keyActionsQuery.isLoading,
    kpiValuesQuery.data,
    kpiValuesQuery.isLoading,
    objectivesQuery.data,
    objectivesQuery.isLoading,
    orgId,
    orgMemberships,
    organization,
    organizations,
    organizationsQuery.isLoading,
    profilesQuery.isLoading,
    planningSessionsQuery.data,
    planningSessionsQuery.isLoading,
    planDocumentsQuery.data,
    planDocumentsQuery.isLoading,
    rawMembershipsQuery.isLoading,
    session,
    strategicPlan,
    strategicPlanQuery.isLoading,
    strategicProjectsQuery.isLoading,
    ui,
    userId,
    whatsappSettingsQuery.data,
    whatsappSettingsQuery.isLoading,
  ]);

  const dispatch = useCallback(
    (action: AppAction) => {
      if (["toggle_sidebar", "set_sidebar_width", "set_oracle_mode"].includes(action.type)) {
        uiDispatch(action);
        return;
      }

      if (action.type === "set_active_org") {
        setActiveOrgId(action.orgId);
        window.localStorage.setItem("oraculo.activeOrgId", action.orgId);
        return;
      }

      const client = requireClient();

      if (action.type === "create_organization") {
        void (async () => {
          if (!userId) return;
          const { data: organizationRow, error: organizationError } = await client
            .from("organizations")
            .insert({ name: action.name, subtitle: action.subtitle || null, created_by: userId })
            .select("id")
            .single();
          if (organizationError) throw organizationError;
          const newOrgId = organizationRow.id as string;
          const { error: membershipError } = await client.from("memberships").insert({ org_id: newOrgId, user_id: userId, role: "owner" });
          if (membershipError) throw membershipError;
          const { error: aiSettingsError } = await client.from("ai_settings").insert({ org_id: newOrgId });
          if (aiSettingsError) throw aiSettingsError;
          const { error: kpiSeedError } = await client.from("executive_kpis").insert(defaultExecutiveKpiRows(newOrgId));
          if (kpiSeedError) throw kpiSeedError;
          setActiveOrgId(newOrgId);
          window.localStorage.setItem("oraculo.activeOrgId", newOrgId);
          invalidateOrg();
        })();
        return;
      }

      if (!orgId) return;

      if (action.type === "create_area") {
        void client
          .from("areas")
          .insert({ org_id: orgId, name: action.name, coordinator_id: action.coordinatorId || null })
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "update_area") {
        void client
          .from("areas")
          .update({ name: action.name, coordinator_id: action.coordinatorId || null })
          .eq("id", action.areaId)
          .eq("org_id", orgId)
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "archive_area") {
        void (async () => {
          const { data, error } = await client
            .from("areas")
            .update({ archived_at: new Date().toISOString(), archived_by: userId })
            .eq("id", action.areaId)
            .eq("org_id", orgId)
            .is("archived_at", null)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Área não encontrada ou já arquivada.");
          invalidateOrg();
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível arquivar a área.");
        });
        return;
      }

      if (action.type === "restore_area") {
        void (async () => {
          const { data, error } = await client
            .from("areas")
            .update({ archived_at: null, archived_by: null })
            .eq("id", action.areaId)
            .eq("org_id", orgId)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Área arquivada não encontrada.");
          invalidateOrg();
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível restaurar a área.");
        });
        return;
      }

      if (action.type === "create_member") {
        void callEdgeFunction("invite-member", {
          orgId,
          email: action.email,
          fullName: action.fullName ?? "",
          phone: action.phone ?? null,
          role: action.role,
          areaId: action.areaId ?? null,
          redirectTo: window.location.origin,
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "set_member_role") {
        void callEdgeFunction("set-member-role", {
          orgId,
          membershipId: action.membershipId,
          role: action.role,
        })
          .then(() => {
            invalidateOrg();
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível alterar o papel.");
          });
        return;
      }

      if (action.type === "remove_member") {
        void callEdgeFunction("remove-member", {
          orgId,
          membershipId: action.membershipId,
          areaReassignments: action.areaReassignments,
        })
          .then(() => {
            invalidateOrg();
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível remover a pessoa.");
          });
        return;
      }

      if (action.type === "add_chat_message") {
        void client
          .from("chat_messages")
          .insert({
            org_id: orgId,
            area_id: action.message.areaId ?? null,
            user_id: userId,
            author: action.message.author,
            text: action.message.text,
            channel: action.message.channel ?? "web",
          })
          .then(({ error }) => {
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
          });
        return;
      }

      if (action.type === "send_oracle_message") {
        void callEdgeFunction("oracle-chat", {
          orgId,
          areaId: action.areaId ?? null,
          message: action.text,
          context: action.context ?? "chat",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
          queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
        });
        return;
      }

      if (action.type === "start_session") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "start",
          orgId,
          areaId: action.areaId ?? null,
          type: action.sessionType,
          period: action.period,
          channel: "web",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["planning_sessions", orgId, userId] });
          queryClient.invalidateQueries({ queryKey: ["plan_documents", orgId] });
          queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
        });
        return;
      }

      if (action.type === "import_ready_strategic_plan") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "import_ready_plan",
          orgId,
          period: action.period,
          planText: action.text,
          fileName: action.fileName ?? null,
          channel: "web",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["planning_sessions", orgId, userId] });
          queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
          queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
        });
        return;
      }

      if (action.type === "import_ready_quarterly_plan") {
        uiDispatch({ type: "set_oracle_mode", mode: "normal" });
        void callEdgeFunction("oracle-session", {
          action: "import_ready_quarterly_plan",
          orgId,
          areaId: action.areaId,
          period: action.period,
          planText: action.text,
          fileName: action.fileName ?? null,
          channel: "web",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["planning_sessions", orgId, userId] });
          queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
          queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
        });
        return;
      }

      if (action.type === "suggest_historical_metadata") {
        void callEdgeFunction("suggest-historical-metadata", {
          orgId,
          rawText: action.rawText,
          fileName: action.fileName ?? null,
        })
          .then((result) => {
            queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
            action.onSuccess?.((result as { suggestion: HistoricalMetadataSuggestion }).suggestion);
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível interpretar o histórico.");
          });
        return;
      }

      if (action.type === "import_historical_document") {
        void callEdgeFunction("save-historical-document", {
          orgId,
          areaId: action.areaId ?? null,
          documentType: action.documentType,
          period: action.period,
          rawText: action.rawText,
          source: action.source ?? null,
          note: action.note ?? null,
          title: action.title ?? null,
          classification: action.classification ?? null,
        })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["plan_documents", orgId] });
            action.onSuccess?.();
          })
          .catch((error) => {
            action.onError?.(error instanceof Error ? error.message : "Não foi possível importar o histórico.");
          });
        return;
      }

      if (action.type === "send_session_message") {
        void callEdgeFunction("oracle-session", {
          action: "message",
          sessionId: action.sessionId,
          message: action.text,
          channel: "web",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["planning_sessions", orgId, userId] });
          queryClient.invalidateQueries({ queryKey: ["chat_messages", orgId] });
          queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
        });
        return;
      }

      if (action.type === "confirm_session_proposal") {
        void callEdgeFunction("oracle-session", {
          action: "confirm",
          sessionId: action.sessionId,
          channel: "web",
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "abandon_session") {
        void callEdgeFunction("oracle-session", {
          action: "abandon",
          sessionId: action.sessionId,
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "add_evidence") {
        void client
          .from("evidences")
          .insert({
            org_id: orgId,
            objective_id: action.evidence.objectiveId,
            text: action.evidence.text,
            created_by: userId,
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "add_objective") {
        void (async () => {
          const objectiveRow = toObjectiveInsert(action.objective, orgId);
          const { data: inserted, error } = await client.from("objectives").insert(objectiveRow).select("id").single();
          if (error) throw error;
          const objectiveId = inserted.id as string;
          const keyActions = (action.keyActions ?? []).map((keyAction) =>
            toKeyActionInsert({ ...keyAction, objectiveId }, orgId),
          );
          if (keyActions.length) {
            const { error: keyActionsError } = await client.from("key_actions").insert(keyActions);
            if (keyActionsError) throw keyActionsError;
          }
          invalidateOrg();
        })();
        return;
      }

      if (action.type === "update_objective") {
        void client
          .from("objectives")
          .update(toObjectiveInsert(action.objective, orgId))
          .eq("id", action.objective.id)
          .eq("org_id", orgId)
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "update_key_action") {
        void client
          .from("key_actions")
          .update(toKeyActionInsert(action.keyAction, orgId))
          .eq("id", action.keyAction.id)
          .eq("org_id", orgId)
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "upsert_kpi_definition") {
        void (async () => {
          const { error } = await client
            .from("executive_kpis")
            .update({
              annual_target: action.annualTarget ?? null,
              opening_balance: action.openingBalance ?? null,
            })
            .eq("id", action.kpiId)
            .eq("org_id", orgId);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ["executive_kpis", orgId] });
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível salvar o KPI.");
        });
        return;
      }

      if (action.type === "upsert_kpi_month") {
        void (async () => {
          const rows = action.values.map((value) => ({
            org_id: orgId,
            kpi_id: action.kpiId,
            year: action.year,
            month: value.month,
            target_value: value.targetValue ?? null,
            target_stage: value.targetStage ?? null,
            actual_value: value.actualValue ?? null,
            secondary_actual: value.secondaryActual ?? null,
            note: value.note ?? null,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await client.from("kpi_monthly_values").upsert(rows, { onConflict: "kpi_id,year,month" });
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ["kpi_monthly_values", orgId] });
          action.onSuccess?.();
        })().catch((error) => {
          action.onError?.(error instanceof Error ? error.message : "Não foi possível salvar os lançamentos.");
        });
        return;
      }

      if (action.type === "update_strategic_plan") {
        void client
          .from("strategic_plans")
          .upsert({
            id: action.plan.id.startsWith("draft") ? undefined : action.plan.id,
            org_id: orgId,
            year: action.plan.year,
            profile: action.plan.profile,
            drivers: action.plan.drivers,
            swot: action.plan.swot,
            themes: action.plan.themes,
            rituals: action.plan.rituals,
            executive_summary: action.plan.executiveSummary,
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "upsert_area_plan") {
        void client
          .from("area_plans")
          .upsert({
            id: action.plan.id.startsWith("draft") ? undefined : action.plan.id,
            org_id: orgId,
            area_id: action.plan.areaId,
            year: action.plan.year,
            role: action.plan.role,
            linked_strategic_objective_ids: action.plan.linkedStrategicObjectiveIds,
            diagnosis: action.plan.diagnosis,
            main_annual_objective_id: action.plan.mainAnnualObjectiveId,
            learning_focus: action.plan.learningFocus,
          })
          .then(({ error }) => {
            if (error) throw error;
            invalidateOrg();
          });
        return;
      }

      if (action.type === "upsert_ai_settings") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          provider: action.provider,
          model: action.model,
          apiKey: action.apiKey ?? "",
          inputTokenPriceUsdPerMillion: action.inputTokenPriceUsdPerMillion,
          outputTokenPriceUsdPerMillion: action.outputTokenPriceUsdPerMillion,
          pricingSource: action.pricingSource ?? "",
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "upsert_ai_provider_key") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          provider: action.provider,
          apiKey: action.apiKey,
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "upsert_ai_function_settings") {
        void callEdgeFunction("save-ai-settings", {
          orgId,
          function: action.function,
          provider: action.provider,
          model: action.model,
        }).then(invalidateOrg);
        return;
      }

      if (action.type === "upsert_whatsapp_settings") {
        void callEdgeFunction("save-whatsapp-settings", {
          orgId,
          instanceUrl: action.instanceUrl,
          instanceName: action.instanceName,
          connectedNumber: action.connectedNumber,
          apiKey: action.apiKey ?? "",
          webhookSecret: action.webhookSecret ?? "",
          enabled: action.enabled,
        }).then(invalidateOrg);
        return;
      }

    },
    [invalidateOrg, orgId, queryClient, userId],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const client = requireClient();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const client = requireClient();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecoveryActive(false);
  }, []);

  const signOut = useCallback(async () => {
    const client = requireClient();
    await client.auth.signOut();
    setActiveOrgId(null);
    window.localStorage.removeItem("oraculo.activeOrgId");
  }, []);

  const updateProfile = useCallback(
    async (profile: { fullName: string; phone: string | null }) => {
      const client = requireClient();
      if (!userId) return;

      const { error } = await client
        .from("profiles")
        .update({
          full_name: profile.fullName.trim() || null,
          email: session?.user.email ?? null,
          phone: profile.phone,
        })
        .eq("id", userId);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    [queryClient, session?.user.email, userId],
  );

  const refresh = useCallback(() => {
    invalidateOrg();
  }, [invalidateOrg]);

  const suggestKpiSpreadsheet = useCallback(
    async (input: KpiImportInput) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction("suggest-kpi-spreadsheet", {
        orgId,
        ...input,
      }) as { suggestion: KpiSpreadsheetSuggestion };
      queryClient.invalidateQueries({ queryKey: ["ai_usage_logs", orgId] });
      return result.suggestion;
    },
    [orgId, queryClient],
  );

  const applyKpiSpreadsheetSuggestion = useCallback(
    async (suggestion: KpiSpreadsheetSuggestion, source: { fileName: string; kind: KpiImportKind }) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        suggestion: KpiSpreadsheetSuggestion;
        fileName: string;
        inputKind: KpiImportKind;
      }>("apply-kpi-import", {
        orgId,
        suggestion,
        fileName: source.fileName,
        inputKind: source.kind,
      }) as { appliedCount: number };
      queryClient.invalidateQueries({ queryKey: ["kpi_monthly_values", orgId] });
      queryClient.invalidateQueries({ queryKey: ["plan_documents", orgId] });
      return result.appliedCount;
    },
    [orgId, queryClient],
  );

  const saveAiProviderKey = useCallback(
    async (provider: AiProvider, apiKey: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        provider: AiProvider;
        apiKey: string;
      }>("save-ai-settings", {
        orgId,
        provider,
        apiKey,
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const saveAiFunctionSetting = useCallback(
    async (fn: AiFunction, provider: AiProvider, model: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        function: AiFunction;
        provider: AiProvider;
        model: string;
      }>("save-ai-settings", {
        orgId,
        function: fn,
        provider,
        model,
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const testAiProviderKey = useCallback(
    async (provider: AiProvider) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        provider: AiProvider;
        mode: string;
      }>("save-ai-settings", {
        orgId,
        provider,
        mode: "test",
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const testAiFunction = useCallback(
    async (fn: AiFunction, provider: AiProvider, model: string) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      const result = await callEdgeFunction<{
        orgId: string;
        function: AiFunction;
        provider: AiProvider;
        model: string;
        mode: string;
      }>("save-ai-settings", {
        orgId,
        function: fn,
        provider,
        model,
        mode: "test",
      }) as AiSettingsSaveResult;
      invalidateOrg();
      return result;
    },
    [invalidateOrg, orgId],
  );

  const saveOrgTone = useCallback(
    async (tone: Pick<OrgTone, "preset" | "acidity" | "drive" | "customNote">) => {
      if (!orgId) throw new Error("Empresa obrigatória");
      if (!userId) throw new Error("Sessão obrigatória");
      const client = requireClient();
      const { data, error } = await client
        .from("org_ai_tone")
        .upsert({
          org_id: orgId,
          preset: tone.preset,
          axis_acidity: Math.max(-2, Math.min(2, Math.round(tone.acidity))),
          axis_drive: Math.max(-2, Math.min(2, Math.round(tone.drive))),
          custom_note: tone.customNote?.trim().slice(0, 280) || null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "org_id" })
        .select("*")
        .single();
      if (error) throw error;
      const saved = mapOrgTone(data);
      queryClient.setQueryData(["org_ai_tone", orgId], saved);
      return saved;
    },
    [orgId, queryClient, userId],
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      session,
      signIn,
      signUp,
      signOut,
      resetPasswordForEmail,
      updatePassword,
      passwordRecoveryActive,
      updateProfile,
      refresh,
      saveAiProviderKey,
      saveAiFunctionSetting,
      testAiProviderKey,
      testAiFunction,
      saveOrgTone,
      suggestKpiSpreadsheet,
      applyKpiSpreadsheetSuggestion,
    }),
    [
      dispatch,
      passwordRecoveryActive,
      refresh,
      resetPasswordForEmail,
      saveAiFunctionSetting,
      saveAiProviderKey,
      saveOrgTone,
      session,
      signIn,
      signOut,
      signUp,
      state,
      suggestKpiSpreadsheet,
      testAiFunction,
      testAiProviderKey,
      updatePassword,
      updateProfile,
      applyKpiSpreadsheetSuggestion,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppProvider");
  }
  return context;
}
