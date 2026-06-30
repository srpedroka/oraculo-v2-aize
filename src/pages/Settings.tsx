import { FormEvent, useMemo, useState } from "react";
import { Bot, Building2, LogOut, Plus, UserPlus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAppState } from "../state/store";
import type { AiSettings } from "../types";

export function Settings() {
  const { state, dispatch, signOut } = useAppState();
  const [areaName, setAreaName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberAreaId, setMemberAreaId] = useState("");
  const [provider, setProvider] = useState<AiSettings["provider"]>(state.aiSettings?.provider ?? "openai");
  const [model, setModel] = useState(state.aiSettings?.model ?? "gpt-5.4");
  const [apiKey, setApiKey] = useState("");

  const coordinators = useMemo(
    () => state.memberships.filter((membership) => membership.role === "coordinator"),
    [state.memberships],
  );

  function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaName.trim()) return;
    dispatch({ type: "create_area", name: areaName.trim() });
    setAreaName("");
  }

  function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberEmail.trim()) return;
    dispatch({
      type: "create_member",
      email: memberEmail.trim(),
      fullName: memberName.trim(),
      role: "coordinator",
      areaId: memberAreaId || null,
    });
    setMemberEmail("");
    setMemberName("");
    setMemberAreaId("");
  }

  function saveAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "upsert_ai_settings", provider, model: model.trim() || "gpt-5.4", apiKey: apiKey.trim() || undefined });
    setApiKey("");
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
          <div className="mt-4 space-y-2">
            {state.memberships.map((membership) => (
              <div key={membership.id} className="flex items-center justify-between rounded-2xl border border-border bg-[#FAFAFB] p-3">
                <span className="text-sm text-text">{membership.profile?.fullName ?? membership.userId}</span>
                <span className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {membership.role === "owner" ? "Dono" : "Coordenador"}
                </span>
              </div>
            ))}
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
      </div>
    </div>
  );
}
