import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, Building2, LogOut, MessageCircle, Phone, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";
import type { AiSettings } from "../types";

function normalizePhone(value: string) {
  const startsWithPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${startsWithPlus ? "+" : ""}${digits}`;
}

function isValidInternationalPhone(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(value);
}

export function Settings() {
  const { state, dispatch, signOut } = useAppState();
  const [areaName, setAreaName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberAreaId, setMemberAreaId] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [provider, setProvider] = useState<AiSettings["provider"]>(state.aiSettings?.provider ?? "openai");
  const [model, setModel] = useState(state.aiSettings?.model ?? "gpt-5.4");
  const [apiKey, setApiKey] = useState("");
  const [whatsappInstanceUrl, setWhatsappInstanceUrl] = useState(state.whatsappSettings?.instanceUrl ?? "");
  const [whatsappInstanceName, setWhatsappInstanceName] = useState(state.whatsappSettings?.instanceName ?? "");
  const [whatsappConnectedNumber, setWhatsappConnectedNumber] = useState(state.whatsappSettings?.connectedNumber ?? "");
  const [whatsappApiKey, setWhatsappApiKey] = useState("");
  const [whatsappWebhookSecret, setWhatsappWebhookSecret] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(state.whatsappSettings?.enabled ?? false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const isOwner = state.currentMembership?.role === "owner";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const whatsappWebhookUrl =
    supabaseUrl && state.activeOrgId ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/whatsapp-webhook?orgId=${state.activeOrgId}` : "";

  const coordinators = useMemo(
    () => state.memberships.filter((membership) => membership.role === "coordinator"),
    [state.memberships],
  );

  useEffect(() => {
    setWhatsappInstanceUrl(state.whatsappSettings?.instanceUrl ?? "");
    setWhatsappInstanceName(state.whatsappSettings?.instanceName ?? "");
    setWhatsappConnectedNumber(state.whatsappSettings?.connectedNumber ?? "");
    setWhatsappEnabled(state.whatsappSettings?.enabled ?? false);
  }, [state.whatsappSettings]);

  function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaName.trim()) return;
    dispatch({ type: "create_area", name: areaName.trim() });
    setAreaName("");
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
    });
    setMemberEmail("");
    setMemberName("");
    setMemberPhone("");
    setMemberAreaId("");
    setMemberMessage("Convite solicitado. Com WhatsApp ativo e celular preenchido, a pessoa recebe pelo WhatsApp. Caso contrário, o envio segue por email.");
  }

  function saveAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "upsert_ai_settings", provider, model: model.trim() || "gpt-5.4", apiKey: apiKey.trim() || undefined });
    setApiKey("");
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

      {!isOwner ? (
        <Card>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-text-secondary" />
            <div>
              <p className="text-base font-semibold text-text">Administração restrita ao dono da empresa</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Sua conta pessoal fica no rodapé da barra lateral. Convites, áreas e IA são geridos pelo dono da empresa.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {!isOwner ? null : (
        <>
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
                    <select
                      value={area.coordinatorId ?? ""}
                      onChange={(event) =>
                        dispatch({ type: "update_area", areaId: area.id, name: area.name, coordinatorId: event.target.value || null })
                      }
                      className="h-9 rounded-xl border border-border bg-white px-3 text-sm"
                    >
                      <option value="">Sem coordenador</option>
                      {coordinators.map((membership) => (
                        <option key={membership.id} value={membership.id}>
                          {membership.profile?.fullName ?? membership.userId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
                Nenhuma área ainda.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
            <Button type="submit" icon={UserPlus}>
              Convidar coordenador
            </Button>
          </form>
          {memberMessage ? (
            <p className="mt-3 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm leading-6 text-text-secondary">
              {memberMessage}
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {state.memberships.map((membership) => {
              const linkedArea = state.areas.find((area) => area.coordinatorId === membership.id);
              const isCurrentUser = membership.userId === state.sessionUserId;
              return (
                <div key={membership.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">
                        {membership.profile?.fullName ?? membership.profile?.email ?? membership.userId}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{membership.profile?.email ?? "Email não registrado"}</p>
                      <p className="mt-1 text-xs text-text-tertiary">Área: {linkedArea?.name ?? "Sem área vinculada"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                        {membership.role === "owner" ? "Dono" : "Coordenador"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        disabled={isCurrentUser}
                        onClick={() => dispatch({ type: "remove_member", membershipId: membership.id })}
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

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">IA do Oráculo</h2>
          </div>
          <form onSubmit={saveAi} className="grid gap-3">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as AiSettings["provider"])}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Modelo"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={state.aiSettings?.hasKey ? `Chave cadastrada ${state.aiSettings.keyPreview ?? ""}` : "Chave da API"}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <Button type="submit" icon={Bot}>
              Salvar IA
            </Button>
          </form>
        </Card>

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
      </div>
        </>
      )}
    </div>
  );
}
