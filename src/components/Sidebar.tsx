import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Home,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Settings,
  Target,
  Users,
  Waypoints,
} from "lucide-react";
import { MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/store";
import { Button } from "./ui/Button";

const COMPACT_WIDTH = 72;

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/estrategico", label: "Plano Estratégico", icon: Target },
  { to: "/planos-trimestrais", label: "Planos Trimestrais", icon: Waypoints },
  { to: "/departamentos", label: "Departamentos", icon: Users },
  { to: "/execucao", label: "Execução Viva", icon: PlayCircle },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, badge: "Prévia" },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const inertItems = [
  { label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const { state, dispatch } = useAppState();
  const [dragging, setDragging] = useState(false);
  const collapsed = state.ui.sidebarCollapsed;
  const width = collapsed ? COMPACT_WIDTH : state.ui.sidebarWidth;

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

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (collapsed) {
      dispatch({ type: "toggle_sidebar" });
    }
    setDragging(true);
  }

  return (
    <aside
      className="relative hidden min-h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-200 sm:flex sm:flex-col"
      style={{ width }}
    >
      <div className="flex h-24 items-start justify-between px-5 pt-7">
        <div className="min-w-0 overflow-hidden">
          <div className="text-[21px] font-bold leading-none tracking-normal text-[#1D2A31]">
            {collapsed ? "O" : "ORÁCULO"}
          </div>
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
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-[10px] bg-[#ECECEF] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                    {item.badge}
                  </span>
                ) : null}
              </>
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

      <div className="p-4">
        <div className={["flex items-center gap-3", collapsed ? "justify-center" : ""].join(" ")}>
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECECEF] text-sm font-semibold text-text">
            G
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-[#30D158]" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {state.organization?.name}
                {state.organization?.subtitle ? ` / ${state.organization.subtitle}` : ""}
              </p>
            </div>
          ) : null}
        </div>
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
