import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  Bot,
  Building2,
  CheckCircle2,
  DollarSign,
  KeyRound,
  LogOut,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { OrganizationBackupCard } from "../features/backups/OrganizationBackupCard";
import { AreaArchiveDialog } from "../features/areas/AreaArchiveDialog";
import { MemberRemovalDialog } from "../features/members/MemberRemovalDialog";
import { CompanyDangerZone } from "../features/lifecycle/CompanyDangerZone";
import { findModelPricing, modelOptionsForProvider } from "../lib/aiPricing";
import { useAppState } from "../state/store";
import type { AiConfigStatus, AiFunction, AiProvider, AiValidationResult, Area, Membership, MembershipRole, OrgTonePreset } from "../types";

const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
  moonshot: "kimi-k2.7-code",
  xai: "grok-4.3",
};

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic / Claude" },
  { value: "moonshot", label: "Kimi / Moonshot" },
  { value: "xai", label: "xAI / Grok" },
];

const AI_FUNCTIONS: { value: AiFunction; title: string; description: string }[] = [
  { value: "planning", title: "Planejamento e fechamentos", description: "Usa o melhor modelo para conduzir planos, propostas e viradas de período." },
  { value: "daily", title: "Conversa do dia a dia", description: "Atende WhatsApp e painel com respostas rápidas; pode usar modelo mais leve." },
  { value: "background", title: "Bastidores", description: "Classifica documentos, prepara resumos e executa tarefas de apoio com custo controlado." },
];

const CUSTOM_MODEL_VALUE = "__custom_model__";

const TONE_PRESETS: Array<{
  value: OrgTonePreset;
  label: string;
  acidity: number;
  drive: number;
}> = [
  { value: "equilibrado", label: "Equilibrado", acidity: 0, drive: 0 },
  { value: "gentil", label: "Gentil", acidity: -2, drive: 0 },
  { value: "acido", label: "Ácido / franco", acidity: 2, drive: 0 },
  { value: "direto", label: "Direto", acidity: 0, drive: -2 },
  { value: "motivador", label: "Motivador", acidity: 0, drive: 2 },
  { value: "custom", label: "Personalizado", acidity: 0, drive: 0 },
];

function acidityPreview(value: number) {
  if (value <= -2) return "bem gentil e acolhedor";
  if (value === -1) return "gentil nas provocações";
  if (value === 1) return "franco e respeitoso";
  if (value >= 2) return "franco e provocador, sem grosseria";
  return "equilibrado entre acolhimento e franqueza";
}

function drivePreview(value: number) {
  if (value <= -2) return "seco e objetivo";
  if (value === -1) return "contido e focado";
  if (value === 1) return "positivo e orientado ao próximo passo";
  if (value >= 2) return "motivador e energético, sem exageros";
  return "sereno e prático";
}

