export type WhatsAppConnectionState = "connected" | "connecting" | "disconnected" | "unknown";

export interface WhatsAppHealthAlert {
  code: string;
  tone: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface WhatsAppDeadItem {
  id: string;
  type: "inbound" | "outbound";
  label: string;
  errorCode: string | null;
  attemptCount: number;
  occurredAt: string;
}

export interface WhatsAppHealthStatus {
  ok: true;
  checkedAt: string;
  configured: boolean;
  enabled: boolean;
  connection: WhatsAppConnectionState;
  connectionErrorCode: string | null;
  webhook: {
    configured: boolean;
    enabled: boolean | null;
    urlMatches: boolean;
    messagesEnabled: boolean | null;
  };
  webhookErrorCode: string | null;
  expectedWebhookUrl: string;
  lastEventAt: string | null;
  lastSentAt: string | null;
  queue: {
    inboundEnabled: boolean;
    outboxEnabled: boolean;
    workerReady: boolean;
    senderReady: boolean;
    pendingInbound: number;
    pendingOutbound: number;
    oldestPendingAt: string | null;
  };
  failuresLastHour: number;
  attemptsLastHour: number;
  deadItems: WhatsAppDeadItem[];
  alerts: WhatsAppHealthAlert[];
}
