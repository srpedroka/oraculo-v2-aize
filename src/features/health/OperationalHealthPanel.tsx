import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { loadOperationalHealth, openRecoveryIncident, resolveRecoveryIncident } from "./api";
import type { OperationalHealthAlert, RecoveryIncident } from "./types";

const INCIDENT_TYPE_LABELS: Record<RecoveryIncident["incident_type"], string> = {
  data_loss: "Perda de dados",
  service_outage: "Serviço indisponível",
  security: "Segurança",
  recovery_failure: "Falha de recuperação",
};

const INCIDENT_SERVICE_LABELS: Record<RecoveryIncident["affected_services"][number], string> = {
  supabase: "Banco e autenticação",
  frontend: "Aplicativo",
  whatsapp: "WhatsApp",
  ai: "Provedores de IA",
  backup: "Backup interno",
  external_replica: "Cópia externa",
};

function dateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function alertClass(tone: OperationalHealthAlert["tone"]) {
  return tone === "critical" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800";
}

export function OperationalHealthPanel({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [incidentFormOpen, setIncidentFormOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<RecoveryIncident["incident_type"]>("service_outage");
  const [incidentSeverity, setIncidentSeverity] = useState<RecoveryIncident["severity"]>("high");
  const [incidentService, setIncidentService] = useState<RecoveryIncident["affected_services"][number]>("supabase");
  const query = useQuery({
    queryKey: ["operational-health", orgId],
    queryFn: () => loadOperationalHealth(orgId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const data = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["operational-health", orgId] });
  const openIncidentMutation = useMutation({
    mutationFn: () => openRecoveryIncident(orgId, {
      incidentType,
      severity: incidentSeverity,
      affectedServices: [incidentService],
    }),
    onSuccess: () => {
      setIncidentFormOpen(false);
      void refresh();
    },
  });
  const resolveIncidentMutation = useMutation({
    mutationFn: (incidentId: string) => resolveRecoveryIncident(orgId, incidentId),
    onSuccess: () => void refresh(),
  });
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
          <Button size="icon" variant="quiet" icon={ShieldAlert} onClick={() => setIncidentFormOpen((current) => !current)} aria-label="Registrar incidente" title="Registrar incidente" />
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

          {incidentFormOpen ? (
            <div className="border-t border-border pt-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-tertiary">Ocorrência</span>
                  <select value={incidentType} onChange={(event) => setIncidentType(event.target.value as RecoveryIncident["incident_type"])} className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm">
                    {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-tertiary">Severidade</span>
                  <select value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value as RecoveryIncident["severity"])} className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm">
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-tertiary">Serviço principal</span>
                  <select value={incidentService} onChange={(event) => setIncidentService(event.target.value as RecoveryIncident["affected_services"][number])} className="h-10 w-full rounded-control border border-border bg-white px-3 text-sm">
                    {Object.entries(INCIDENT_SERVICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <Button icon={ShieldAlert} loading={openIncidentMutation.isPending} onClick={() => openIncidentMutation.mutate()}>Registrar incidente</Button>
              </div>
            </div>
          ) : null}

          {data.incidents.length ? (
            <div className="space-y-2 border-t border-border pt-4" aria-label="Incidentes em aberto">
              <p className="text-xs font-semibold text-text-tertiary">Incidentes em aberto</p>
              {data.incidents.map((incident) => (
                <div key={incident.id} className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-red-300 pl-3">
                  <div>
                    <p className="text-sm font-semibold text-text">{INCIDENT_TYPE_LABELS[incident.incident_type]}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{INCIDENT_SERVICE_LABELS[incident.affected_services[0]]} · {dateTime(incident.opened_at)}</p>
                  </div>
                  <Button size="sm" variant="ghost" loading={resolveIncidentMutation.isPending} onClick={() => resolveIncidentMutation.mutate(incident.id)}>Marcar resolvido</Button>
                </div>
              ))}
            </div>
          ) : null}

          {openIncidentMutation.isError || resolveIncidentMutation.isError ? (
            <p role="alert" className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(openIncidentMutation.error ?? resolveIncidentMutation.error) instanceof Error
                ? (openIncidentMutation.error ?? resolveIncidentMutation.error)?.message
                : "Não foi possível atualizar o incidente."}
            </p>
          ) : null}

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
