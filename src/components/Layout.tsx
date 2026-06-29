import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAppState } from "../state/store";
import { OraclePanel } from "./OraclePanel";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui/Button";

export function Layout() {
  const { state, dispatch } = useAppState();

  return (
    <div className="min-h-screen bg-bg text-text sm:flex">
      <Sidebar />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 sm:hidden">
        <div>
          <p className="text-sm font-bold text-text">ORÁCULO</p>
          <p className="text-xs text-text-tertiary">
            {state.organization?.name}
            {state.organization?.subtitle ? ` · ${state.organization.subtitle}` : ""}
          </p>
        </div>
        <Button variant="quiet" size="icon" icon={Menu} onClick={() => dispatch({ type: "toggle_sidebar" })} aria-label="Menu" />
      </header>

      <main className="min-w-0 flex-1 transition-[width] duration-200">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <OraclePanel />
    </div>
  );
}
