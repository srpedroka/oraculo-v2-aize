import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { loadOperationalHealth } from "./api";
import type { OperationalHealthAlert } from "./types";

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function alertClass(tone: OperationalHealthAlert["tone"]) {
  return tone === "critical" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800";
}

export function OperationalHealthPanel({ orgId }: { orgId: string }) {
  const query = useQuery({
    queryKey: ["operational-health", orgId],
    queryFn: () => loadOperationalHealth(orgId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const data = query.data;
  const status = data?.status === "critical"
    ? { label: "Atenção", className: "border-red-200 bg-red-50 text-red-700" }
    : data?.status === "warning"
      ? { label: "Verificar", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : { label: "Operando", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h2 className="text-base font-semibold text-text">Saúde operacional</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">Aplicativo, WhatsApp, backups, IA e recuperação.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data ? <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span> : null}
          <Button size="icon" variant="quiet" icon={RefreshCw} loading={query.isFetching} onClick={() => void query.refetch()} aria-label="Atualizar saúde operacional" title="Atualizar" />
        </div>
      </div>

      {query.isLoading ? <p className="mt-5 text-sm text-text-secondary">Consultando serviços...</p> : null}
      {query.isError ? (
        <p className="mt-5 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="polite">
          {query.error instanceof Error ? query.error.message : "Não foi possível consultar a saúde operacional."}
        </p>
      ) : null}
      {data ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="border-l-2 border-border pl-3"><p className="text-xs text-text-tertiary">Frontend</p><p className="mt-1 text-sm font-semibold text-text">{data.metrics.frontendOk ? "Disponível" : "Indisponível"}</p></div>
            <div className="border-l-2 border-border pl-3"><p className="text-xs text-text-tertiary">WhatsApp p95</p><p className="mt-1 text-sm font-semibold text-text">{data.metrics.whatsappP95Ms === null ? "Sem amostra" : `${(data.metrics.whatsappP95Ms / 1000).toFixed(1)}s`}</p></div>
            <div className="border-l-2 border-border pl-3"><p className="text-xs text-text-tertiary">Último backup</p><p className="mt-1 text-sm font-semibold text-text">{data.metrics.backupAgeHours === null ? "Sem registro" : `${data.metrics.backupAgeHours.toFixed(1)}h`}</p></div>
            <div className="border-l-2 border-border pl-3"><p className="text-xs text-text-tertiary">Réplica externa</p><p className="mt-1 text-sm font-semibold text-text">{data.metrics.externalBackupAgeHours === null ? "Sem registro" : `${data.metrics.externalBackupAgeHours.toFixed(1)}h`}</p></div>
            <div className="border-l-2 border-border pl-3"><p className="text-xs text-text-tertiary">Custo de IA no mês</p><p className="mt-1 text-sm font-semibold text-text">US$ {data.metrics.aiCostUsd.toFixed(2)}</p></div>
          </div>

          {data.alerts.length ? (
            <div className="space-y-2" aria-label="Alertas operacionais">
              {data.alerts.map((alert) => (
                <div key={alert.code} className={`flex items-start gap-2 rounded-control border px-3 py-2 ${alertClass(alert.tone)}`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><p className="text-sm font-semibold">{alert.title}</p><p className="mt-0.5 text-xs leading-5">{alert.detail}</p></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Nenhum alerta ativo.</div>
          )}
          <p className="text-xs text-text-tertiary">Atualizado {dateTime(data.checkedAt)}</p>
        </div>
      ) : null}
    </Card>
  );
}
