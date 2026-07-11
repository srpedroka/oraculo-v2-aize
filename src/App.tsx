import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { isSupabaseConfigured } from "./lib/supabase";
import { AreaDetail } from "./pages/AreaDetail";
import { Areas } from "./pages/Areas";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { DocumentPrint } from "./pages/DocumentPrint";
import { Documents } from "./pages/Documents";
import { Execution } from "./pages/Execution";
import { Onboarding } from "./pages/Onboarding";
import { OperationalArchive } from "./pages/OperationalArchive";
import { PasswordRecovery } from "./pages/PasswordRecovery";
import { QuarterlyPlans } from "./pages/QuarterlyPlans";
import { Settings } from "./pages/Settings";
import { Strategic } from "./pages/Strategic";
import { useAppState } from "./state/store";

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 text-text">
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm font-medium text-text-secondary shadow-card">
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
  return <AppRoutes />;
}
