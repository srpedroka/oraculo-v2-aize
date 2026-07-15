import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAppState } from "../../state/store";
import { useAreaOperationalImpact, usePaginatedAiUsageLogs } from "../../state/use-paginated-records";
import type {
  AiConfigStatus,
  AiFunction,
  AiProvider,
  Area,
  CompanyProfileSuggestion,
  Membership,
  MembershipRole,
  OrgTonePreset,
} from "../../types";
import {
  AI_FUNCTIONS,
  DEFAULT_MODEL_BY_PROVIDER,
  TONE_PRESETS,
  acidityPreview,
  drivePreview,
  isValidInternationalPhone,
  validationMessage,
} from "./settings-shared";

export function useSettingsController() {
  const { state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone } = useAppState();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSubtitle, setOrganizationSubtitle] = useState("");
  const [organizationMessage, setOrganizationMessage] = useState("");
  // Token estável por criação (roda no servidor como trava de idempotência). Duplo
  // clique reusa o mesmo token => o servidor deduplica; após sucesso, rotaciona.
  const createOrgTokenRef = useRef(crypto.randomUUID());
  const [areaName, setAreaName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberNotify, setMemberNotify] = useState(true);
  const [memberAreaId, setMemberAreaId] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<Membership | null>(null);
  const [memberRemovalBusy, setMemberRemovalBusy] = useState(false);
  const [memberRemovalError, setMemberRemovalError] = useState("");
  const [areaToArchive, setAreaToArchive] = useState<Area | null>(null);
  const [areaLifecycleBusy, setAreaLifecycleBusy] = useState(false);
  const [areaLifecycleError, setAreaLifecycleError] = useState("");
  const [areaMessage, setAreaMessage] = useState("");
  const [providerApiKeys, setProviderApiKeys] = useState<Record<AiProvider, string>>({
    openai: "",
    anthropic: "",
    moonshot: "",
    xai: "",
  });
  const [aiFunctionDrafts, setAiFunctionDrafts] = useState<Record<AiFunction, { provider: AiProvider; model: string }>>({
    planning: { provider: state.aiSettings?.provider ?? "openai", model: state.aiSettings?.model ?? "gpt-5.4" },
    daily: { provider: state.aiSettings?.provider ?? "openai", model: state.aiSettings?.model ?? "gpt-5.4" },
    background: { provider: state.aiSettings?.provider ?? "openai", model: state.aiSettings?.model ?? "gpt-5.4" },
  });
  const aiFunctionDirtyRef = useRef<Record<AiFunction, boolean>>({ planning: false, daily: false, background: false });
  const aiFunctionBaselineRef = useRef<Record<AiFunction, string | null>>({
    planning: state.aiFunctionSettings.find((item) => item.function === "planning")?.updatedAt ?? null,
    daily: state.aiFunctionSettings.find((item) => item.function === "daily")?.updatedAt ?? null,
    background: state.aiFunctionSettings.find((item) => item.function === "background")?.updatedAt ?? null,
  });
  const aiFunctionOwnSavePending = useRef<Record<AiFunction, boolean>>({ planning: false, daily: false, background: false });
  const [aiFunctionConflict, setAiFunctionConflict] = useState<Record<AiFunction, boolean>>({
    planning: false,
    daily: false,
    background: false,
  });
  const [aiMessage, setAiMessage] = useState("");
  const [aiMessageTone, setAiMessageTone] = useState<AiConfigStatus | null>(null);
  const [savingProvider, setSavingProvider] = useState<AiProvider | null>(null);
  const [testingProvider, setTestingProvider] = useState<AiProvider | null>(null);
  const [savingFunction, setSavingFunction] = useState<AiFunction | null>(null);
  const [testingFunction, setTestingFunction] = useState<AiFunction | null>(null);
  const [toneDraft, setToneDraft] = useState<{
    preset: OrgTonePreset;
    acidity: number;
    drive: number;
    customNote: string;
  }>({ preset: "equilibrado", acidity: 0, drive: 0, customNote: "" });
  const [toneDirty, setToneDirty] = useState(false);
  const [toneConflict, setToneConflict] = useState(false);
  const toneBaselineRef = useRef<string | null>(state.orgTone?.updatedAt ?? null);
  const toneOwnSavePending = useRef(false);
  const [toneMessage, setToneMessage] = useState("");
  const [savingTone, setSavingTone] = useState(false);
  const [whatsappInstanceUrl, setWhatsappInstanceUrl] = useState(state.whatsappSettings?.instanceUrl ?? "");
  const [whatsappInstanceName, setWhatsappInstanceName] = useState(state.whatsappSettings?.instanceName ?? "");
  const [whatsappConnectedNumber, setWhatsappConnectedNumber] = useState(state.whatsappSettings?.connectedNumber ?? "");
  const [whatsappApiKey, setWhatsappApiKey] = useState("");
  const [whatsappWebhookSecret, setWhatsappWebhookSecret] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(state.whatsappSettings?.enabled ?? false);
  const [weeklyPulseEnabled, setWeeklyPulseEnabled] = useState(state.whatsappSettings?.weeklyPulseEnabled ?? false);
  const [weeklyPulseWeekday, setWeeklyPulseWeekday] = useState(state.whatsappSettings?.weeklyPulseWeekday ?? 5);
  const [weeklyPulseHour, setWeeklyPulseHour] = useState(state.whatsappSettings?.weeklyPulseHour ?? 16);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappDirty, setWhatsappDirty] = useState(false);
  const [whatsappConflict, setWhatsappConflict] = useState(false);
  const whatsappBaselineRef = useRef<string | null>(state.whatsappSettings?.updatedAt ?? null);
  const whatsappOwnSavePending = useRef(false);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [memberInviteBusyId, setMemberInviteBusyId] = useState<string | null>(null);
  const [memberAreaBusyId, setMemberAreaBusyId] = useState<string | null>(null);
  const [memberEditId, setMemberEditId] = useState<string | null>(null);
  const [memberEditName, setMemberEditName] = useState("");
  const [memberEditPhone, setMemberEditPhone] = useState("");
  const [memberEditBusy, setMemberEditBusy] = useState(false);
  const [profileLinksText, setProfileLinksText] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileResearching, setProfileResearching] = useState(false);
  const [profileConfirming, setProfileConfirming] = useState(false);
  const [profilePreview, setProfilePreview] = useState<{
    summary: string;
    sources: Array<{ url: string; title: string; selected: boolean }>;
    queries: string[];
    links: string[];
  } | null>(null);
  const isOwner = state.currentMembership?.role === "owner";
  const companyProfile = state.companyProfile;
  const companyProfileSummary = String(companyProfile?.content?.summary ?? "").trim();
  const companyProfileLinks = Array.isArray(companyProfile?.content?.links)
    ? (companyProfile?.content?.links as unknown[]).map((link) => String(link ?? "").trim()).filter(Boolean)
    : [];

  const SECTIONS = [
    { id: "empresa", label: "Empresa e áreas", ownerOnly: true },
    { id: "pessoas", label: "Pessoas", ownerOnly: true },
    { id: "ia", label: "IA do Oráculo", ownerOnly: true },
    { id: "whatsapp", label: "WhatsApp", ownerOnly: true },
    { id: "seguranca", label: "Segurança", ownerOnly: true },
    { id: "backups", label: "Backups", ownerOnly: true },
    { id: "privacidade", label: "Privacidade", ownerOnly: false },
    { id: "tom", label: "Tom do Oráculo", ownerOnly: false },
    { id: "perigo", label: "Zona de perigo", ownerOnly: false },
  ];
  const visibleSections = SECTIONS.filter((section) => isOwner || !section.ownerOnly);
  const [activeSection, setActiveSection] = useState("empresa");
  const currentSection = visibleSections.some((section) => section.id === activeSection)
    ? activeSection
    : visibleSections[0]?.id ?? "empresa";
  const showSection = (id: string) => currentSection === id;

  // Deep-link por hash: /configuracoes#backups abre direto na seção.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && SECTIONS.some((section) => section.id === hash)) setActiveSection(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setProfileLinksText(companyProfileLinks.join("\n"));
    setProfilePreview(null);
    setProfileError("");
    setProfileResearching(false);
    setProfileConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeOrgId, companyProfile?.id]);

  const [iaTab, setIaTab] = useState<"chaves" | "funcoes" | "limites" | "historico">("chaves");
  const usageQuery = usePaginatedAiUsageLogs(
    state.activeOrgId,
    showSection("ia") && iaTab === "historico",
  );
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const whatsappWebhookUrl =
    supabaseUrl && state.activeOrgId ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/whatsapp-webhook?orgId=${state.activeOrgId}` : "";

  const coordinators = useMemo(
    () => state.memberships.filter((membership) => membership.role === "coordinator"),
    [state.memberships],
  );
  const allAreas = useMemo(() => [...state.areas, ...state.archivedAreas], [state.areas, state.archivedAreas]);
  const ownerCount = useMemo(
    () => state.memberships.filter((membership) => membership.role === "owner").length,
    [state.memberships],
  );
  const impactedMemberAreas = useMemo(
    () => memberToRemove ? allAreas.filter((area) => area.coordinatorId === memberToRemove.id) : [],
    [allAreas, memberToRemove],
  );
  const archiveImpactQuery = useAreaOperationalImpact(state.activeOrgId, areaToArchive?.id ?? null);
  const archiveImpact = archiveImpactQuery.data ?? { objectives: 0, documents: 0, checkIns: 0 };

  const usageSummary = useMemo(
    () =>
      usageQuery.items.reduce(
        (summary, log) => ({
          totalTokens: summary.totalTokens + log.totalTokens,
          promptTokens: summary.promptTokens + log.promptTokens,
          completionTokens: summary.completionTokens + log.completionTokens,
          totalCostUsd: summary.totalCostUsd + log.totalCostUsd,
          calls: summary.calls + 1,
        }),
        { totalTokens: 0, promptTokens: 0, completionTokens: 0, totalCostUsd: 0, calls: 0 },
      ),
    [usageQuery.items],
  );

  const recentUsage = usageQuery.items;
  const tonePreview = useMemo(
    () => [
      `O Oráculo será ${acidityPreview(toneDraft.acidity)}, com um jeito ${drivePreview(toneDraft.drive)}.`,
      toneDraft.preset === "custom" && toneDraft.customNote.trim() ? `Preferência da casa: ${toneDraft.customNote.trim()}` : "",
    ].filter(Boolean).join(" "),
    [toneDraft],
  );

  useEffect(() => {
    const legacyProvider = state.aiSettings?.provider ?? "openai";
    const legacyModel = state.aiSettings?.model ?? DEFAULT_MODEL_BY_PROVIDER[legacyProvider];
    const incoming = Object.fromEntries(AI_FUNCTIONS.map(({ value }) => {
      const persisted = state.aiFunctionSettings.find((item) => item.function === value);
      return [value, {
        draft: { provider: persisted?.provider ?? legacyProvider, model: persisted?.model ?? legacyModel },
        updatedAt: persisted?.updatedAt ?? null,
      }];
    })) as Record<AiFunction, { draft: { provider: AiProvider; model: string }; updatedAt: string | null }>;
    const nextConflict = { ...aiFunctionConflict };
    const functionsToAdopt: AiFunction[] = [];

    for (const { value } of AI_FUNCTIONS) {
      const changedRemotely = incoming[value].updatedAt !== aiFunctionBaselineRef.current[value];
      if (aiFunctionDirtyRef.current[value] && changedRemotely && !aiFunctionOwnSavePending.current[value]) {
        nextConflict[value] = true;
        continue;
      }
      if (aiFunctionDirtyRef.current[value] && !changedRemotely) continue;
      functionsToAdopt.push(value);
      aiFunctionOwnSavePending.current[value] = false;
      aiFunctionDirtyRef.current[value] = false;
      aiFunctionBaselineRef.current[value] = incoming[value].updatedAt;
      nextConflict[value] = false;
    }

    if (functionsToAdopt.length) {
      setAiFunctionDrafts((current) => {
        const next = { ...current };
        for (const value of functionsToAdopt) next[value] = incoming[value].draft;
        return next;
      });
    }
    setAiFunctionConflict(nextConflict);
    // The conflict map is reconciled from server versions, not from its own state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.aiFunctionSettings, state.aiSettings]);

  function editAiFunctionDraft(aiFunction: AiFunction, draft: { provider: AiProvider; model: string }) {
    aiFunctionDirtyRef.current[aiFunction] = true;
    setAiFunctionDrafts((current) => ({ ...current, [aiFunction]: draft }));
    setAiMessage("");
  }

  function reloadAiFunction(aiFunction: AiFunction) {
    const legacyProvider = state.aiSettings?.provider ?? "openai";
    const legacyModel = state.aiSettings?.model ?? DEFAULT_MODEL_BY_PROVIDER[legacyProvider];
    const persisted = state.aiFunctionSettings.find((item) => item.function === aiFunction);
    aiFunctionDirtyRef.current[aiFunction] = false;
    aiFunctionOwnSavePending.current[aiFunction] = false;
    aiFunctionBaselineRef.current[aiFunction] = persisted?.updatedAt ?? null;
    setAiFunctionDrafts((current) => ({
      ...current,
      [aiFunction]: { provider: persisted?.provider ?? legacyProvider, model: persisted?.model ?? legacyModel },
    }));
    setAiFunctionConflict((current) => ({ ...current, [aiFunction]: false }));
    setAiMessage("");
  }

  useEffect(() => {
    const incomingVersion = state.whatsappSettings?.updatedAt ?? null;
    if (whatsappDirty && incomingVersion === whatsappBaselineRef.current) return;
    if (whatsappDirty && incomingVersion !== whatsappBaselineRef.current && !whatsappOwnSavePending.current) {
      setWhatsappConflict(true);
      return;
    }
    whatsappOwnSavePending.current = false;
    setWhatsappInstanceUrl(state.whatsappSettings?.instanceUrl ?? "");
    setWhatsappInstanceName(state.whatsappSettings?.instanceName ?? "");
    setWhatsappConnectedNumber(state.whatsappSettings?.connectedNumber ?? "");
    setWhatsappEnabled(state.whatsappSettings?.enabled ?? false);
    setWeeklyPulseEnabled(state.whatsappSettings?.weeklyPulseEnabled ?? false);
    setWeeklyPulseWeekday(state.whatsappSettings?.weeklyPulseWeekday ?? 5);
    setWeeklyPulseHour(state.whatsappSettings?.weeklyPulseHour ?? 16);
    whatsappBaselineRef.current = incomingVersion;
    setWhatsappDirty(false);
    setWhatsappConflict(false);
    // Only a new server version should reconcile the local draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.whatsappSettings]);

  useEffect(() => {
    const incomingVersion = state.orgTone?.updatedAt ?? null;
    if (toneDirty && incomingVersion === toneBaselineRef.current) return;
    if (toneDirty && incomingVersion !== toneBaselineRef.current && !toneOwnSavePending.current) {
      setToneConflict(true);
      return;
    }
    toneOwnSavePending.current = false;
    setToneDraft({
      preset: state.orgTone?.preset ?? "equilibrado",
      acidity: state.orgTone?.acidity ?? 0,
      drive: state.orgTone?.drive ?? 0,
      customNote: state.orgTone?.customNote ?? "",
    });
    toneBaselineRef.current = incomingVersion;
    setToneDirty(false);
    setToneConflict(false);
    // Only a new server version should reconcile the local draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orgTone]);

  function editToneDraft(updater: Parameters<typeof setToneDraft>[0]) {
    setToneDirty(true);
    setToneDraft(updater);
  }

  function reloadTone() {
    setToneDraft({
      preset: state.orgTone?.preset ?? "equilibrado",
      acidity: state.orgTone?.acidity ?? 0,
      drive: state.orgTone?.drive ?? 0,
      customNote: state.orgTone?.customNote ?? "",
    });
    toneBaselineRef.current = state.orgTone?.updatedAt ?? null;
    setToneDirty(false);
    setToneConflict(false);
    setToneMessage("");
  }

  function markWhatsAppDirty() {
    setWhatsappDirty(true);
    setWhatsappMessage("");
  }

  function reloadWhatsApp() {
    setWhatsappInstanceUrl(state.whatsappSettings?.instanceUrl ?? "");
    setWhatsappInstanceName(state.whatsappSettings?.instanceName ?? "");
    setWhatsappConnectedNumber(state.whatsappSettings?.connectedNumber ?? "");
    setWhatsappEnabled(state.whatsappSettings?.enabled ?? false);
    setWeeklyPulseEnabled(state.whatsappSettings?.weeklyPulseEnabled ?? false);
    setWeeklyPulseWeekday(state.whatsappSettings?.weeklyPulseWeekday ?? 5);
    setWeeklyPulseHour(state.whatsappSettings?.weeklyPulseHour ?? 16);
    setWhatsappApiKey("");
    setWhatsappWebhookSecret("");
    whatsappBaselineRef.current = state.whatsappSettings?.updatedAt ?? null;
    setWhatsappDirty(false);
    setWhatsappConflict(false);
    setWhatsappMessage("");
  }

  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationName.trim()) return;

    setOrganizationMessage("Criando empresa…");
    dispatch({
      type: "create_organization",
      name: organizationName.trim(),
      subtitle: organizationSubtitle.trim() || undefined,
      token: createOrgTokenRef.current,
      onSuccess: () => {
        createOrgTokenRef.current = crypto.randomUUID();
        setOrganizationName("");
        setOrganizationSubtitle("");
        setOrganizationMessage("Empresa criada. Ela será selecionada automaticamente em instantes.");
      },
      onError: (message) => setOrganizationMessage(message),
    });
  }

  function normalizeProfileLink(raw: string) {
    const value = raw.trim();
    if (!value) return "";
    // Domínio solto (www.gaam.com.br) → https://www.gaam.com.br
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
    return `https://${value.replace(/^\/+/, "")}`;
  }

  function parseProfileLinks(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => normalizeProfileLink(line))
      .filter(Boolean)
      .slice(0, 5);
  }

  function researchCompanyProfile() {
    setProfileError("");
    setProfileResearching(true);
    const links = parseProfileLinks(profileLinksText);
    dispatch({
      type: "research_company_profile",
      links,
      onSuccess: (suggestion: CompanyProfileSuggestion) => {
        setProfileResearching(false);
        setProfilePreview({
          summary: String(suggestion?.summary ?? "").trim(),
          sources: (Array.isArray(suggestion?.sources) ? suggestion.sources : []).map((source) => ({
            url: String(source?.url ?? "").trim(),
            title: String(source?.title ?? source?.url ?? "").trim() || String(source?.url ?? "").trim(),
            selected: true,
          })).filter((source) => source.url),
          queries: Array.isArray(suggestion?.queries) ? suggestion.queries.map((item) => String(item ?? "").trim()).filter(Boolean) : [],
          links: Array.isArray(suggestion?.links) ? suggestion.links.map((item) => String(item ?? "").trim()).filter(Boolean) : links,
        });
      },
      onError: (message) => {
        setProfileResearching(false);
        setProfileError(message);
      },
    });
  }

  function confirmCompanyProfile() {
    if (!profilePreview) return;
    const summary = profilePreview.summary.trim();
    if (!summary) {
      setProfileError("Edite o resumo antes de confirmar.");
      return;
    }
    setProfileError("");
    setProfileConfirming(true);
    const selectedSources = profilePreview.sources
      .filter((source) => source.selected)
      .map((source) => ({ url: source.url, title: source.title || source.url }));
    dispatch({
      type: "confirm_company_profile",
      summary,
      sources: selectedSources,
      queries: profilePreview.queries,
      links: profilePreview.links,
      onSuccess: () => {
        setProfileConfirming(false);
        setProfilePreview(null);
      },
      onError: (message) => {
        setProfileConfirming(false);
        setProfileError(message);
      },
    });
  }

  function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaName.trim()) return;
    dispatch({ type: "create_area", name: areaName.trim() });
    setAreaName("");
    setAreaMessage("");
  }

  function archiveArea() {
    if (!areaToArchive) return;
    setAreaLifecycleBusy(true);
    setAreaLifecycleError("");
    dispatch({
      type: "archive_area",
      areaId: areaToArchive.id,
      onSuccess: () => {
        setAreaLifecycleBusy(false);
        setAreaMessage(`${areaToArchive.name} foi arquivada. O histórico continua disponível.`);
        setAreaToArchive(null);
      },
      onError: (message) => {
        setAreaLifecycleBusy(false);
        setAreaLifecycleError(message);
      },
    });
  }

  function restoreArea(area: Area) {
    setAreaMessage("");
    dispatch({
      type: "restore_area",
      areaId: area.id,
      onSuccess: () => setAreaMessage(`${area.name} voltou para a operação.`),
      onError: (message) => setAreaMessage(message),
    });
  }

  function inviteChannelMessage(result?: { channel?: string }) {
    if (result?.channel === "whatsapp") return "Convite enviado pelo WhatsApp.";
    if (result?.channel === "none") return "Cadastro atualizado sem enviar convite.";
    return "Cadastro processado.";
  }

  function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberEmail.trim()) return;
    const phone = memberPhone.trim();
    if (phone && !isValidInternationalPhone(phone)) {
      setMemberMessage("Use o celular em formato internacional, por exemplo +5546999990000.");
      return;
    }
    if (memberNotify && !phone) {
      setMemberMessage("Cadastre o celular para convidar pelo WhatsApp.");
      return;
    }
    if (memberNotify && !state.whatsappSettings?.enabled) {
      setMemberMessage("Ative o WhatsApp da empresa para convidar.");
      return;
    }

    const willNotify = memberNotify;
    dispatch({
      type: "create_member",
      email: memberEmail.trim(),
      fullName: memberName.trim(),
      phone: phone || null,
      role: "coordinator",
      areaId: memberAreaId || null,
      notify: willNotify,
      onSuccess: (result) => {
        setMemberMessage(
          willNotify
            ? inviteChannelMessage(result)
            : "Coordenador cadastrado sem aviso. Use “Convidar pelo WhatsApp” na lista quando quiser chamar.",
        );
      },
      onError: (message) => setMemberMessage(message),
    });
    setMemberEmail("");
    setMemberName("");
    setMemberPhone("");
    setMemberAreaId("");
    setMemberNotify(true);
    setMemberMessage(willNotify ? "Enviando convite pelo WhatsApp..." : "Cadastrando sem avisar...");
  }

  function resendInvite(membership: Membership) {
    const email = membership.profile?.email;
    if (!email) {
      setMemberMessage("Sem email registrado para esta pessoa.");
      return;
    }
    if (!membership.profile?.phone) {
      setMemberMessage("Cadastre o celular para convidar pelo WhatsApp.");
      return;
    }
    if (!state.whatsappSettings?.enabled) {
      setMemberMessage("Ative o WhatsApp da empresa para convidar.");
      return;
    }
    const area = state.areas.find((item) => item.coordinatorId === membership.id);
    setMemberInviteBusyId(membership.id);
    setMemberMessage("Enviando convite pelo WhatsApp...");
    dispatch({
      type: "create_member",
      email,
      fullName: membership.profile?.fullName ?? "",
      phone: membership.profile?.phone ?? null,
      role: membership.role,
      areaId: area?.id ?? null,
      notify: true,
      onSuccess: (result) => {
        setMemberInviteBusyId(null);
        setMemberMessage(inviteChannelMessage(result));
      },
      onError: (message) => {
        setMemberInviteBusyId(null);
        setMemberMessage(message);
      },
    });
  }

  function assignMemberArea(membership: Membership, nextAreaId: string) {
    setMemberAreaBusyId(membership.id);
    setMemberMessage("");
    dispatch({
      type: "set_member_area",
      membershipId: membership.id,
      areaId: nextAreaId || null,
      onSuccess: () => {
        setMemberAreaBusyId(null);
        const areaName = nextAreaId
          ? state.areas.find((item) => item.id === nextAreaId)?.name ?? "área"
          : null;
        setMemberMessage(
          areaName
            ? `${membership.profile?.fullName ?? "Pessoa"} vinculada a ${areaName}.`
            : "Área desvinculada desta pessoa.",
        );
      },
      onError: (message) => {
        setMemberAreaBusyId(null);
        setMemberMessage(message);
      },
    });
  }

  function openMemberEdit(membership: Membership) {
    setMemberEditId(membership.id);
    setMemberEditName(membership.profile?.fullName ?? "");
    setMemberEditPhone(membership.profile?.phone ?? "");
    setMemberMessage("");
  }

  function saveMemberEdit(membership: Membership) {
    const email = membership.profile?.email;
    if (!email) {
      setMemberMessage("Sem email registrado para atualizar esta pessoa.");
      return;
    }
    const phone = memberEditPhone.trim();
    if (phone && !isValidInternationalPhone(phone)) {
      setMemberMessage("Use o celular em formato internacional, por exemplo +5546999990000.");
      return;
    }
    // Campo vazio = manter o celular já cadastrado (nunca apagar por omissão).
    const phoneToSave = phone || membership.profile?.phone || null;
    const area = state.areas.find((item) => item.coordinatorId === membership.id);
    setMemberEditBusy(true);
    dispatch({
      type: "create_member",
      email,
      fullName: memberEditName.trim() || email,
      phone: phoneToSave,
      role: membership.role,
      areaId: area?.id ?? null,
      notify: false,
      onSuccess: () => {
        setMemberEditBusy(false);
        setMemberEditId(null);
        setMemberMessage("Dados da pessoa atualizados (sem reenviar convite).");
      },
      onError: (message) => {
        setMemberEditBusy(false);
        setMemberMessage(message);
      },
    });
  }

  function changeMemberRole(membershipId: string, nextRole: MembershipRole) {
    if (nextRole === "owner") return;
    setRoleSavingId(membershipId);
    setMemberMessage("");
    dispatch({
      type: "set_member_role",
      membershipId,
      role: nextRole,
      onSuccess: () => {
        setRoleSavingId(null);
        setMemberMessage("Papel atualizado.");
      },
      onError: (message) => {
        setRoleSavingId(null);
        setMemberMessage(message);
      },
    });
  }

  function openMemberRemoval(membership: Membership) {
    setMemberMessage("");
    setMemberRemovalError("");
    setMemberToRemove(membership);
  }

  function removeMember(areaReassignments: Record<string, string | null>) {
    if (!memberToRemove) return;
    setMemberRemovalBusy(true);
    setMemberRemovalError("");
    dispatch({
      type: "remove_member",
      membershipId: memberToRemove.id,
      areaReassignments,
      onSuccess: () => {
        const removedName = memberToRemove.profile?.fullName ?? memberToRemove.profile?.email ?? "A pessoa";
        setMemberRemovalBusy(false);
        setMemberMessage(`${removedName} não tem mais acesso a esta empresa.`);
        setMemberToRemove(null);
      },
      onError: (message) => {
        setMemberRemovalBusy(false);
        setMemberRemovalError(message);
      },
    });
  }

  async function saveProviderKey(providerValue: AiProvider) {
    const apiKey = providerApiKeys[providerValue].trim();
    if (!apiKey) {
      setAiMessage("Cole uma chave antes de salvar.");
      setAiMessageTone("no_key");
      return;
    }
    setSavingProvider(providerValue);
    setAiMessage("");
    setAiMessageTone(null);
    try {
      const result = await saveAiProviderKey(providerValue, apiKey);
      setProviderApiKeys((current) => ({ ...current, [providerValue]: "" }));
      setAiMessage(validationMessage(result.validation));
      setAiMessageTone(result.validation?.status ?? "untested");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "Não foi possível salvar a chave.");
      setAiMessageTone("provider_error");
    } finally {
      setSavingProvider(null);
    }
  }

  async function testProvider(providerValue: AiProvider) {
    setTestingProvider(providerValue);
    setAiMessage("");
    setAiMessageTone(null);
    try {
      const result = await testAiProviderKey(providerValue);
      setAiMessage(validationMessage(result.validation));
      setAiMessageTone(result.validation?.status ?? "untested");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "Não foi possível testar a chave.");
      setAiMessageTone("provider_error");
    } finally {
      setTestingProvider(null);
    }
  }

  async function saveAiFunction(aiFunction: AiFunction) {
    const draft = aiFunctionDrafts[aiFunction];
    if (aiFunctionConflict[aiFunction]) {
      setAiMessage("Recarregue a versão atual antes de salvar esta função.");
      setAiMessageTone("provider_error");
      return;
    }
    const modelValue = draft.model.trim();
    if (!modelValue) {
      setAiMessage("Escolha um modelo do catálogo ou informe o id de um modelo personalizado.");
      setAiMessageTone("provider_error");
      return;
    }
    setSavingFunction(aiFunction);
    setAiMessage("");
    setAiMessageTone(null);
    aiFunctionOwnSavePending.current[aiFunction] = true;
    try {
      const result = await saveAiFunctionSetting(
        aiFunction,
        draft.provider,
        modelValue,
        aiFunctionBaselineRef.current[aiFunction],
      );
      if (result.updatedAt) aiFunctionBaselineRef.current[aiFunction] = result.updatedAt;
      aiFunctionDirtyRef.current[aiFunction] = false;
      aiFunctionOwnSavePending.current[aiFunction] = false;
      setAiFunctionConflict((current) => ({ ...current, [aiFunction]: false }));
      setAiMessage(validationMessage(result.validation));
      setAiMessageTone(result.validation?.status ?? "untested");
    } catch (error) {
      aiFunctionOwnSavePending.current[aiFunction] = false;
      setAiMessage(error instanceof Error ? error.message : "Não foi possível salvar a função de IA.");
      setAiMessageTone("provider_error");
    } finally {
      setSavingFunction(null);
    }
  }

  async function testFunction(aiFunction: AiFunction) {
    const draft = aiFunctionDrafts[aiFunction];
    const modelValue = draft.model.trim();
    if (!modelValue) {
      setAiMessage("Escolha um modelo do catálogo ou informe o id de um modelo personalizado.");
      setAiMessageTone("provider_error");
      return;
    }
    setTestingFunction(aiFunction);
    setAiMessage("");
    setAiMessageTone(null);
    try {
      const result = await testAiFunction(aiFunction, draft.provider, modelValue);
      setAiMessage(validationMessage(result.validation));
      setAiMessageTone(result.validation?.status ?? "untested");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "Não foi possível testar a função de IA.");
      setAiMessageTone("provider_error");
    } finally {
      setTestingFunction(null);
    }
  }

  function selectTonePreset(preset: OrgTonePreset) {
    const selected = TONE_PRESETS.find((item) => item.value === preset) ?? TONE_PRESETS[0];
    editToneDraft((current) => ({
      preset,
      acidity: preset === "custom" ? current.acidity : selected.acidity,
      drive: preset === "custom" ? current.drive : selected.drive,
      customNote: preset === "custom" ? current.customNote : "",
    }));
    setToneMessage("");
  }

  async function saveTone() {
    setSavingTone(true);
    setToneMessage("");
    toneOwnSavePending.current = true;
    try {
      const saved = await saveOrgTone({
        preset: toneDraft.preset,
        acidity: toneDraft.acidity,
        drive: toneDraft.drive,
        customNote: toneDraft.preset === "custom" ? toneDraft.customNote : null,
      }, toneBaselineRef.current);
      toneBaselineRef.current = saved.updatedAt;
      setToneDirty(false);
      setToneConflict(false);
      setToneMessage("Tom salvo e já disponível para as próximas conversas.");
    } catch (error) {
      toneOwnSavePending.current = false;
      setToneMessage(error instanceof Error ? error.message : "Não foi possível salvar o tom.");
    } finally {
      setSavingTone(false);
    }
  }

  function saveWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (whatsappConflict) {
      setWhatsappMessage("Recarregue a versão atual antes de salvar.");
      return;
    }
    whatsappOwnSavePending.current = true;
    dispatch({
      type: "upsert_whatsapp_settings",
      instanceUrl: whatsappInstanceUrl.trim(),
      instanceName: whatsappInstanceName.trim(),
      connectedNumber: whatsappConnectedNumber.trim(),
      apiKey: whatsappApiKey.trim() || undefined,
      webhookSecret: whatsappWebhookSecret.trim() || undefined,
      enabled: whatsappEnabled,
      weeklyPulseEnabled,
      weeklyPulseWeekday,
      weeklyPulseHour,
      expectedUpdatedAt: whatsappBaselineRef.current,
      onSuccess: () => {
        setWhatsappApiKey("");
        setWhatsappWebhookSecret("");
        setWhatsappDirty(false);
        setWhatsappConflict(false);
        setWhatsappMessage("Configuração do WhatsApp salva.");
      },
      onError: (message) => {
        whatsappOwnSavePending.current = false;
        setWhatsappMessage(message);
      },
    });
  }

  return {
    organizationName,
    setOrganizationName,
    organizationSubtitle,
    setOrganizationSubtitle,
    organizationMessage,
    setOrganizationMessage,
    areaName,
    setAreaName,
    memberEmail,
    setMemberEmail,
    memberName,
    setMemberName,
    memberPhone,
    setMemberPhone,
    memberNotify,
    setMemberNotify,
    memberAreaId,
    setMemberAreaId,
    memberMessage,
    setMemberMessage,
    memberToRemove,
    setMemberToRemove,
    memberRemovalBusy,
    setMemberRemovalBusy,
    memberRemovalError,
    setMemberRemovalError,
    areaToArchive,
    setAreaToArchive,
    areaLifecycleBusy,
    setAreaLifecycleBusy,
    areaLifecycleError,
    setAreaLifecycleError,
    areaMessage,
    setAreaMessage,
    providerApiKeys,
    setProviderApiKeys,
    aiFunctionDrafts,
    setAiFunctionDrafts,
    editAiFunctionDraft,
    aiFunctionConflict,
    reloadAiFunction,
    aiMessage,
    setAiMessage,
    aiMessageTone,
    setAiMessageTone,
    savingProvider,
    setSavingProvider,
    testingProvider,
    setTestingProvider,
    savingFunction,
    setSavingFunction,
    testingFunction,
    setTestingFunction,
    toneDraft,
    setToneDraft: editToneDraft,
    toneMessage,
    setToneMessage,
    savingTone,
    setSavingTone,
    whatsappInstanceUrl,
    setWhatsappInstanceUrl,
    whatsappInstanceName,
    setWhatsappInstanceName,
    whatsappConnectedNumber,
    setWhatsappConnectedNumber,
    whatsappApiKey,
    setWhatsappApiKey,
    whatsappWebhookSecret,
    setWhatsappWebhookSecret,
    whatsappEnabled,
    setWhatsappEnabled,
    weeklyPulseEnabled,
    setWeeklyPulseEnabled,
    weeklyPulseWeekday,
    setWeeklyPulseWeekday,
    weeklyPulseHour,
    setWeeklyPulseHour,
    whatsappMessage,
    setWhatsappMessage,
    toneConflict,
    reloadTone,
    whatsappConflict,
    reloadWhatsApp,
    markWhatsAppDirty,
    roleSavingId,
    setRoleSavingId,
    memberInviteBusyId,
    setMemberInviteBusyId,
    memberAreaBusyId,
    setMemberAreaBusyId,
    memberEditId,
    setMemberEditId,
    memberEditName,
    setMemberEditName,
    memberEditPhone,
    setMemberEditPhone,
    memberEditBusy,
    setMemberEditBusy,
    profileLinksText,
    setProfileLinksText,
    profileError,
    setProfileError,
    profileResearching,
    setProfileResearching,
    profileConfirming,
    setProfileConfirming,
    profilePreview,
    setProfilePreview,
    activeSection,
    setActiveSection,
    iaTab,
    setIaTab,
    state,
    dispatch,
    signOut,
    saveAiProviderKey,
    saveAiFunctionSetting,
    testAiProviderKey,
    testAiFunction,
    saveOrgTone,
    createOrgTokenRef,
    isOwner,
    companyProfile,
    companyProfileSummary,
    companyProfileLinks,
    SECTIONS,
    visibleSections,
    currentSection,
    showSection,
    supabaseUrl,
    whatsappWebhookUrl,
    coordinators,
    allAreas,
    ownerCount,
    impactedMemberAreas,
    archiveImpact,
    usageSummary,
    recentUsage,
    usageHasMore: Boolean(usageQuery.hasNextPage),
    usageLoadingMore: usageQuery.isFetchingNextPage,
    loadMoreUsage: usageQuery.fetchNextPage,
    tonePreview,
    createOrganization,
    normalizeProfileLink,
    parseProfileLinks,
    researchCompanyProfile,
    confirmCompanyProfile,
    createArea,
    archiveArea,
    restoreArea,
    inviteChannelMessage,
    inviteMember,
    resendInvite,
    assignMemberArea,
    openMemberEdit,
    saveMemberEdit,
    changeMemberRole,
    openMemberRemoval,
    removeMember,
    saveProviderKey,
    testProvider,
    saveAiFunction,
    testFunction,
    selectTonePreset,
    saveTone,
    saveWhatsApp,
  };
}

export type SettingsController = ReturnType<typeof useSettingsController>;
