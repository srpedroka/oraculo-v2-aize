import {
  BarChart3,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Save,
  Settings,
  Target,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/store";
import { Button } from "./ui/Button";

const COMPACT_WIDTH = 72;

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/estrategico", label: "Plano Estratégico", icon: Target },
  { to: "/planos-trimestrais", label: "Planos Trimestrais", icon: Waypoints },
  { to: "/areas", label: "Áreas", icon: Users },
  { to: "/execucao", label: "Execução Viva", icon: PlayCircle },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const inertItems = [
  { label: "Analytics", icon: BarChart3 },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "O";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizePhone(value: string) {
  const startsWithPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${startsWithPlus ? "+" : ""}${digits}`;
}

function isValidInternationalPhone(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(value);
}

function getAccountErrorMessage(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "23505" || candidate.message?.includes("profiles_phone_unique_idx")) {
    return "Este celular já está cadastrado em outra conta.";
  }
  if (candidate.code === "23514" || candidate.message?.includes("profiles_phone_international_format")) {
    return "Use o formato internacional, por exemplo +5546999990000.";
  }
  return "Não foi possível salvar a conta agora.";
}

export function Sidebar() {
  const { state, dispatch, session, signOut, updateProfile } = useAppState();
  const [dragging, setDragging] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const collapsed = state.ui.sidebarCollapsed;
  const width = collapsed ? COMPACT_WIDTH : state.ui.sidebarWidth;
  const currentProfile = state.currentProfile ?? state.currentMembership?.profile ?? null;
  const accountEmail = currentProfile?.email ?? session?.user.email ?? "";
  const accountDisplayName = currentProfile?.fullName || accountEmail || "Conta";
  const accountDisplayPhone = currentProfile?.phone || "Celular não cadastrado";
  const accountInitials = getInitials(accountDisplayName);

  useEffect(() => {
    if (!dragging) return;

    function handleMove(event: MouseEvent) {
      dispatch({ type: "set_sidebar_width", width: event.clientX });
    }

    function handleUp() {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dispatch, dragging]);

  useEffect(() => {
    setAccountName(currentProfile?.fullName ?? accountEmail);
    setAccountPhone(currentProfile?.phone ?? "");
    setAccountError(null);
    setAccountSaved(false);
  }, [accountEmail, currentProfile?.fullName, currentProfile?.phone]);

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (collapsed) {
      dispatch({ type: "toggle_sidebar" });
    }
    setDragging(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = accountPhone.trim();

    if (phone && !isValidInternationalPhone(phone)) {
      setAccountError("Use o formato internacional, por exemplo +5546999990000.");
      setAccountSaved(false);
      return;
    }

    setAccountSaving(true);
    setAccountError(null);
    setAccountSaved(false);

    try {
      await updateProfile({
        fullName: accountName.trim(),
        phone: phone || null,
      });
      setAccountSaved(true);
    } catch (error) {
      setAccountError(getAccountErrorMessage(error));
    } finally {
      setAccountSaving(false);
    }
  }

  return (
    <aside
      className="relative hidden min-h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-200 sm:flex sm:flex-col"
      style={{ width }}
    >
      <div className="flex h-24 items-start justify-between px-5 pt-7">
        <div className="min-w-0 overflow-hidden">
          <div className="text-[21px] font-bold leading-none tracking-normal text-[#1D2A31]" title={collapsed ? "Ad astra per aspera" : undefined}>
            {collapsed ? "O" : "ORÁCULO"}
          </div>
          {!collapsed ? (
            <div className="mt-1 whitespace-nowrap text-[9px] font-medium italic leading-none tracking-[0.16em] text-[#8C9096]/80">
              Ad astra per aspera
            </div>
          ) : null}
        </div>
        <Button
          variant="quiet"
          size="icon"
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          onClick={() => dispatch({ type: "toggle_sidebar" })}
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          className="mt-[-6px]"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              [
                "group flex h-12 items-center gap-3 rounded-xl text-[15px] font-medium transition",
                collapsed ? "justify-center px-0" : "px-4",
                isActive ? "bg-[#ECECEF] text-text" : "text-[#2E2E33] hover:bg-[#F0F0F2]",
              ].join(" ")
            }
          >
            <item.icon className="h-5 w-5 shrink-0 text-text-secondary group-hover:text-text" />
            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            ) : null}
          </NavLink>
        ))}

        <div className="my-3 h-px bg-border" />

        {inertItems.map((item) => (
          <button
            key={item.label}
            type="button"
            title="Em breve"
            className={[
              "flex h-12 cursor-default items-center gap-3 rounded-xl text-[15px] font-medium text-text-tertiary",
              collapsed ? "justify-center px-0" : "px-4",
            ].join(" ")}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </button>
        ))}
      </nav>

      <div className="relative space-y-3 p-4">
        {!collapsed ? (
          <div className="rounded-2xl border border-border bg-[#FAFAFB] p-2">
            {state.organizations.length > 1 ? (
              <label className="flex items-center gap-2">
                <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                <span className="sr-only">Empresa ativa</span>
                <select
                  value={state.activeOrgId ?? ""}
                  onChange={(event) => dispatch({ type: "set_active_org", orgId: event.target.value })}
                  className="h-8 min-w-0 flex-1 rounded-[10px] border border-transparent bg-transparent px-1 text-sm font-medium text-text"
                >
                  {state.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                      {organization.subtitle ? ` / ${organization.subtitle}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex h-8 items-center gap-2 px-1">
                <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                <p className="min-w-0 truncate text-sm font-medium text-text">
                  {state.organization?.name}
                  {state.organization?.subtitle ? ` / ${state.organization.subtitle}` : ""}
                </p>
              </div>
            )}
          </div>
        ) : null}

        <button
          type="button"
          title={collapsed ? "Conta" : undefined}
          onClick={() => {
            if (collapsed) dispatch({ type: "toggle_sidebar" });
            setAccountOpen((current) => !current);
          }}
          className={[
            "flex w-full items-center gap-3 rounded-2xl border border-transparent p-2 text-left transition hover:border-border hover:bg-[#FAFAFB]",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECECEF] text-xs font-semibold text-text">
            {accountInitials}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-[#30D158]" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{accountDisplayName}</p>
              <p className="truncate text-xs text-text-secondary">{accountDisplayPhone}</p>
            </div>
          ) : null}
        </button>

        {accountOpen ? (
          <div
            className={[
              "absolute z-40 rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_50px_rgba(0,0,0,0.16)]",
              collapsed ? "bottom-4 left-[calc(100%+12px)] w-80" : "bottom-28 left-4 right-4",
            ].join(" ")}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Conta</p>
                <p className="truncate text-xs text-text-secondary">{accountEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-[#F0F0F2] hover:text-text"
                aria-label="Fechar conta"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveAccount} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">Nome</span>
                <input
                  value={accountName}
                  onChange={(event) => {
                    setAccountName(event.target.value);
                    setAccountSaved(false);
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">Email</span>
                <input
                  value={accountEmail}
                  readOnly
                  className="h-10 w-full rounded-xl border border-border bg-[#FAFAFB] px-3 text-sm text-text-secondary"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">Celular</span>
                <input
                  value={accountPhone}
                  onChange={(event) => {
                    setAccountPhone(normalizePhone(event.target.value));
                    setAccountSaved(false);
                  }}
                  placeholder="+5546999990000"
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                />
              </label>

              {accountSaved ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-[#1D7A3E]">
                  <Check className="h-3.5 w-3.5" />
                  Conta salva.
                </p>
              ) : null}
              {accountError ? <p className="text-xs leading-5 text-[#B42318]">{accountError}</p> : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" size="sm" icon={Save} disabled={accountSaving}>
                  {accountSaving ? "Salvando..." : "Salvar conta"}
                </Button>
                <Button variant="ghost" size="sm" icon={LogOut} onClick={() => void signOut()}>
                  Sair
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <button
          type="button"
          onMouseDown={startResize}
          className="absolute right-[-5px] top-0 h-full w-2 cursor-col-resize bg-transparent transition hover:bg-accent/10"
          aria-label="Redimensionar barra lateral"
        >
          <span className="sr-only">Redimensionar barra lateral</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dispatch({ type: "toggle_sidebar" })}
          className="absolute right-[-12px] top-7 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-card"
          aria-label="Expandir barra lateral"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {!collapsed ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "toggle_sidebar" })}
          className="absolute right-[-12px] top-7 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-card"
          aria-label="Recolher barra lateral"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
    </aside>
  );
}
