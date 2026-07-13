import type { WhatsAppInboundKind } from "./whatsapp-queue.ts";

export interface QueuedWhatsAppJob {
  id: string;
  org_id: string;
  correlation_id: string;
  phone: string;
  kind: WhatsAppInboundKind;
  payload: Record<string, unknown>;
  attempt_count: number;
}

function scalar(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export function rebuildWhatsAppEvent(job: QueuedWhatsAppJob, instanceName: string) {
  const messageId = scalar(job.payload, "messageId") || job.id;
  const remoteJid = scalar(job.payload, "remoteJid") || `${job.phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const key = { id: messageId, remoteJid, fromMe: false };

  if (job.kind === "text") {
    return {
      event: "messages.upsert",
      instance: instanceName,
      data: { key, message: { conversation: scalar(job.payload, "text") } },
    };
  }

  if (job.kind === "audio") {
    return {
      event: "messages.upsert",
      instance: instanceName,
      data: {
        key,
        message: { audioMessage: { mimetype: scalar(job.payload, "mimeType") || "audio/ogg" } },
      },
    };
  }

  return {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      key,
      message: {
        documentMessage: {
          mimetype: scalar(job.payload, "mimeType") || "application/octet-stream",
          fileName: scalar(job.payload, "fileName") || "arquivo",
          caption: scalar(job.payload, "caption"),
        },
      },
    },
  };
}

export function sanitizeWhatsAppWorkerError(value: unknown) {
  const source = value instanceof Error ? value.message : String(value ?? "Falha no processamento");
  return source
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|mediaKey|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000) || "Falha no processamento";
}

export function classifyWhatsAppWorkerFailure(status: number, message: string) {
  const normalized = message.toLowerCase();
  if ([401, 403, 404, 405, 413, 415, 422].includes(status)) return { transient: false, code: `http_${status}` };
  if (status === 429 || status >= 500) return { transient: true, code: status === 429 ? "rate_limited" : `http_${status}` };
  if (/não configurad|nao configurad|não autorizado|nao autorizado|payload inválid|tipo de job inválid|não pertence/.test(normalized)) {
    return { transient: false, code: "permanent_configuration" };
  }
  if (/timeout|temporar|network|fetch|conex|connection|econn|429|rate limit|indispon|unavailable|evolution/.test(normalized)) {
    return { transient: true, code: "transient_dependency" };
  }
  return { transient: true, code: status ? `http_${status}` : "processing_error" };
}
