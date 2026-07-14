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

export function WhatsAppSettingsSection({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
  return (
    <>
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
            {scope.whatsappConflict ? <ConflictNotice onReload={scope.reloadWhatsApp} /> : null}
            <label className="flex items-center gap-2 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappEnabled(event.target.checked); }}
                className="h-4 w-4"
              />
              Ativar webhook do WhatsApp
            </label>
            <div className="rounded-xl border border-border bg-[#FAFAFB] p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={weeklyPulseEnabled}
                  onChange={(event) => { scope.markWhatsAppDirty(); setWeeklyPulseEnabled(event.target.checked); }}
                  className="h-4 w-4"
                />
                Pulso semanal leve
              </label>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                Abre uma conversa natural com coordenadores que têm plano ativo. Sem resposta, o Oráculo não insiste.
              </p>
              {weeklyPulseEnabled ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-text-secondary">Dia</span>
                    <select
                      value={weeklyPulseWeekday}
                      onChange={(event) => { scope.markWhatsAppDirty(); setWeeklyPulseWeekday(Number(event.target.value)); }}
                      className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                    >
                      <option value={1}>Segunda</option>
                      <option value={2}>Terça</option>
                      <option value={3}>Quarta</option>
                      <option value={4}>Quinta</option>
                      <option value={5}>Sexta</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-text-secondary">Horário</span>
                    <select
                      value={weeklyPulseHour}
                      onChange={(event) => { scope.markWhatsAppDirty(); setWeeklyPulseHour(Number(event.target.value)); }}
                      className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                    >
                      {[8, 9, 10, 11, 14, 15, 16, 17].map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            <input
              value={whatsappInstanceUrl}
              onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappInstanceUrl(event.target.value); }}
              placeholder="URL da Evolution API"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              value={whatsappInstanceName}
              onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappInstanceName(event.target.value); }}
              placeholder="Nome da instância"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              value={whatsappConnectedNumber}
              onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappConnectedNumber(normalizePhone(event.target.value)); }}
              placeholder="Número conectado, ex: +5546999990000"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={whatsappApiKey}
              onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappApiKey(event.target.value); }}
              placeholder={
                state.whatsappSettings?.hasApiKey ? `Chave Evolution cadastrada ${state.whatsappSettings.keyPreview ?? ""}` : "Chave da Evolution API"
              }
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={whatsappWebhookSecret}
              onChange={(event) => { scope.markWhatsAppDirty(); setWhatsappWebhookSecret(event.target.value); }}
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
            <Button type="submit" icon={MessageCircle} disabled={scope.whatsappConflict}>
              Salvar WhatsApp
            </Button>
          </form>
          {whatsappMessage ? (
            <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {whatsappMessage}
            </p>
          ) : null}
          {state.activeOrgId ? <WhatsAppHealthPanel orgId={state.activeOrgId} /> : null}
        </Card>
      ) : null}
    </>
  );
}
