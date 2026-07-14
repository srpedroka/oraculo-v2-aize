import {
  Activity,
  AlertCircle,
  Archive,
  Bot,
  Building2,
  CheckCircle2,
  DollarSign,
  Globe,
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
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConflictNotice } from "../../components/ConflictNotice";
import { OrganizationBackupCard } from "../backups/OrganizationBackupCard";
import { AreaArchiveDialog } from "../areas/AreaArchiveDialog";
import { MemberRemovalDialog } from "../members/MemberRemovalDialog";
import { CompanyDangerZone } from "../lifecycle/CompanyDangerZone";
import { MfaSecurityCard } from "../security/MfaSecurityCard";
import { AiControlsCard } from "../ai/AiControlsCard";
import { WhatsAppHealthPanel } from "../whatsapp/WhatsAppHealthPanel";
import { OperationalHealthPanel } from "../health/OperationalHealthPanel";
import { findModelPricing, modelOptionsForProvider } from "../../lib/aiPricing";
import { formatDate } from "../../lib/format";
import type { AiFunction, AiProvider, MembershipRole, OrgTonePreset } from "../../types";
import type { SettingsController } from "./use-settings-controller";
import {
  AI_FUNCTIONS,
  CUSTOM_MODEL_VALUE,
  DEFAULT_MODEL_BY_PROVIDER,
  PROVIDERS,
  TONE_PRESETS,
  checkedAtLabel,
  formatNumber,
  formatUsd,
  functionLabel,
  membershipRoleLabel,
  normalizePhone,
  providerLabel,
  statusClasses,
  statusLabel,
} from "./settings-shared";

export function AiSettingsSection({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, usageHasMore, usageLoadingMore, loadMoreUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
  return (
    <>
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
              { id: "limites", label: "Limites" },
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
                            scope.editAiFunctionDraft(item.value, {
                              provider: nextProvider,
                              model: DEFAULT_MODEL_BY_PROVIDER[nextProvider],
                            });
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
                            scope.editAiFunctionDraft(item.value, {
                              ...draft,
                              model: nextModel === CUSTOM_MODEL_VALUE ? "" : nextModel,
                            });
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
                              scope.editAiFunctionDraft(item.value, { ...draft, model: event.target.value });
                              setAiMessage("");
                            }}
                            placeholder="Id do modelo personalizado"
                            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
                            aria-label={`Id personalizado para ${item.title}`}
                          />
                        ) : null}
                        {scope.aiFunctionConflict[item.value] ? (
                          <ConflictNotice onReload={() => scope.reloadAiFunction(item.value)} />
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
                              disabled={savingFunction === item.value || scope.aiFunctionConflict[item.value]}
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
            <p role={aiMessageTone && aiMessageTone !== "ok" ? "alert" : "status"} aria-live="polite" className={["mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-6", statusClasses(aiMessageTone)].join(" ")}>
              {aiMessageTone === "ok" ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-1 h-4 w-4 shrink-0" />}
              {aiMessage}
            </p>
          ) : null}
          {iaTab === "limites" && state.activeOrgId ? <AiControlsCard orgId={state.activeOrgId} /> : null}
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
              <p className="mt-1 text-xs text-text-tertiary">{usageSummary.calls} chamadas carregadas</p>
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
              {usageHasMore ? (
                <Button variant="ghost" className="w-full" loading={usageLoadingMore} onClick={() => loadMoreUsage()}>
                  Carregar mais uso
                </Button>
              ) : null}
            </div>
          ) : null}
          </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
