export type ObjectiveType = "harvest" | "seed";

export type Status = "on_track" | "at_risk" | "late" | "done";

export type PlanLevel = "strategic" | "area_annual" | "quarterly" | "monthly";

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
}

export interface Evidence {
  id: string;
  orgId?: string;
  objectiveId: string;
  text: string;
  date: string;
  createdBy?: string | null;
}

export interface KeyAction {
  id: string;
  orgId?: string;
  objectiveId: string;
  description: string;
  completionCriterion: string;
  deadline: string | null;
  owner: string;
  status?: Status;
}

export interface Objective {
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

export interface StrategicProject {
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
  author: "oracle" | "user";
  text: string;
  createdAt?: string;
}

export type OracleMode = "normal" | "minimized" | "expanded";

export type MembershipRole = "owner" | "coordinator";

export interface Profile {
  id: string;
  fullName: string | null;
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
  provider: "openai" | "anthropic";
  model: string;
  hasKey: boolean;
  keyPreview?: string | null;
}

export interface CheckIn {
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
  aiSettings: AiSettings | null;
  areas: Area[];
  strategicPlan: StrategicPlan | null;
  areaPlans: AreaPlan[];
  objectives: Objective[];
  keyActions: KeyAction[];
  evidences: Evidence[];
  chatMessages: ChatMessage[];
  checkIns: CheckIn[];
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
