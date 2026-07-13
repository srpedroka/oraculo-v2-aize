import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { requireClient } from "./store-client";
import { mapAreaPlan, mapEvidence, mapKeyAction, mapObjective, mapProject } from "./domains/planning-mappers";
import { mapChatMessage, mapCheckIn, mapOperationalRevision, mapPlanDocument, mapPlanningSession } from "./domains/session-mappers";
import { mapExecutiveKpi, mapKpiMonthlyValue, mapObjectiveKpiLink } from "./domains/kpi-mappers";
import { mapAiFunctionSetting, mapAiProviderKeyStatus, mapAiSettings, mapAiUsageLog, mapOrgTone, mapWhatsAppSettings } from "./domains/settings-mappers";

export function useDomainQueries(orgId: string | null, userId: string | null) {
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
      const { data: activeConversation, error: conversationError } = await client
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("channel", "web")
        .eq("status", "active")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!activeConversation) return [];
      const { data, error } = await client
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", activeConversation.id)
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

  const operationalRevisionsQuery = useQuery({
    queryKey: ["operational_revisions", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client
        .from("operational_revisions")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map(mapOperationalRevision);
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

  const objectiveKpiLinksQuery = useQuery({
    queryKey: ["objective_kpi_links", orgId],
    enabled: Boolean(supabase && orgId),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("objective_kpi_links").select("*").eq("org_id", orgId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapObjectiveKpiLink);
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

  return {
    areas: { areasQuery },
    planning: { areaPlansQuery, objectivesQuery, strategicProjectsQuery, strategicPlanQuery, keyActionsQuery, evidencesQuery },
    sessions: { chatMessagesQuery, planningSessionsQuery },
    documents: { planDocumentsQuery, operationalRevisionsQuery },
    kpis: { executiveKpisQuery, kpiValuesQuery, objectiveKpiLinksQuery },
    settings: { aiSettingsQuery, aiFunctionSettingsQuery, aiProviderKeyStatusesQuery, aiUsageLogsQuery, orgToneQuery, whatsappSettingsQuery },
    execution: { checkInsQuery },
  };
}

