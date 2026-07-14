import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { OperationalEntityType } from "../types";

export type QueryDomain =
  | "memberships"
  | "profiles"
  | "organizations"
  | "areas"
  | "areaPlans"
  | "objectives"
  | "projects"
  | "strategicPlan"
  | "keyActions"
  | "evidences"
  | "chat"
  | "sessions"
  | "documents"
  | "revisions"
  | "kpis"
  | "kpiValues"
  | "kpiLinks"
  | "aiSettings"
  | "aiUsage"
  | "tone"
  | "whatsapp"
  | "checkIns"
  | "areaImpact";

interface QueryContext {
  orgId: string | null;
  userId: string | null;
}

export const ALL_QUERY_DOMAINS: QueryDomain[] = [
  "memberships", "profiles", "organizations", "areas", "areaPlans", "objectives", "projects",
  "strategicPlan", "keyActions", "evidences", "chat", "sessions", "documents", "revisions",
  "kpis", "kpiValues", "kpiLinks", "aiSettings", "aiUsage", "tone", "whatsapp", "checkIns",
  "areaImpact",
];

export const PLANNING_MUTATION_DOMAINS: QueryDomain[] = [
  "strategicPlan", "areaPlans", "objectives", "projects", "keyActions", "evidences", "sessions",
  "documents", "checkIns", "chat", "kpiLinks", "revisions", "aiUsage", "areaImpact",
];

function keyForDomain(domain: QueryDomain, { orgId, userId }: QueryContext): QueryKey[] {
  if (domain === "memberships") return [["memberships"]];
  if (domain === "profiles") return [["profile", userId], ["profiles"]];
  if (domain === "organizations") return [["organizations"]];
  if (!orgId) return [];

  const keys: Record<Exclude<QueryDomain, "memberships" | "profiles" | "organizations">, QueryKey[]> = {
    areas: [["areas", orgId]],
    areaPlans: [["area_plans", orgId]],
    objectives: [["objectives", orgId]],
    projects: [["strategic_projects", orgId]],
    strategicPlan: [["strategic_plan", orgId]],
    keyActions: [["key_actions", orgId]],
    evidences: [["evidences", orgId]],
    chat: [["chat_messages", orgId]],
    sessions: [["planning_sessions", orgId, userId]],
    documents: [["plan_documents", orgId]],
    revisions: [["operational_revisions", orgId]],
    kpis: [["executive_kpis", orgId]],
    kpiValues: [["kpi_monthly_values", orgId]],
    kpiLinks: [["objective_kpi_links", orgId]],
    aiSettings: [["ai_settings", orgId], ["ai_function_settings", orgId], ["ai_provider_key_status", orgId]],
    aiUsage: [["ai_usage_logs", orgId]],
    tone: [["org_ai_tone", orgId]],
    whatsapp: [["whatsapp_settings", orgId]],
    checkIns: [["check_ins", orgId]],
    areaImpact: [["area-operational-impact", orgId]],
  };
  return keys[domain];
}

export function queryKeysForDomains(context: QueryContext, domains: QueryDomain[]): QueryKey[] {
  const seen = new Set<string>();
  return domains.flatMap((domain) => keyForDomain(domain, context)).filter((key) => {
    const signature = JSON.stringify(key);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function invalidateQueryDomains(queryClient: QueryClient, context: QueryContext, domains: QueryDomain[]) {
  for (const queryKey of queryKeysForDomains(context, domains)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

const REALTIME_DOMAINS: Record<string, QueryDomain[]> = {
  areas: ["areas", "areaImpact"],
  area_plans: ["areaPlans"],
  strategic_plans: ["strategicPlan"],
  objectives: ["objectives", "areaImpact"],
  key_actions: ["keyActions"],
  strategic_projects: ["projects", "strategicPlan"],
  evidences: ["evidences", "areaImpact"],
  check_ins: ["checkIns", "areaImpact"],
  chat_messages: ["chat"],
  planning_sessions: ["sessions"],
  plan_documents: ["documents", "areaImpact"],
  operational_revisions: ["revisions"],
  executive_kpis: ["kpis"],
  kpi_monthly_values: ["kpiValues"],
  objective_kpi_links: ["kpiLinks"],
  ai_usage_logs: ["aiUsage"],
  ai_settings: ["aiSettings"],
  ai_function_settings: ["aiSettings"],
  ai_provider_key_status: ["aiSettings"],
  org_ai_tone: ["tone"],
  whatsapp_settings: ["whatsapp"],
};

export function realtimeDomainsForTable(table: string): QueryDomain[] {
  return REALTIME_DOMAINS[table] ?? [];
}

export function operationalEntityDomains(entityType: OperationalEntityType): QueryDomain[] {
  const domains: Partial<Record<OperationalEntityType, QueryDomain[]>> = {
    objective: ["objectives", "keyActions", "evidences", "kpiLinks", "areaImpact"],
    key_action: ["keyActions"],
    strategic_project: ["projects", "strategicPlan"],
    evidence: ["evidences", "areaImpact"],
    check_in: ["checkIns", "areaImpact"],
    plan_document: ["documents", "areaImpact"],
  };
  return [...(domains[entityType] ?? []), "revisions"];
}