function normalizePhone(value: string) {
  const startsWithPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${startsWithPlus ? "+" : ""}${digits}`;
}

function isValidInternationalPhone(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function providerLabel(provider: AiProvider) {
  return PROVIDERS.find((item) => item.value === provider)?.label ?? provider;
}

function functionLabel(value: unknown) {
  const aiFunction = AI_FUNCTIONS.find((item) => item.value === value);
  return aiFunction?.title ?? "Sem função";
}

function membershipRoleLabel(role: MembershipRole) {
  if (role === "owner") return "Dono";
  if (role === "admin") return "Admin";
  return "Coordenador";
}

function statusLabel(status: AiConfigStatus | null | undefined) {
  if (status === "ok") return "Validado";
  if (status === "invalid_key") return "Chave recusada";
  if (status === "unknown_model") return "Modelo não reconhecido";
  if (status === "rate_limited") return "Limite do provedor";
  if (status === "timeout") return "Sem resposta";
  if (status === "no_key") return "Sem chave";
  if (status === "provider_error") return "Erro no provedor";
  return "Não testado";
}

function statusClasses(status: AiConfigStatus | null | undefined) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "invalid_key" || status === "unknown_model" || status === "no_key") return "border-red-200 bg-red-50 text-red-700";
  if (status === "rate_limited" || status === "timeout" || status === "provider_error") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-border bg-[#FAFAFB] text-text-secondary";
}

function validationMessage(validation: AiValidationResult | null | undefined) {
  if (!validation) return "Configuração salva. Não houve validação do provedor.";
  const provider = providerLabel(validation.provider);
  if (validation.status === "ok") return `Validado com ${provider} agora.`;
  if (validation.status === "unknown_model") return `${provider} não reconhece o modelo ${validation.model}. Confira o id do modelo.`;
  if (validation.status === "invalid_key") return `A chave ${provider} foi recusada. Revise a chave.`;
  if (validation.status === "no_key") return `Não há chave ${provider} cadastrada para validar esse modelo.`;
  if (validation.status === "rate_limited") return `${provider} limitou a validação agora; tente novamente em instantes.`;
  if (validation.status === "timeout") return `Não consegui falar com ${provider} agora; tente de novo.`;
  return `O provedor retornou erro ao validar: ${validation.detail}`;
}

function checkedAtLabel(value: string | null | undefined) {
  if (!value) return "Nunca testado";
  return new Date(value).toLocaleString("pt-BR");
}

export function Settings() {
  const { state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone } = useAppState();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSubtitle, setOrganizationSubtitle] = useState("");
  const [organizationMessage, setOrganizationMessage] = useState("");
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
  const [toneMessage, setToneMessage] = useState("");
  const [savingTone, setSavingTone] = useState(false);
  const [whatsappInstanceUrl, setWhatsappInstanceUrl] = useState(state.whatsappSettings?.instanceUrl ?? "");
  const [whatsappInstanceName, setWhatsappInstanceName] = useState(state.whatsappSettings?.instanceName ?? "");
  const [whatsappConnectedNumber, setWhatsappConnectedNumber] = useState(state.whatsappSettings?.connectedNumber ?? "");
  const [whatsappApiKey, setWhatsappApiKey] = useState("");
  const [whatsappWebhookSecret, setWhatsappWebhookSecret] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(state.whatsappSettings?.enabled ?? false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const isOwner = state.currentMembership?.role === "owner";

  const SECTIONS = [
    { id: "empresa", label: "Empresa e áreas", ownerOnly: true },
    { id: "pessoas", label: "Pessoas", ownerOnly: true },
    { id: "ia", label: "IA do Oráculo", ownerOnly: true },
    { id: "whatsapp", label: "WhatsApp", ownerOnly: true },
    { id: "backups", label: "Backups", ownerOnly: true },
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
  const [iaTab, setIaTab] = useState<"chaves" | "funcoes" | "historico">("chaves");
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
  const archiveImpact = useMemo(() => {
    if (!areaToArchive) return { objectives: 0, documents: 0, checkIns: 0 };
    return {
      objectives: state.objectives.filter((objective) => objective.areaId === areaToArchive.id).length,
      documents: state.planDocuments.filter((document) => document.areaId === areaToArchive.id).length,
      checkIns: state.checkIns.filter((checkIn) => checkIn.areaId === areaToArchive.id).length,
    };
  }, [areaToArchive, state.checkIns, state.objectives, state.planDocuments]);

  const usageSummary = useMemo(
    () =>
      state.aiUsageLogs.reduce(
        (summary, log) => ({
          totalTokens: summary.totalTokens + log.totalTokens,
          promptTokens: summary.promptTokens + log.promptTokens,
          completionTokens: summary.completionTokens + log.completionTokens,
          totalCostUsd: summary.totalCostUsd + log.totalCostUsd,
          calls: summary.calls + 1,
        }),
        { totalTokens: 0, promptTokens: 0, completionTokens: 0, totalCostUsd: 0, calls: 0 },
      ),
    [state.aiUsageLogs],
  );

  const recentUsage = state.aiUsageLogs.slice(0, 5);
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
    setAiFunctionDrafts({
      planning: {
        provider: state.aiFunctionSettings.find((item) => item.function === "planning")?.provider ?? legacyProvider,
        model: state.aiFunctionSettings.find((item) => item.function === "planning")?.model ?? legacyModel,
      },
      daily: {
        provider: state.aiFunctionSettings.find((item) => item.function === "daily")?.provider ?? legacyProvider,
        model: state.aiFunctionSettings.find((item) => item.function === "daily")?.model ?? legacyModel,
      },
      background: {
        provider: state.aiFunctionSettings.find((item) => item.function === "background")?.provider ?? legacyProvider,
        model: state.aiFunctionSettings.find((item) => item.function === "background")?.model ?? legacyModel,
      },
    });
  }, [state.aiFunctionSettings, state.aiSettings]);

  useEffect(() => {
    setWhatsappInstanceUrl(state.whatsappSettings?.instanceUrl ?? "");
    setWhatsappInstanceName(state.whatsappSettings?.instanceName ?? "");
    setWhatsappConnectedNumber(state.whatsappSettings?.connectedNumber ?? "");
    setWhatsappEnabled(state.whatsappSettings?.enabled ?? false);
  }, [state.whatsappSettings]);

  useEffect(() => {
    setToneDraft({
      preset: state.orgTone?.preset ?? "equilibrado",
      acidity: state.orgTone?.acidity ?? 0,
      drive: state.orgTone?.drive ?? 0,
      customNote: state.orgTone?.customNote ?? "",
    });
  }, [state.orgTone]);

  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationName.trim()) return;

    dispatch({
      type: "create_organization",
      name: organizationName.trim(),
      subtitle: organizationSubtitle.trim() || undefined,
    });
    setOrganizationName("");
    setOrganizationSubtitle("");
    setOrganizationMessage("Empresa criada. Ela será selecionada automaticamente em instantes.");
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

  function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberEmail.trim()) return;
    const phone = memberPhone.trim();
    if (phone && !isValidInternationalPhone(phone)) {
      setMemberMessage("Use o celular em formato internacional, por exemplo +5546999990000.");
      return;
    }

    dispatch({
      type: "create_member",
      email: memberEmail.trim(),
      fullName: memberName.trim(),
      phone: phone || null,
      role: "coordinator",
      areaId: memberAreaId || null,
      notify: memberNotify,
    });
    setMemberEmail("");
    setMemberName("");
    setMemberPhone("");
    setMemberAreaId("");
    setMemberNotify(true);
    setMemberMessage(
      memberNotify
        ? "Convite solicitado. Com WhatsApp ativo e celular preenchido, a pessoa recebe pelo WhatsApp; caso contrário, por email."
        : "Coordenador cadastrado sem aviso. Use “Convidar” na lista quando quiser chamá-lo no WhatsApp.",
    );
  }

  function resendInvite(membership: Membership) {
    const email = membership.profile?.email;
    if (!email) {
      setMemberMessage("Sem email registrado para convidar esta pessoa.");
      return;
    }
    const area = allAreas.find((item) => item.coordinatorId === membership.id);
    setMemberMessage("Enviando convite por WhatsApp...");
    dispatch({
      type: "create_member",
      email,
      fullName: membership.profile?.fullName ?? "",
      phone: membership.profile?.phone ?? null,
      role: membership.role,
      areaId: area?.id ?? null,
      notify: true,
      onSuccess: () => setMemberMessage("Convite enviado por WhatsApp."),
      onError: (message) => setMemberMessage(message),
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
    const modelValue = draft.model.trim();
    if (!modelValue) {
      setAiMessage("Escolha um modelo do catálogo ou informe o id de um modelo personalizado.");
      setAiMessageTone("provider_error");
      return;
    }
    setSavingFunction(aiFunction);
    setAiMessage("");
    setAiMessageTone(null);
    try {
      const result = await saveAiFunctionSetting(aiFunction, draft.provider, modelValue);
      setAiMessage(validationMessage(result.validation));
      setAiMessageTone(result.validation?.status ?? "untested");
    } catch (error) {
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
    setToneDraft((current) => ({
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
    try {
      await saveOrgTone({
        preset: toneDraft.preset,
        acidity: toneDraft.acidity,
        drive: toneDraft.drive,
        customNote: toneDraft.preset === "custom" ? toneDraft.customNote : null,
      });
      setToneMessage("Tom salvo e já disponível para as próximas conversas.");
    } catch (error) {
      setToneMessage(error instanceof Error ? error.message : "Não foi possível salvar o tom.");
    } finally {
      setSavingTone(false);
    }
  }

  function saveWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({
      type: "upsert_whatsapp_settings",
      instanceUrl: whatsappInstanceUrl.trim(),
      instanceName: whatsappInstanceName.trim(),
      connectedNumber: whatsappConnectedNumber.trim(),
      apiKey: whatsappApiKey.trim() || undefined,
      webhookSecret: whatsappWebhookSecret.trim() || undefined,
      enabled: whatsappEnabled,
    });
    setWhatsappApiKey("");
    setWhatsappWebhookSecret("");
    setWhatsappMessage("Configuração do WhatsApp salva.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Empresa, pessoas e IA</p>
          <h1 className="text-2xl font-semibold text-text">Configurações</h1>
        </div>
        <Button variant="ghost" icon={LogOut} onClick={() => void signOut()}>
          Sair
        </Button>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Seções das configurações">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={currentSection === section.id}
            onClick={() => {
              setActiveSection(section.id);
              window.history.replaceState(null, "", `#${section.id}`);
            }}
            className={[
              "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none",
              currentSection === section.id
                ? "bg-[#1D1D1F] text-white"
                : "border border-border bg-surface text-text-secondary hover:bg-fill-hover hover:text-text",
            ].join(" ")}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {showSection("empresa") ? (
      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">Empresa ativa</h2>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Selecionar empresa</span>
              <select
                value={state.activeOrgId ?? ""}
                onChange={(event) => dispatch({ type: "set_active_org", orgId: event.target.value })}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              >
                {state.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                    {organization.subtitle ? ` / ${organization.subtitle}` : ""}
                    {organization.archivedAt ? " (arquivada)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
              <p className="text-sm font-semibold text-text">{state.organization?.name}</p>
              <p className="mt-1 text-sm text-text-secondary">{state.organization?.subtitle || "Sem subtítulo"}</p>
              <p className="mt-3 text-xs font-medium text-text-tertiary">
                Seu papel: {state.currentMembership?.role === "owner" ? "Dono" : "Coordenador"}
              </p>
            </div>
            <form onSubmit={createOrganization} className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-text">Adicionar nova empresa</p>
              <div className="mt-3 grid gap-3">
                <input
                  value={organizationName}
                  onChange={(event) => {
                    setOrganizationName(event.target.value);
                    setOrganizationMessage("");
                  }}
                  placeholder="Nome da empresa"
                  className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                />
                <input
                  value={organizationSubtitle}
                  onChange={(event) => setOrganizationSubtitle(event.target.value)}
                  placeholder="Subtítulo ou marca, opcional"
                  className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                />
                <Button type="submit" icon={Plus} disabled={!organizationName.trim()}>
                  Criar empresa
                </Button>
              </div>
              {organizationMessage ? <p className="mt-3 text-xs leading-5 text-text-secondary">{organizationMessage}</p> : null}
            </form>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-text">Áreas</h2>
          <form onSubmit={createArea} className="mb-4 flex gap-2">
            <input
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
              placeholder="Nome da área"
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <Button type="submit" icon={Plus}>
              Criar
            </Button>
          </form>
          <div className="space-y-2">
            {state.areas.length ? (
              state.areas.map((area) => (
                <div key={area.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{area.name}</p>
                      <p className="text-xs text-text-secondary">Coordenador: {area.coordinator}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={area.coordinatorId ?? ""}
                        onChange={(event) =>
                          dispatch({ type: "update_area", areaId: area.id, name: area.name, coordinatorId: event.target.value || null })
                        }
                        className="h-9 min-w-0 rounded-control border border-border bg-white px-3 text-sm"
                      >
                        <option value="">Sem coordenador</option>
                        {coordinators.map((membership) => (
                          <option key={membership.id} value={membership.id}>
                            {membership.profile?.fullName ?? membership.userId}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="quiet"
                        size="icon"
                        icon={Archive}
                        onClick={() => {
                          setAreaLifecycleError("");
                          setAreaToArchive(area);
                        }}
                        aria-label={`Arquivar ${area.name}`}
                        title={`Arquivar ${area.name}`}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
                Nenhuma área ainda.
              </p>
            )}
          </div>
          {state.archivedAreas.length ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-text-tertiary">Áreas arquivadas</p>
              <div className="space-y-2">
                {state.archivedAreas.map((area) => (
                  <div key={area.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-secondary">{area.name}</p>
                      <p className="text-xs text-text-tertiary">Histórico preservado</p>
                    </div>
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => restoreArea(area)}>
                      Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {areaMessage ? <p className="mt-3 text-xs leading-5 text-text-secondary">{areaMessage}</p> : null}
        </Card>
      </div>
      ) : null}

      {showSection("pessoas") ? (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">Pessoas</h2>
          </div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Entrada de coordenadores é feita por convite do dono da empresa.
          </p>
          <form onSubmit={inviteMember} className="grid gap-3">
            <input
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Nome do coordenador"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="email@empresa.com"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={memberPhone}
                onChange={(event) => {
                  setMemberPhone(normalizePhone(event.target.value));
                  setMemberMessage("");
                }}
                placeholder="+5546999990000"
                className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={memberAreaId}
              onChange={(event) => setMemberAreaId(event.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            >
              <option value="">Vincular depois</option>
              {state.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <label className="flex items-start gap-2 text-sm leading-5 text-text-secondary">
              <input
                type="checkbox"
                checked={memberNotify}
                onChange={(event) => setMemberNotify(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              Chamar no WhatsApp agora — desmarque para cadastrar sem avisar e convidar depois pela lista.
            </label>
            <Button type="submit" icon={UserPlus}>
              {memberNotify ? "Convidar coordenador" : "Cadastrar sem avisar"}
            </Button>
          </form>
          {memberMessage ? (
            <p className="mt-3 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {memberMessage}
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {state.memberships.map((membership) => {
              const linkedAreas = allAreas.filter((area) => area.coordinatorId === membership.id);
              const isCurrentUser = membership.userId === state.sessionUserId;
              const isLastOwner = membership.role === "owner" && ownerCount <= 1;
              return (
                <div key={membership.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">
                        {membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{membership.profile?.email ?? "Email não registrado"}</p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        Áreas: {linkedAreas.length ? linkedAreas.map((area) => area.name).join(", ") : "Sem área vinculada"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={membership.role}
                        disabled={roleSavingId === membership.id}
                        onChange={(event) => changeMemberRole(membership.id, event.target.value as MembershipRole)}
                        className="h-8 rounded-[10px] border border-border bg-white px-2.5 text-xs font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Papel de ${membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}`}
                      >
                        {membership.role === "owner" ? <option value="owner">{membershipRoleLabel("owner")}</option> : null}
                        <option value="admin">{membershipRoleLabel("admin")}</option>
                        <option value="coordinator">{membershipRoleLabel("coordinator")}</option>
                      </select>
                      {membership.profile?.phone && state.whatsappSettings?.enabled && !isCurrentUser ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={MessageCircle}
                          onClick={() => resendInvite(membership)}
                          title="Enviar convite por WhatsApp"
                        >
                          Convidar
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        disabled={isCurrentUser || isLastOwner}
                        onClick={() => openMemberRemoval(membership)}
                        title={isCurrentUser ? "O próprio acesso usa um fluxo separado" : isLastOwner ? "O último dono não pode ser removido" : "Remover acesso"}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {showSection("ia") ? (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">IA do Oráculo</h2>
          </div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Planejamento usa o melhor modelo; Dia a dia pode usar um modelo leve e barato; Bastidores cuida de classificação e resumos.
          </p>

          <div className="mb-4 inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {([
              { id: "chaves", label: "Chaves" },
              { id: "funcoes", label: "Funções" },
              { id: "historico", label: "Histórico" },
            ] as const).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setIaTab(sub.id)}
                className={[
                  "rounded-[9px] px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
                  iaTab === sub.id ? "bg-white text-text shadow-card" : "text-text-secondary hover:text-text",
                ].join(" ")}
              >
                {sub.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {iaTab === "chaves" ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-text-secondary" />
                <p className="text-sm font-semibold text-text">Chaves por provedor</p>
              </div>
              <div className="grid gap-3">
                {PROVIDERS.map((providerItem) => {
                  const status =
                    state.aiProviderKeyStatuses.find((item) => item.provider === providerItem.value) ??
                    (state.aiSettings?.provider === providerItem.value
                      ? {
                          orgId: state.activeOrgId ?? "",
                          provider: providerItem.value,
                          hasKey: state.aiSettings.hasKey,
                          keyPreview: state.aiSettings.keyPreview,
                        }
                      : null);
                  return (
                    <div key={providerItem.value} className="rounded-2xl border border-border bg-[#FAFAFB] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-text">{providerItem.label}</p>
                          <p className="text-xs text-text-secondary">
                            {status?.hasKey ? `Chave guardada ${status.keyPreview ?? ""}` : "Nenhuma chave cadastrada"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={Save}
                          disabled={!providerApiKeys[providerItem.value].trim() || savingProvider === providerItem.value}
                          onClick={() => saveProviderKey(providerItem.value)}
                        >
                          {savingProvider === providerItem.value ? "Validando..." : "Salvar chave"}
                        </Button>
                      </div>
                      <div className={["mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs", statusClasses(status?.lastStatus)].join(" ")}>
                        <span className="font-medium">{statusLabel(status?.lastStatus)}</span>
                        <span>{checkedAtLabel(status?.lastCheckedAt)}</span>
                        {status?.lastStatusDetail ? <span className="basis-full truncate text-[11px] opacity-80">{status.lastStatusDetail}</span> : null}
                      </div>
                      <input
                        type="password"
                        value={providerApiKeys[providerItem.value]}
                        onChange={(event) => {
                          setProviderApiKeys((current) => ({ ...current, [providerItem.value]: event.target.value }));
                          setAiMessage("");
                        }}
                        placeholder={status?.hasKey ? "Nova chave, se quiser trocar" : "Cole a chave da API"}
                        className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="quiet"
                          icon={RefreshCw}
                          disabled={!status?.hasKey || testingProvider === providerItem.value}
                          onClick={() => testProvider(providerItem.value)}
                        >
                          {testingProvider === providerItem.value ? "Testando..." : "Testar chave"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            ) : null}

            {iaTab === "funcoes" ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-text-secondary" />
                <p className="text-sm font-semibold text-text">Funções de IA</p>
              </div>
              <div className="grid gap-3">
                {AI_FUNCTIONS.map((item) => {
                  const draft = aiFunctionDrafts[item.value];
                  const pricing = findModelPricing(draft.provider, draft.model);
                  const modelOptions = modelOptionsForProvider(draft.provider);
                  const isCatalogModel = modelOptions.some((option) => option.model === draft.model);
                  const persisted = state.aiFunctionSettings.find((setting) => setting.function === item.value);
                  return (
                    <div key={item.value} className="rounded-2xl border border-border bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-text-secondary">{item.description}</p>
                        </div>
                        <div className={["rounded-full border px-2.5 py-1 text-xs font-medium", statusClasses(persisted?.lastStatus)].join(" ")}>
                          {statusLabel(persisted?.lastStatus)}
                        </div>
                      </div>
                      {persisted?.lastStatus || persisted?.lastCheckedAt ? (
                        <p className="mb-3 text-xs leading-5 text-text-secondary">
                          Última verificação: {checkedAtLabel(persisted.lastCheckedAt)}
                          {persisted.lastStatusSource === "runtime" ? " no uso real" : persisted.lastStatusSource === "manual" ? " em teste manual" : " ao salvar"}.
                          {persisted.lastStatusDetail ? ` ${persisted.lastStatusDetail}` : ""}
                        </p>
                      ) : null}
                      <div className="grid gap-3">
                        <select
                          value={draft.provider}
                          onChange={(event) => {
                            const nextProvider = event.target.value as AiProvider;
                            setAiFunctionDrafts((current) => ({
                              ...current,
                              [item.value]: { provider: nextProvider, model: DEFAULT_MODEL_BY_PROVIDER[nextProvider] },
                            }));
                            setAiMessage("");
                          }}
                          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                        >
                          {PROVIDERS.map((providerItem) => (
                            <option key={providerItem.value} value={providerItem.value}>
                              {providerItem.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={isCatalogModel ? draft.model : CUSTOM_MODEL_VALUE}
                          onChange={(event) => {
                            const nextModel = event.target.value;
                            setAiFunctionDrafts((current) => ({
                              ...current,
                              [item.value]: { ...current[item.value], model: nextModel === CUSTOM_MODEL_VALUE ? "" : nextModel },
                            }));
                            setAiMessage("");
                          }}
                          className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                          aria-label={`Modelo para ${item.title}`}
                        >
                          {modelOptions.map((option) => (
                            <option key={option.model} value={option.model}>{option.model}</option>
                          ))}
                          <option value={CUSTOM_MODEL_VALUE}>Outro modelo</option>
                        </select>
                        {!isCatalogModel ? (
                          <input
                            value={draft.model}
                            onChange={(event) => {
                              setAiFunctionDrafts((current) => ({
                                ...current,
                                [item.value]: { ...current[item.value], model: event.target.value },
                              }));
                              setAiMessage("");
                            }}
                            placeholder="Id do modelo personalizado"
                            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                            aria-label={`Id personalizado para ${item.title}`}
                          />
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div className="rounded-xl border border-border bg-[#FAFAFB] px-3 py-2">
                            <p className="text-xs font-medium text-text-secondary">Pricing automático</p>
                            <p className="mt-1 text-sm text-text">
                              {pricing
                                ? `${formatUsd(pricing.inputTokenPriceUsdPerMillion)} entrada · ${formatUsd(pricing.outputTokenPriceUsdPerMillion)} saída / 1M tokens`
                                : "Modelo sem preço conhecido no catálogo"}
                            </p>
                            <p className="mt-1 truncate text-xs text-text-tertiary">{pricing?.source ?? "Escolha um modelo conhecido para contabilizar custo."}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="quiet"
                              icon={RefreshCw}
                              disabled={testingFunction === item.value}
                              onClick={() => testFunction(item.value)}
                            >
                              {testingFunction === item.value ? "Testando..." : "Testar agora"}
                            </Button>
                            <Button
                              type="button"
                              icon={Save}
                              disabled={savingFunction === item.value}
                              onClick={() => saveAiFunction(item.value)}
                            >
                              {savingFunction === item.value ? "Validando..." : "Salvar função"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            ) : null}
          </div>
          {aiMessage ? (
            <p className={["mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-6", statusClasses(aiMessageTone)].join(" ")}>
              {aiMessageTone === "ok" ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-1 h-4 w-4 shrink-0" />}
              {aiMessage}
            </p>
          ) : null}
          {iaTab === "historico" ? (
          <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-text-secondary" />
                <p className="text-sm font-semibold text-text">Consumo</p>
              </div>
              <p className="text-2xl font-semibold text-text">{formatNumber(usageSummary.totalTokens)}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {formatNumber(usageSummary.promptTokens)} entrada · {formatNumber(usageSummary.completionTokens)} saída
              </p>
              <p className="mt-1 text-xs text-text-tertiary">{usageSummary.calls} chamadas registradas</p>
            </div>
            <div className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
              <div className="mb-2 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-text-secondary" />
                <p className="text-sm font-semibold text-text">Custo estimado</p>
              </div>
              <p className="text-2xl font-semibold text-text">{formatUsd(usageSummary.totalCostUsd)}</p>
              <p className="mt-1 text-xs text-text-secondary">
                Modelo legado: {state.aiSettings?.model ?? "não configurado"}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">Calculado pelo preço salvo no momento da chamada</p>
            </div>
          </div>
          {recentUsage.length ? (
            <div className="mt-4 space-y-2">
              {recentUsage.map((log) => (
                <div key={log.id} className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-text">{log.model}</p>
                      <p className="text-xs text-text-secondary">
                        {log.channel === "whatsapp" ? "WhatsApp" : "Web"} · {functionLabel(log.metadata?.aiFunction)} ·{" "}
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text">{formatUsd(log.totalCostUsd)}</p>
                      <p className="text-xs text-text-secondary">{formatNumber(log.totalTokens)} tokens</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          </>
          ) : null}
        </Card>
      ) : null}

      {showSection("whatsapp") ? (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">WhatsApp</h2>
          </div>
          <p className="mb-4 text-sm leading-6 text-text-secondary">
            Use a URL pública da sua VPS/Evo Go. O segredo do webhook deve ser o mesmo salvo aqui e configurado no painel da Evolution.
          </p>
          <form onSubmit={saveWhatsApp} className="grid gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(event) => setWhatsappEnabled(event.target.checked)}
                className="h-4 w-4"
              />
              Ativar webhook do WhatsApp
            </label>
            <input
              value={whatsappInstanceUrl}
              onChange={(event) => setWhatsappInstanceUrl(event.target.value)}
              placeholder="URL da Evolution API"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              value={whatsappInstanceName}
              onChange={(event) => setWhatsappInstanceName(event.target.value)}
              placeholder="Nome da instância"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              value={whatsappConnectedNumber}
              onChange={(event) => setWhatsappConnectedNumber(normalizePhone(event.target.value))}
              placeholder="Número conectado, ex: +5546999990000"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="password"
              value={whatsappApiKey}
              onChange={(event) => setWhatsappApiKey(event.target.value)}
              placeholder={
                state.whatsappSettings?.hasApiKey ? `Chave Evolution cadastrada ${state.whatsappSettings.keyPreview ?? ""}` : "Chave da Evolution API"
              }
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="password"
              value={whatsappWebhookSecret}
              onChange={(event) => setWhatsappWebhookSecret(event.target.value)}
              placeholder={
                state.whatsappSettings?.hasWebhookSecret
                  ? `Segredo cadastrado ${state.whatsappSettings.webhookSecretPreview ?? ""}`
                  : "Segredo do webhook"
              }
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            {whatsappWebhookUrl ? (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-text-secondary">URL do webhook</span>
                <input
                  value={whatsappWebhookUrl}
                  readOnly
                  className="h-10 w-full rounded-xl border border-border bg-[#FAFAFB] px-3 text-xs text-text-secondary"
                />
              </label>
            ) : null}
            <Button type="submit" icon={MessageCircle}>
              Salvar WhatsApp
            </Button>
          </form>
          {whatsappMessage ? (
            <p className="mt-3 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {whatsappMessage}
            </p>
          ) : null}
        </Card>
      ) : null}

      {showSection("backups") && state.activeOrgId ? <OrganizationBackupCard orgId={state.activeOrgId} /> : null}

      {showSection("tom") ? (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
            <div>
              <h2 className="text-base font-semibold text-text">Tom do Oráculo</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Vale para o painel, WhatsApp e sessões de planejamento desta empresa.
              </p>
            </div>
          </div>
          {!isOwner ? (
            <span className="rounded-full border border-border bg-[#FAFAFB] px-2.5 py-1 text-xs font-medium text-text-secondary">
              Somente leitura
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Preset</span>
              <select
                value={toneDraft.preset}
                disabled={!isOwner}
                onChange={(event) => selectTonePreset(event.target.value as OrgTonePreset)}
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-[#FAFAFB] disabled:text-text-secondary"
              >
                {TONE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-border bg-[#FAFAFB] p-4">
              <p className="text-xs font-medium uppercase text-text-tertiary">Prévia</p>
              <p className="mt-2 text-sm leading-6 text-text">{tonePreview}</p>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-text">
                <span>Franqueza</span>
                <span className="text-xs font-normal text-text-tertiary">{toneDraft.acidity}</span>
              </span>
              <input
                type="range"
                min="-2"
                max="2"
                step="1"
                value={toneDraft.acidity}
                disabled={!isOwner || toneDraft.preset !== "custom"}
                onChange={(event) => {
                  setToneDraft((current) => ({ ...current, acidity: Number(event.target.value) }));
                  setToneMessage("");
                }}
                className="h-2 w-full cursor-pointer accent-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="mt-2 flex justify-between text-xs text-text-tertiary">
                <span>Gentil</span>
                <span>Ácido / franco</span>
              </span>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-text">
                <span>Energia</span>
                <span className="text-xs font-normal text-text-tertiary">{toneDraft.drive}</span>
              </span>
              <input
                type="range"
                min="-2"
                max="2"
                step="1"
                value={toneDraft.drive}
                disabled={!isOwner || toneDraft.preset !== "custom"}
                onChange={(event) => {
                  setToneDraft((current) => ({ ...current, drive: Number(event.target.value) }));
                  setToneMessage("");
                }}
                className="h-2 w-full cursor-pointer accent-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="mt-2 flex justify-between text-xs text-text-tertiary">
                <span>Direto / seco</span>
                <span>Motivador</span>
              </span>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-text">
                <span>Preferência da casa</span>
                <span className="text-xs font-normal text-text-tertiary">{toneDraft.customNote.length}/280</span>
              </span>
              <textarea
                value={toneDraft.customNote}
                maxLength={280}
                rows={3}
                disabled={!isOwner || toneDraft.preset !== "custom"}
                onChange={(event) => {
                  setToneDraft((current) => ({ ...current, customNote: event.target.value }));
                  setToneMessage("");
                }}
                placeholder="Ex.: use exemplos do nosso setor e evite linguagem de consultoria."
                className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 disabled:cursor-not-allowed disabled:bg-[#FAFAFB] disabled:text-text-secondary"
              />
            </label>

            {isOwner ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-text-tertiary">
                  Os controles finos ficam disponíveis no preset Personalizado.
                </p>
                <Button type="button" icon={Save} disabled={savingTone} onClick={() => void saveTone()}>
                  {savingTone ? "Salvando..." : "Salvar tom"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {toneMessage ? (
          <p className="mt-4 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
            {toneMessage}
          </p>
        ) : null}
      </Card>
      ) : null}

      {showSection("perigo") ? <CompanyDangerZone /> : null}

      {areaToArchive ? (
        <AreaArchiveDialog
          area={areaToArchive}
          impact={archiveImpact}
          busy={areaLifecycleBusy}
          error={areaLifecycleError}
          onClose={() => {
            if (areaLifecycleBusy) return;
            setAreaToArchive(null);
            setAreaLifecycleError("");
          }}
          onConfirm={archiveArea}
        />
      ) : null}

      {memberToRemove ? (
        <MemberRemovalDialog
          key={memberToRemove.id}
          membership={memberToRemove}
          impactedAreas={impactedMemberAreas}
          replacements={coordinators.filter((membership) => membership.id !== memberToRemove.id)}
          busy={memberRemovalBusy}
          error={memberRemovalError}
          onClose={() => {
            if (memberRemovalBusy) return;
            setMemberToRemove(null);
            setMemberRemovalError("");
          }}
          onConfirm={removeMember}
        />
      ) : null}
    </div>
  );
}
