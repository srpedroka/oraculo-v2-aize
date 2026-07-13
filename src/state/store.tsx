import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { requireClient } from "./store-client";
import type { AppAction, AppContextValue } from "./store-contract";
import { INITIAL_UI, uiReducer } from "./ui-state";
import { mapArea, mapMembership, mapOrganization, mapProfile } from "./domains/organization-mappers";
import { mapStrategicPlan } from "./domains/planning-mappers";
import { useStoreDispatch } from "./use-store-dispatch";
import { useStoreCommands } from "./use-store-commands";
import { useDomainQueries } from "./use-domain-queries";
import type { AppState } from "../types";

const AppContext = createContext<AppContextValue | undefined>(undefined);

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
  archivedProjects: [],
  areaPlans: [],
  objectives: [],
  archivedObjectives: [],
  keyActions: [],
  archivedKeyActions: [],
  evidences: [],
  archivedEvidences: [],
  chatMessages: [],
  checkIns: [],
  archivedCheckIns: [],
  planningSessions: [],
  planDocuments: [],
  archivedPlanDocuments: [],
  companyProfile: null,
  operationalRevisions: [],
  executiveKpis: [],
  kpiValues: [],
  objectiveKpiLinks: [],
  activeSession: null,
  loading: true,
  ready: false,
  ui: INITIAL_UI,
};

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
      const { data, error } = await client.from("profiles").select("id, full_name, email, phone").in("id", profileIds);
      if (error) throw error;
      return (data ?? []).map(mapProfile);
    },
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations", orgIds],
    enabled: Boolean(supabase && orgIds.length),
    queryFn: async () => {
      const client = requireClient();
      const { data, error } = await client.from("organizations").select("id, name, subtitle, created_by, archived_at").in("id", orgIds);
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

  const {
    areas: { areasQuery },
    planning: { areaPlansQuery, objectivesQuery, strategicProjectsQuery, strategicPlanQuery, keyActionsQuery, evidencesQuery },
    sessions: { chatMessagesQuery, planningSessionsQuery },
    documents: { planDocumentsQuery, operationalRevisionsQuery },
    kpis: { executiveKpisQuery, kpiValuesQuery, objectiveKpiLinksQuery },
    settings: { aiSettingsQuery, aiFunctionSettingsQuery, aiProviderKeyStatusesQuery, aiUsageLogsQuery, orgToneQuery, whatsappSettingsQuery },
    execution: { checkInsQuery },
  } = useDomainQueries(orgId, userId);

  const allAreas = useMemo(
    () => (areasQuery.data ?? []).map((row: any) => mapArea(row, orgMemberships)),
    [areasQuery.data, orgMemberships],
  );

  const areas = useMemo(() => allAreas.filter((area) => !area.archivedAt), [allAreas]);
  const archivedAreas = useMemo(() => allAreas.filter((area) => Boolean(area.archivedAt)), [allAreas]);
  const activeAreaIds = useMemo(() => new Set(areas.map((area) => area.id)), [areas]);
  const allObjectives = objectivesQuery.data ?? [];
  const activeObjectives = useMemo(
    () => allObjectives.filter((objective) => !objective.archivedAt && (!objective.areaId || activeAreaIds.has(objective.areaId))),
    [activeAreaIds, allObjectives],
  );
  const archivedObjectives = useMemo(() => allObjectives.filter((objective) => Boolean(objective.archivedAt)), [allObjectives]);
  const activeObjectiveIds = useMemo(() => new Set(activeObjectives.map((objective) => objective.id)), [activeObjectives]);
  const activeProjects = useMemo(
    () => (strategicProjectsQuery.data ?? []).filter((project) => !project.archivedAt),
    [strategicProjectsQuery.data],
  );
  const archivedProjects = useMemo(
    () => (strategicProjectsQuery.data ?? []).filter((project) => Boolean(project.archivedAt)),
    [strategicProjectsQuery.data],
  );
  const activeKeyActions = useMemo(
    () => (keyActionsQuery.data ?? []).filter((keyAction) => !keyAction.archivedAt && activeObjectiveIds.has(keyAction.objectiveId)),
    [activeObjectiveIds, keyActionsQuery.data],
  );
  const archivedKeyActions = useMemo(
    () => (keyActionsQuery.data ?? []).filter((keyAction) => Boolean(keyAction.archivedAt)),
    [keyActionsQuery.data],
  );
  const activeEvidences = useMemo(
    () => (evidencesQuery.data ?? []).filter((evidence) => !evidence.archivedAt && activeObjectiveIds.has(evidence.objectiveId)),
    [activeObjectiveIds, evidencesQuery.data],
  );
  const archivedEvidences = useMemo(
    () => (evidencesQuery.data ?? []).filter((evidence) => Boolean(evidence.archivedAt)),
    [evidencesQuery.data],
  );
  const activeCheckIns = useMemo(
    () => (checkInsQuery.data ?? []).filter((checkIn) => !checkIn.archivedAt && (!checkIn.areaId || activeAreaIds.has(checkIn.areaId))),
    [activeAreaIds, checkInsQuery.data],
  );
  const archivedCheckIns = useMemo(
    () => (checkInsQuery.data ?? []).filter((checkIn) => Boolean(checkIn.archivedAt)),
    [checkInsQuery.data],
  );
  const activePlanDocuments = useMemo(
    () => (planDocumentsQuery.data ?? []).filter((document) => !document.archivedAt),
    [planDocumentsQuery.data],
  );
  const archivedPlanDocuments = useMemo(
    () => (planDocumentsQuery.data ?? []).filter((document) => Boolean(document.archivedAt)),
    [planDocumentsQuery.data],
  );
  const companyProfile = useMemo(() => {
    const profiles = activePlanDocuments
      .filter((document) => document.type === "company_profile")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return profiles[0] ?? null;
  }, [activePlanDocuments]);
  const activePlanningSessions = useMemo(
    () => (planningSessionsQuery.data ?? []).filter((planningSession) => !planningSession.areaId || activeAreaIds.has(planningSession.areaId)),
    [activeAreaIds, planningSessionsQuery.data],
  );

  const strategicPlan = useMemo(() => {
    if (!strategicPlanQuery.data) return null;
    return mapStrategicPlan(strategicPlanQuery.data, activeProjects);
  }, [activeProjects, strategicPlanQuery.data]);

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
    queryClient.invalidateQueries({ queryKey: ["operational_revisions", orgId] });
    queryClient.invalidateQueries({ queryKey: ["executive_kpis", orgId] });
    queryClient.invalidateQueries({ queryKey: ["kpi_monthly_values", orgId] });
    queryClient.invalidateQueries({ queryKey: ["objective_kpi_links", orgId] });
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
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_projects", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "evidences", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_usage_logs", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_function_settings", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_provider_key_status", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_ai_tone", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_sessions", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_documents", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "operational_revisions", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "executive_kpis", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "kpi_monthly_values", filter: `org_id=eq.${orgId}` }, invalidateOrg)
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_kpi_links", filter: `org_id=eq.${orgId}` }, invalidateOrg)
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
      operationalRevisionsQuery.isLoading ||
      executiveKpisQuery.isLoading ||
      kpiValuesQuery.isLoading ||
      objectiveKpiLinksQuery.isLoading ||
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
      archivedProjects,
      areaPlans: (areaPlansQuery.data ?? []).filter((plan) => activeAreaIds.has(plan.areaId)),
      objectives: activeObjectives,
      archivedObjectives,
      keyActions: activeKeyActions,
      archivedKeyActions,
      evidences: activeEvidences,
      archivedEvidences,
      chatMessages: chatMessagesQuery.data ?? [],
      checkIns: activeCheckIns,
      archivedCheckIns,
      planningSessions: activePlanningSessions,
      planDocuments: activePlanDocuments,
      archivedPlanDocuments,
      companyProfile,
      operationalRevisions: operationalRevisionsQuery.data ?? [],
      executiveKpis: executiveKpisQuery.data ?? [],
      kpiValues: kpiValuesQuery.data ?? [],
      objectiveKpiLinks: objectiveKpiLinksQuery.data ?? [],
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
    activeCheckIns,
    activeEvidences,
    activeKeyActions,
    activeObjectives,
    activePlanDocuments,
    activePlanningSessions,
    companyProfile,
    areaPlansQuery.data,
    areaPlansQuery.isLoading,
    areas,
    archivedAreas,
    archivedCheckIns,
    archivedEvidences,
    archivedKeyActions,
    archivedObjectives,
    archivedPlanDocuments,
    archivedProjects,
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
    objectiveKpiLinksQuery.data,
    objectiveKpiLinksQuery.isLoading,
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
    operationalRevisionsQuery.data,
    operationalRevisionsQuery.isLoading,
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

  const dispatch = useStoreDispatch({ orgId, userId, queryClient, invalidateOrg, uiDispatch, setActiveOrgId });

  const {
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    updateProfile,
    refresh,
    saveAiProviderKey,
    saveAiFunctionSetting,
    testAiProviderKey,
    testAiFunction,
    saveOrgTone,
    suggestKpiSpreadsheet,
    applyKpiSpreadsheetSuggestion,
  } = useStoreCommands({
    orgId,
    userId,
    session,
    queryClient,
    invalidateOrg,
    setActiveOrgId,
    setPasswordRecoveryActive,
  });

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
