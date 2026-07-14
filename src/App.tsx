import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isSupabaseConfigured } from "./lib/supabase";
import { useAppState } from "./state/store";

const Layout = lazy(() => import("./components/Layout").then((module) => ({ default: module.Layout })));
const AreaDetail = lazy(() => import("./pages/AreaDetail").then((module) => ({ default: module.AreaDetail })));
const Areas = lazy(() => import("./pages/Areas").then((module) => ({ default: module.Areas })));
const Auth = lazy(() => import("./pages/Auth").then((module) => ({ default: module.Auth })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const DocumentPrint = lazy(() => import("./pages/DocumentPrint").then((module) => ({ default: module.DocumentPrint })));
const Documents = lazy(() => import("./pages/Documents").then((module) => ({ default: module.Documents })));
const Execution = lazy(() => import("./pages/Execution").then((module) => ({ default: module.Execution })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((module) => ({ default: module.Onboarding })));
const OperationalArchive = lazy(() => import("./pages/OperationalArchive").then((module) => ({ default: module.OperationalArchive })));
const PasswordRecovery = lazy(() => import("./pages/PasswordRecovery").then((module) => ({ default: module.PasswordRecovery })));
const QuarterlyPlans = lazy(() => import("./pages/QuarterlyPlans").then((module) => ({ default: module.QuarterlyPlans })));
const Settings = lazy(() => import("./pages/Settings").then((module) => ({ default: module.Settings })));
const Strategic = lazy(() => import("./pages/Strategic").then((module) => ({ default: module.Strategic })));

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 text-text">
      <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm font-medium text-text-secondary shadow-card">
        Carregando Oráculo
      </div>
    </main>
  );
}

function MissingConfig() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 text-text">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-card">
        <p className="text-sm font-bold tracking-normal text-[#1D2A31]">ORÁCULO</p>
        <h1 className="mt-3 text-2xl font-semibold text-text">Supabase não configurado</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Configure as variáveis públicas do projeto para ligar a V2 ao banco real.
        </p>
        <pre className="mt-4 overflow-auto rounded-2xl border border-border bg-[#FAFAFB] p-4 text-xs leading-6 text-text-secondary">
{`VITE_SUPABASE_URL=https://bkswkfazkjilwfzwzthz.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key`}
        </pre>
      </div>
    </main>
  );
}

function AppRoutes() {
  const { state, session, passwordRecoveryActive } = useAppState();

  if (import.meta.env.DEV && window.sessionStorage.getItem("oraculo.e2e.renderError") === "1") {
    throw new Error("Falha de renderização controlada pelo E2E");
  }

  if (!isSupabaseConfigured) return <MissingConfig />;
  if (state.loading && !session) return <LoadingScreen />;
  if (!session) {
    return (
      <Routes>
        <Route path="/redefinir-senha" element={<PasswordRecovery />} />
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }
  if (passwordRecoveryActive || window.location.pathname === "/redefinir-senha") return <PasswordRecovery />;
  if (state.loading && !state.organization) return <LoadingScreen />;
  if (!state.organization) return <Onboarding />;

  return (
    <Routes>
      <Route path="/documentos/:documentId/imprimir" element={<DocumentPrint />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/estrategico" element={<Strategic />} />
        <Route path="/planos-trimestrais" element={<QuarterlyPlans />} />
        <Route path="/documentos" element={<Documents />} />
        <Route path="/areas" element={<Areas />} />
        <Route path="/areas/:areaId" element={<AreaDetail />} />
        <Route path="/execucao" element={<Execution />} />
        <Route path="/arquivo" element={<OperationalArchive />} />
        <Route path="/configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppRoutes />
    </Suspense>
  );
}
