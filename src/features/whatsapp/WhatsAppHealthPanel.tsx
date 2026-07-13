import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Copy,
  Clock3,
  RefreshCw,
  RotateCcw,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { loadWhatsAppHealth, retryWhatsAppDeadItem, sendWhatsAppHealthTest } from "./api";
import type { WhatsAppConnectionState, WhatsAppHealthAlert, WhatsAppHealthStatus } from "./types";

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem registro";
}

function connectionLabel(value: WhatsAppConnectionState) {
  if (value === "connected") return "Conectado";
  if (value === "connecting") return "Conectando";
  if (value === "disconnected") return "Desconectado";
  return "Não confirmado";
}

function connectionIcon(value: WhatsAppConnectionState) {
  if (value === "connected") return <Wifi className="h-4 w-4 text-emerald-600" />;
  if (value === "disconnected") return <WifiOff className="h-4 w-4 text-red-600" />;
  return <Activity className="h-4 w-4 text-amber-600" />;
}

function alertClass(tone: WhatsAppHealthAlert["tone"]) {
  if (tone === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function overallStatus(data: WhatsAppHealthStatus) {
  if (data.alerts.some((alert) => alert.tone === "critical")) return { label: "Atenção", className: "border-red-200 bg-red-50 text-red-700" };
  if (data.alerts.some((alert) => alert.tone === "warning")) return { label: "Verificar", className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Operando", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export function WhatsAppHealthPanel({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const queryKey = ["whatsapp-health", orgId];
  const healthQuery = useQuery({
    queryKey,
    queryFn: () => loadWhatsAppHealth(orgId),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const testMutation = useMutation({
    mutationFn: () => sendWhatsAppHealthTest(orgId),
    onSuccess: refresh,
  });
  const retryMutation = useMutation({
    mutationFn: ({ type, id }: { type: "inbound" | "outbound"; id: string }) => retryWhatsAppDeadItem(orgId, type, id),
    onSuccess: refresh,
  });

  function retry(type: "inbound" | "outbound", id: string) {
    if (!window.confirm("Reprocessar este item? Uma resposta pode ser enviada novamente pelo WhatsApp.")) return;
    retryMutation.mutate({ type, id });
  }

  const data = healthQuery.data;
  const status = data ? overallStatus(data) : null;
  const actionError = testMutation.error ?? retryMutation.error;

  async function copyWebhookUrl(value: string) {
    await navigator.clipboard.writeText(value);
    setWebhookUrlCopied(true);
    window.setTimeout(() => setWebhookUrlCopied(false), 2_000);
  }

  return (
    <section className="mt-6 border-t border-border pt-5" aria-labelledby="whatsapp-health-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h3 id="whatsapp-health-title" className="text-sm font-semibold text-text">Saúde do WhatsApp</h3>
            <p className="mt-1 text-xs text-text-tertiary">Atualizado {dateTime(data?.checkedAt ?? null)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status ? <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span> : null}
          <Button
            size="icon"
            variant="quiet"
            icon={RefreshCw}
            loading={healthQuery.isFetching}
            onClick={() => void healthQuery.refetch()}
            aria-label="Atualizar saúde do WhatsApp"
            title="Atualizar"
          />
        </div>
      </div>

      {healthQuery.isLoading ? (
        <p className="mt-5 text-sm text-text-secondary">Consultando WhatsApp...</p>
      ) : healthQuery.isError ? (
        <p role="alert" className="mt-5 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {healthQuery.error instanceof Error ? healthQuery.error.message : "Não foi possível consultar o WhatsApp."}
        </p>
      ) : data ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Conexão</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text">
                {connectionIcon(data.connection)} {connectionLabel(data.connection)}
              </p>
            </div>
            <div className="min-w-0 border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Último evento</p>
              <p className="mt-1 truncate text-sm font-semibold text-text" title={dateTime(data.lastEventAt)}>{dateTime(data.lastEventAt)}</p>
            </div>
            <div className="min-w-0 border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Último envio confirmado</p>
              <p className="mt-1 truncate text-sm font-semibold text-text" title={dateTime(data.lastSentAt)}>{dateTime(data.lastSentAt)}</p>
            </div>
            <div className="min-w-0 border-l-2 border-border pl-3">
              <p className="text-xs font-medium text-text-tertiary">Fila</p>
              <p className="mt-1 text-sm font-semibold text-text">{data.queue.pendingInbound + data.queue.pendingOutbound} pendente(s)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                {data.webhook.configured ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleOff className="h-4 w-4 text-red-600" />}
                Webhook {data.webhook.configured ? data.webhookSource === "traffic" ? "confirmado pelo tráfego" : "correto" : "não confirmado"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" /> {data.failuresLastHour}/{data.attemptsLastHour} falhas na última hora
              </span>
            </div>
            <Button icon={Send} loading={testMutation.isPending} disabled={!data.configured || !data.enabled} onClick={() => testMutation.mutate()}>
              Enviar teste
            </Button>
          </div>

          <div className="min-w-0 border-t border-border pt-4">
            <p className="text-xs font-medium text-text-tertiary">URL esperada do webhook</p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs leading-5 text-text-secondary">{data.expectedWebhookUrl}</code>
              <Button
                size="icon"
                variant="quiet"
                icon={webhookUrlCopied ? CheckCircle2 : Copy}
                onClick={() => void copyWebhookUrl(data.expectedWebhookUrl)}
                aria-label="Copiar URL esperada do webhook"
                title={webhookUrlCopied ? "Copiada" : "Copiar URL"}
              />
            </div>
          </div>

          {data.alerts.length ? (
            <div className="space-y-2" aria-label="Alertas do WhatsApp">
              {data.alerts.map((alert) => (
                <div key={alert.code} className={`flex items-start gap-2 rounded-control border px-3 py-2 ${alertClass(alert.tone)}`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <p className="mt-0.5 text-xs leading-5">{alert.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Nenhum alerta ativo.
            </div>
          )}

          {data.deadItems.length ? (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-text">Falhas recentes</p>
              <div className="mt-3 divide-y divide-border rounded-control border border-border">
                {data.deadItems.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{item.label}</p>
                      <p className="mt-0.5 text-xs text-text-tertiary">{dateTime(item.occurredAt)} · {item.errorCode ?? "falha sem código"}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="quiet"
                      icon={RotateCcw}
                      loading={retryMutation.isPending && retryMutation.variables?.id === item.id}
                      disabled={item.type === "inbound"
                        ? !data.queue.inboundEnabled || !data.queue.workerReady
                        : !data.queue.outboxEnabled || !data.queue.senderReady}
                      onClick={() => retry(item.type, item.id)}
                      aria-label={`Reprocessar ${item.label}`}
                      title={(item.type === "inbound"
                        ? data.queue.inboundEnabled && data.queue.workerReady
                        : data.queue.outboxEnabled && data.queue.senderReady)
                        ? "Reprocessar"
                        : "Processamento durável desligado"}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {testMutation.isSuccess ? <p className="text-sm text-emerald-700">Mensagem de teste enviada ao seu celular.</p> : null}
          {actionError ? <p className="text-sm text-red-700">{actionError instanceof Error ? actionError.message : "A ação não foi concluída."}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
