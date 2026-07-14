import type { Session } from "@supabase/supabase-js";
import type {
  AiFunction,
  AiProvider,
  AiSettingsSaveResult,
  AppState,
  AreaPlan,
  ChatMessage,
  CompanyProfileSource,
  CompanyProfileSuggestion,
  Evidence,
  HistoricalConflict,
  HistoricalDocumentCandidate,
  HistoricalHeaderMetadata,
  HistoricalImportSuggestion,
  HistoricalMetadataSuggestion,
  HistoricalTableCandidate,
  KeyAction,
  KpiImportInput,
  KpiImportKind,
  KpiSpreadsheetSuggestion,
  MembershipRole,
  Objective,
  ObjectiveKpiSuggestion,
  OperationalEntityType,
  OracleMode,
  OrgTone,
  PlanDocumentType,
  PlanningSessionType,
  StrategicPlan,
} from "../types";

export type AppAction =
  | { type: "toggle_sidebar" }
  | { type: "set_sidebar_width"; width: number }
  | { type: "toggle_mobile_nav" }
  | { type: "open_mobile_nav" }
  | { type: "close_mobile_nav" }
  | { type: "set_oracle_mode"; mode: OracleMode }
  | { type: "set_active_org"; orgId: string }
  | { type: "create_organization"; name: string; subtitle?: string; token: string; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "create_area"; name: string; coordinatorId?: string | null }
  | { type: "update_area"; areaId: string; name: string; coordinatorId?: string | null }
  | { type: "archive_area"; areaId: string; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "restore_area"; areaId: string; onSuccess?: () => void; onError?: (message: string) => void }
  | {
      type: "create_member";
      email: string;
      fullName?: string;
      phone?: string | null;
      role: MembershipRole;
      areaId?: string | null;
      notify?: boolean;
      onSuccess?: (result?: { channel?: string; inviteLink?: string; detail?: string }) => void;
      onError?: (message: string) => void;
    }
  | { type: "set_member_role"; membershipId: string; role: Exclude<MembershipRole, "owner">; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "set_member_area"; membershipId: string; areaId: string | null; onSuccess?: (result?: { changedAreaIds?: string[] }) => void; onError?: (message: string) => void }
  | { type: "remove_member"; membershipId: string; areaReassignments: Record<string, string | null>; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "leave_organization"; reason?: string | null; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "archive_organization"; reason?: string | null; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "restore_organization"; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "delete_organization"; confirmName: string; finalConfirmation: true; reason?: string | null; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "add_chat_message"; message: ChatMessage }
  | { type: "send_oracle_message"; text: string; areaId?: string | null; context?: string }
  | { type: "start_session"; sessionType: PlanningSessionType; areaId?: string | null; period: string }
  | { type: "import_ready_strategic_plan"; period: string; text: string; fileName?: string | null }
  | { type: "import_ready_quarterly_plan"; areaId: string; period: string; text: string; fileName?: string | null }
  | {
      type: "suggest_historical_metadata";
      rawText?: string;
      fileName?: string | null;
      image?: { mimeType: "image/jpeg" | "image/png"; base64: string } | null;
      onSuccess?: (result: {
        suggestion: HistoricalMetadataSuggestion;
        extractedText?: string;
        tableExpanded?: boolean;
        importSuggestion?: HistoricalImportSuggestion;
        candidates?: HistoricalDocumentCandidate[];
        tables?: HistoricalTableCandidate[];
        conflicts?: HistoricalConflict[];
        warnings?: string[];
        headerMetadata?: HistoricalHeaderMetadata;
      }) => void;
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
      summary?: string | null;
      classification?: Record<string, unknown> | null;
      importBackup?: Record<string, unknown> | null;
      sourceMetadata?: HistoricalHeaderMetadata | null;
      documents?: Array<{
        documentType: Extract<PlanDocumentType, "strategic" | "quarterly" | "monthly">;
        areaId: string | null;
        period: string;
        rawText: string;
        source?: string | null;
        note?: string | null;
        title?: string | null;
        summary?: string | null;
        classification?: Record<string, unknown> | null;
        importBackup?: Record<string, unknown> | null;
        sourceMetadata?: HistoricalHeaderMetadata | null;
        savedCandidateId?: string | null;
      }>;
      savedCandidateId?: string | null;
      onSuccess?: (result?: { document?: { id: string }; warning?: string | null }) => void;
      onError?: (message: string) => void;
    }
  | { type: "research_company_profile"; links?: string[]; onSuccess?: (suggestion: CompanyProfileSuggestion) => void; onError?: (message: string) => void }
  | { type: "confirm_company_profile"; summary: string; sources: CompanyProfileSource[]; queries: string[]; links: string[]; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "send_session_message"; sessionId: string; text: string }
  | { type: "confirm_session_proposal"; sessionId: string }
  | { type: "abandon_session"; sessionId: string }
  | { type: "add_evidence"; evidence: Evidence }
  | { type: "add_objective"; objective: Objective; keyActions?: KeyAction[]; token: string; onSuccess?: (objectiveId: string) => void; onError?: (message: string) => void }
  | { type: "update_objective"; objective: Objective; onSuccess?: (objectiveId: string) => void; onError?: (message: string) => void }
  | { type: "suggest_objective_kpis"; objectiveId: string; onSuccess: (suggestions: ObjectiveKpiSuggestion[]) => void; onError?: (message: string) => void }
  | { type: "set_objective_kpi_links"; objectiveId: string; links: Array<{ kpiId: string; rationale?: string; confidence?: number }>; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "update_key_action"; keyAction: KeyAction }
  | { type: "set_operational_item_archived"; entityType: OperationalEntityType; entityId: string; archived: boolean; reason?: string; onSuccess?: () => void; onError?: (message: string) => void }
  | { type: "upsert_kpi_definition"; kpiId: string; annualTarget?: number | null; openingBalance?: number | null; onSuccess?: () => void; onError?: (message: string) => void }
  | {
      type: "save_kpi_editor";
      kpiId: string;
      year: number;
      expectedKpiUpdatedAt: string;
      annualTarget: number | null;
      openingBalance: number | null;
      values: Array<{ month: number; expectedUpdatedAt: string | null; targetValue?: number | null; targetStage?: string | null; actualValue?: number | null; secondaryActual?: number | null; note?: string | null }>;
      onSuccess?: () => void;
      onError?: (message: string) => void;
    }
  | { type: "update_strategic_plan"; plan: StrategicPlan }
  | { type: "upsert_area_plan"; plan: AreaPlan }
  | { type: "upsert_ai_settings"; provider: AiProvider; model: string; apiKey?: string; inputTokenPriceUsdPerMillion: number; outputTokenPriceUsdPerMillion: number; pricingSource?: string }
  | { type: "upsert_ai_provider_key"; provider: AiProvider; apiKey: string }
  | { type: "upsert_ai_function_settings"; function: AiFunction; provider: AiProvider; model: string }
  | { type: "upsert_whatsapp_settings"; instanceUrl: string; instanceName: string; connectedNumber: string; apiKey?: string; webhookSecret?: string; enabled: boolean; weeklyPulseEnabled: boolean; weeklyPulseWeekday: number; weeklyPulseHour: number; expectedUpdatedAt: string | null; onSuccess?: () => void; onError?: (message: string) => void };

export interface AppContextValue {
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
  saveAiFunctionSetting: (fn: AiFunction, provider: AiProvider, model: string, expectedUpdatedAt: string | null) => Promise<AiSettingsSaveResult>;
  testAiProviderKey: (provider: AiProvider) => Promise<AiSettingsSaveResult>;
  testAiFunction: (fn: AiFunction, provider: AiProvider, model: string) => Promise<AiSettingsSaveResult>;
  saveOrgTone: (tone: Pick<OrgTone, "preset" | "acidity" | "drive" | "customNote">, expectedUpdatedAt: string | null) => Promise<OrgTone>;
  suggestKpiSpreadsheet: (input: KpiImportInput) => Promise<{ suggestion: KpiSpreadsheetSuggestion; historyDocuments?: import("../types").KpiHistoryDocumentRef[]; fromHistory?: boolean }>;
  applyKpiSpreadsheetSuggestion: (suggestion: KpiSpreadsheetSuggestion, source: { fileName: string; kind: KpiImportKind; token?: string }) => Promise<number>;
}
