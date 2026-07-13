import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Home, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "./ui/Button";
import { reportFrontendError } from "../lib/frontendError";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  occurrenceId: string | null;
  retryKey: number;
}

function occurrenceId() {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `ORC-${suffix}`;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, occurrenceId: null, retryKey: 0 };
  private headingRef = { current: null as HTMLHeadingElement | null };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true, occurrenceId: occurrenceId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(JSON.stringify({
      level: "error",
      function: "frontend",
      operation: "render",
      status: "error",
      errorCode: error.name || "RENDER_ERROR",
      occurrenceId: this.state.occurrenceId,
      component: info.componentStack?.trim().split("\n")[0]?.slice(0, 120) || null,
    }));
    if (this.state.occurrenceId) void reportFrontendError(this.state.occurrenceId, error.name || "RENDER_ERROR").catch(() => undefined);
  }

  componentDidMount() {
    if (this.state.failed) this.headingRef.current?.focus();
  }

  componentDidUpdate(_: Props, previousState: State) {
    if (!previousState.failed && this.state.failed) this.headingRef.current?.focus();
  }

  private retry = () => {
    if (import.meta.env.DEV) window.sessionStorage.removeItem("oraculo.e2e.renderError");
    this.setState((state) => ({ failed: false, occurrenceId: null, retryKey: state.retryKey + 1 }));
  };

  private reload = () => window.location.reload();

  render() {
    if (!this.state.failed) return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;

    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-text">
        <section className="w-full max-w-lg rounded-card border border-border bg-surface p-6 shadow-card" role="alert" aria-labelledby="app-error-title">
          <p className="text-sm font-bold text-[#1D2A31]">ORÁCULO</p>
          <h1 id="app-error-title" ref={(node) => { this.headingRef.current = node; }} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
            Não foi possível mostrar esta tela
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Seus dados continuam salvos. Tente abrir a tela novamente ou volte ao Dashboard.
          </p>
          <p className="mt-4 text-xs text-text-secondary">
            Código da ocorrência: <code className="font-semibold text-text">{this.state.occurrenceId}</code>
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button icon={RotateCcw} onClick={this.retry}>Tentar novamente</Button>
            <Button variant="ghost" icon={RefreshCw} onClick={this.reload}>Recarregar</Button>
            <a href="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-border px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white">
              <Home className="h-4 w-4" aria-hidden="true" /> Dashboard
            </a>
          </div>
        </section>
      </main>
    );
  }
}
