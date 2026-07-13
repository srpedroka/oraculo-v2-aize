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

export function PeopleSettingsSection({ scope }: { scope: SettingsController }) {
  const { organizationName, setOrganizationName, organizationSubtitle, setOrganizationSubtitle, organizationMessage, setOrganizationMessage, areaName, setAreaName, memberEmail, setMemberEmail, memberName, setMemberName, memberPhone, setMemberPhone, memberNotify, setMemberNotify, memberAreaId, setMemberAreaId, memberMessage, setMemberMessage, memberToRemove, setMemberToRemove, memberRemovalBusy, setMemberRemovalBusy, memberRemovalError, setMemberRemovalError, areaToArchive, setAreaToArchive, areaLifecycleBusy, setAreaLifecycleBusy, areaLifecycleError, setAreaLifecycleError, areaMessage, setAreaMessage, providerApiKeys, setProviderApiKeys, aiFunctionDrafts, setAiFunctionDrafts, aiMessage, setAiMessage, aiMessageTone, setAiMessageTone, savingProvider, setSavingProvider, testingProvider, setTestingProvider, savingFunction, setSavingFunction, testingFunction, setTestingFunction, toneDraft, setToneDraft, toneMessage, setToneMessage, savingTone, setSavingTone, whatsappInstanceUrl, setWhatsappInstanceUrl, whatsappInstanceName, setWhatsappInstanceName, whatsappConnectedNumber, setWhatsappConnectedNumber, whatsappApiKey, setWhatsappApiKey, whatsappWebhookSecret, setWhatsappWebhookSecret, whatsappEnabled, setWhatsappEnabled, weeklyPulseEnabled, setWeeklyPulseEnabled, weeklyPulseWeekday, setWeeklyPulseWeekday, weeklyPulseHour, setWeeklyPulseHour, whatsappMessage, setWhatsappMessage, roleSavingId, setRoleSavingId, memberInviteBusyId, setMemberInviteBusyId, memberAreaBusyId, setMemberAreaBusyId, memberEditId, setMemberEditId, memberEditName, setMemberEditName, memberEditPhone, setMemberEditPhone, memberEditBusy, setMemberEditBusy, profileLinksText, setProfileLinksText, profileError, setProfileError, profileResearching, setProfileResearching, profileConfirming, setProfileConfirming, profilePreview, setProfilePreview, activeSection, setActiveSection, iaTab, setIaTab, state, dispatch, signOut, saveAiProviderKey, saveAiFunctionSetting, testAiProviderKey, testAiFunction, saveOrgTone, createOrgTokenRef, isOwner, companyProfile, companyProfileSummary, companyProfileLinks, SECTIONS, visibleSections, currentSection, showSection, supabaseUrl, whatsappWebhookUrl, coordinators, allAreas, ownerCount, impactedMemberAreas, archiveImpact, usageSummary, recentUsage, tonePreview, createOrganization, normalizeProfileLink, parseProfileLinks, researchCompanyProfile, confirmCompanyProfile, createArea, archiveArea, restoreArea, inviteChannelMessage, inviteMember, resendInvite, assignMemberArea, openMemberEdit, saveMemberEdit, changeMemberRole, openMemberRemoval, removeMember, saveProviderKey, testProvider, saveAiFunction, testFunction, selectTonePreset, saveTone, saveWhatsApp } = scope;
  return (
    <>
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
            {memberNotify && !state.whatsappSettings?.enabled ? (
              <p className="text-xs leading-5 text-[#A16207]">Ative o WhatsApp da empresa para convidar.</p>
            ) : null}
            {memberNotify && !memberPhone.trim() ? (
              <p className="text-xs leading-5 text-[#A16207]">Cadastre o celular para convidar pelo WhatsApp.</p>
            ) : null}
            <Button type="submit" icon={UserPlus}>
              {memberNotify ? "Convidar pelo WhatsApp" : "Cadastrar sem avisar"}
            </Button>
          </form>
          {memberMessage ? (
            <p className="mt-3 whitespace-pre-wrap break-all rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {memberMessage}
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {state.memberships.map((membership) => {
              const linkedAreas = allAreas.filter((area) => area.coordinatorId === membership.id);
              const primaryAreaId = state.areas.find((area) => area.coordinatorId === membership.id)?.id ?? "";
              const isCurrentUser = membership.userId === state.sessionUserId;
              const isLastOwner = membership.role === "owner" && ownerCount <= 1;
              const hasEmail = Boolean(membership.profile?.email);
              const editing = memberEditId === membership.id;
              return (
                <div key={membership.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">
                        {membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{membership.profile?.email ?? "Email não registrado"}</p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        Celular: {membership.profile?.phone || "não informado"}
                        {" · "}
                        Áreas: {linkedAreas.length ? linkedAreas.map((area) => area.name).join(", ") : "Sem área vinculada"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={membership.role}
                        disabled={roleSavingId === membership.id || isCurrentUser}
                        onChange={(event) => changeMemberRole(membership.id, event.target.value as MembershipRole)}
                        className="h-8 rounded-[10px] border border-border bg-white px-2.5 text-xs font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Papel de ${membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}`}
                      >
                        {membership.role === "owner" ? <option value="owner">{membershipRoleLabel("owner")}</option> : null}
                        <option value="admin">{membershipRoleLabel("admin")}</option>
                        <option value="coordinator">{membershipRoleLabel("coordinator")}</option>
                      </select>
                      <select
                        value={primaryAreaId}
                        disabled={memberAreaBusyId === membership.id || membership.role === "owner"}
                        onChange={(event) => assignMemberArea(membership, event.target.value)}
                        className="h-8 max-w-[10rem] rounded-[10px] border border-border bg-white px-2.5 text-xs font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Área de ${membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}`}
                        title={membership.role === "owner" ? "Dono não precisa de área de coordenação" : "Vincular área"}
                      >
                        <option value="">Sem área</option>
                        {state.areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                      {!isCurrentUser && hasEmail ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={MessageCircle}
                          loading={memberInviteBusyId === membership.id}
                          disabled={!membership.profile?.phone || !state.whatsappSettings?.enabled}
                          onClick={() => resendInvite(membership)}
                          title={
                            !membership.profile?.phone
                              ? "Cadastre o celular para convidar"
                              : !state.whatsappSettings?.enabled
                                ? "Ative o WhatsApp da empresa para convidar"
                                : "Convidar pelo WhatsApp"
                          }
                        >
                          Convidar pelo WhatsApp
                        </Button>
                      ) : null}
                      {!isCurrentUser && hasEmail ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => (editing ? setMemberEditId(null) : openMemberEdit(membership))}
                          title="Editar nome e celular"
                        >
                          {editing ? "Fechar" : "Editar"}
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
                  {editing ? (
                    <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={memberEditName}
                        onChange={(event) => setMemberEditName(event.target.value)}
                        placeholder="Nome"
                        className="h-9 rounded-xl border border-border bg-white px-3 text-sm"
                      />
                      <input
                        value={memberEditPhone}
                        onChange={(event) => setMemberEditPhone(normalizePhone(event.target.value))}
                        placeholder="+5546999990000"
                        className="h-9 rounded-xl border border-border bg-white px-3 text-sm"
                      />
                      <Button size="sm" loading={memberEditBusy} onClick={() => saveMemberEdit(membership)}>
                        Salvar
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </>
  );
}
