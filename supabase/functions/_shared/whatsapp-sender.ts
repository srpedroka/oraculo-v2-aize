import { WhatsAppSendError } from "./whatsapp.ts";

export interface QueuedWhatsAppOutboxItem {
  id: string;
  org_id: string;
  correlation_id: string;
  destination: string;
  content: string;
  part_index: number;
  part_count: number;
  attempt_count: number;
}

export function sanitizeWhatsAppSenderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Falha no envio");
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:Bearer|apikey|token)\s*[:=]?\s*\S+/gi, "[credencial]")
    .replace(/[A-Za-z0-9+/_=-]{80,}/g, "[conteúdo removido]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 1000) || "Falha no envio";
}

export function classifyWhatsAppSenderFailure(error: unknown) {
  const status = error instanceof WhatsAppSendError ? error.httpStatus : 0;
  const retryAfterSeconds = error instanceof WhatsAppSendError ? error.retryAfterSeconds : null;
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status === 0) {
    return {
      transient: true,
      code: status === 429 ? "evolution_rate_limit" : status === 0 ? "evolution_unavailable" : `evolution_http_${status}`,
      httpStatus: status || null,
      retryAfterSeconds,
    };
  }
  return {
    transient: false,
    code: status ? `evolution_http_${status}` : "send_error",
    httpStatus: status || null,
    retryAfterSeconds: null,
  };
}
