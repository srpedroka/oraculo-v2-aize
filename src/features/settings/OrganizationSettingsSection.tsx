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
import { ReadableText } from "../../components/ui/ReadableText";
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

export function OrganizationSettingsSection({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
  return (
    <>
      {showSection("empresa") ? (
      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
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
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">Perfil da empresa</h2>
          </div>
          <p className="text-sm leading-6 text-text-secondary">
            O Oráculo pesquisa a internet e monta um resumo da empresa que vira contexto permanente das conversas.
          </p>

          {companyProfile && companyProfileSummary && !profilePreview ? (
            <div className="mt-4 rounded-card border border-border bg-surface-muted p-4">
              <ReadableText value={companyProfileSummary} />
              <p className="mt-3 text-xs font-medium text-text-tertiary">
                Atualizado em {formatDate(companyProfile.createdAt)}
              </p>
            </div>
          ) : null}

          {profilePreview ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Prévia do resumo (editável)</span>
                <textarea
                  value={profilePreview.summary}
                  onChange={(event) => setProfilePreview({ ...profilePreview, summary: event.target.value })}
                  rows={8}
                  className="w-full rounded-2xl border border-border bg-white px-3 py-3 text-sm leading-6 text-text"
                />
              </label>
              {profilePreview.sources.length ? (
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="mb-3 text-sm font-medium text-text">Fontes (desmarque as que não quiser guardar)</p>
                  <div className="space-y-2">
                    {profilePreview.sources.map((source, index) => (
                      <label key={`${source.url}-${index}`} className="flex items-start gap-3 rounded-xl border border-border bg-[#FAFAFB] p-3">
                        <input
                          type="checkbox"
                          checked={source.selected}
                          onChange={(event) => {
                            const sources = profilePreview.sources.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, selected: event.target.checked } : item,
                            );
                            setProfilePreview({ ...profilePreview, sources });
                          }}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-text">{source.title || source.url}</span>
                          <span className="mt-0.5 block break-all text-xs text-text-secondary">{source.url}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
                  A pesquisa não retornou fontes citáveis. Você ainda pode editar e confirmar o resumo.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button icon={Save} loading={profileConfirming} disabled={profileConfirming || profileResearching} onClick={confirmCompanyProfile}>
                  Confirmar perfil
                </Button>
                <Button
                  variant="ghost"
                  disabled={profileConfirming || profileResearching}
                  onClick={() => {
                    setProfilePreview(null);
                    setProfileError("");
                  }}
                >
                  Descartar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Links da empresa (opcional, um por linha)</span>
                <textarea
                  value={profileLinksText}
                  onChange={(event) => setProfileLinksText(event.target.value)}
                  rows={3}
                  placeholder={"www.gaam.com.br\nhttps://linkedin.com/company/..."}
                  className="w-full rounded-2xl border border-border bg-white px-3 py-3 text-sm leading-6 text-text"
                />
              </label>
              <Button icon={Globe} loading={profileResearching} disabled={profileResearching || !state.activeOrgId} onClick={researchCompanyProfile}>
                {companyProfile ? "Pesquisar de novo" : "Pesquisar na internet"}
              </Button>
            </div>
          )}

          {profileError ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{profileError}</p>
          ) : null}
        </Card>
        </div>

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
    </>
  );
}
