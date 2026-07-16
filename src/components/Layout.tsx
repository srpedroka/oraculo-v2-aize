import { Menu } from "lucide-react";
import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAppState } from "../state/store";
import { OraclePanel } from "./OraclePanel";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui/Button";
import { DataNoticeBanner } from "../features/privacy/DataNoticeBanner";

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm font-medium text-text-secondary">Carregando tela...</span>
    </div>
  );
}

export function Layout() {
  const { state, dispatch } = useAppState();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg text-text sm:flex">
      <Sidebar />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 sm:hidden">
        <div className="min-w-0 flex-1 pr-14">
          <p className="truncate text-sm font-bold text-text">ORÁCULO</p>
          <p className="truncate text-xs text-text-tertiary">
            {state.organization?.name}
            {state.organization?.subtitle ? ` · ${state.organization.subtitle}` : ""}
          </p>
        </div>
        <Button className="shrink-0" variant="quiet" size="icon" icon={Menu} onClick={() => dispatch({ type: "toggle_mobile_nav" })} aria-label="Abrir menu" />
      </header>

      <main className="min-w-0 flex-1">
        <DataNoticeBanner />
        <div key={location.pathname} className="animate-page-in mx-auto w-full max-w-7xl px-4 py-6 motion-reduce:animate-none sm:px-6 sm:py-8 lg:px-8">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <OraclePanel />
    </div>
  );
}
