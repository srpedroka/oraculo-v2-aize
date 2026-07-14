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

export function GovernanceSettingsSections({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
  return (
    <>
      {showSection("backups") && state.activeOrgId ? <OrganizationBackupCard orgId={state.activeOrgId} /> : null}

      {showSection("seguranca") && state.activeOrgId ? (
        <div className="space-y-5">
          <MfaSecurityCard orgId={state.activeOrgId} />
          <OperationalHealthPanel orgId={state.activeOrgId} />
        </div>
      ) : null}

      {showSection("tom") ? (
      <Card>
        {scope.toneConflict ? <ConflictNotice onReload={scope.reloadTone} /> : null}
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
                <Button type="button" icon={Save} disabled={savingTone || scope.toneConflict} onClick={() => void saveTone()}>
                  {savingTone ? "Salvando..." : "Salvar tom"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {toneMessage ? (
          <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
            {toneMessage}
          </p>
        ) : null}
      </Card>
      ) : null}

      {showSection("perigo") ? <CompanyDangerZone /> : null}
    </>
  );
}
