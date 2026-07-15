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
import { OrganizationSettingsSection } from "./OrganizationSettingsSection";
import { PeopleSettingsSection } from "./PeopleSettingsSection";
import { AiSettingsSection } from "./AiSettingsSection";
import { WhatsAppSettingsSection } from "./WhatsAppSettingsSection";
import { GovernanceSettingsSections } from "./GovernanceSettingsSections";
import { PersonalAccountCard } from "../account/PersonalAccountCard";
import { AdministrativeAuditSection } from "./AdministrativeAuditSection";

export function SettingsView({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
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

      {showSection("conta") ? <PersonalAccountCard /> : null}

      <OrganizationSettingsSection scope={scope} />

      <PeopleSettingsSection scope={scope} />

      <AiSettingsSection scope={scope} />

      <WhatsAppSettingsSection scope={scope} />

      <GovernanceSettingsSections scope={scope} />

      {showSection("auditoria") && state.activeOrgId ? <AdministrativeAuditSection orgId={state.activeOrgId} /> : null}

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
