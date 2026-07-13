import { describe, expect, it } from "vitest";
import { classifyWhatsAppWorkerFailure, rebuildWhatsAppEvent, sanitizeWhatsAppWorkerError } from "./whatsapp-worker.ts";

const baseJob = {
  id: "job-1",
  org_id: "org-1",
  correlation_id: "correlation-1",
  phone: "+5546999999999",
  attempt_count: 1,
};

describe("worker do WhatsApp", () => {
  it("reconstrói texto sem reintroduzir campos brutos", () => {
    const event = rebuildWhatsAppEvent({
      ...baseJob,
      kind: "text",
      payload: { messageId: "msg-1", text: "oi", base64: "não usar" },
    }, "oraculo");
    expect(event).toEqual({
      event: "messages.upsert",
      instance: "oraculo",
      data: {
        key: { id: "msg-1", remoteJid: "5546999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "oi" },
      },
    });
    expect(JSON.stringify(event)).not.toContain("base64");
  });

  it("reconstrói documento somente com metadados mínimos", () => {
    const event = rebuildWhatsAppEvent({
      ...baseJob,
      kind: "document",
      payload: {
        messageId: "doc-1",
        remoteJid: "5546000000000@s.whatsapp.net",
        mimeType: "application/pdf",
        fileName: "plano.pdf",
        caption: "Plano mensal",
        mediaKey: "não usar",
        url: "https://temporaria.invalid",
      },
    }, "oraculo");
    expect(event.data.message).toEqual({
      documentMessage: {
        mimetype: "application/pdf",
        fileName: "plano.pdf",
        caption: "Plano mensal",
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/mediaKey|temporaria/i);
  });

  it("sanitiza URL, bearer e tokens antes de persistir erro", () => {
    const sanitized = sanitizeWhatsAppWorkerError(
      "fetch https://privado.invalid/a?token=abc Authorization=segredo Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ",
    );
    expect(sanitized).not.toContain("privado.invalid");
    expect(sanitized).not.toContain("segredo");
    expect(sanitized).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("separa falha transitória de configuração permanente", () => {
    expect(classifyWhatsAppWorkerFailure(429, "rate limit")).toEqual({ transient: true, code: "rate_limited" });
    expect(classifyWhatsAppWorkerFailure(404, "não configurado")).toEqual({ transient: false, code: "http_404" });
    expect(classifyWhatsAppWorkerFailure(400, "network timeout")).toEqual({ transient: true, code: "transient_dependency" });
  });
});
