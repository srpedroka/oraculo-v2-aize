import { describe, expect, it } from "vitest";
import { buildWhatsAppFallbackEventKey, sanitizeWhatsAppInboundPayload } from "./whatsapp-queue.ts";

describe("payload mínimo da fila do WhatsApp", () => {
  it("gera fallback determinístico sem expor o texto da mensagem", async () => {
    const receivedAt = new Date("2026-07-13T12:34:45.000Z");
    const first = await buildWhatsAppFallbackEventKey("+5546999999999", "text", "Meta comercial secreta", receivedAt);
    const second = await buildWhatsAppFallbackEventKey("+5546999999999", "text", "Meta comercial secreta", receivedAt);

    expect(first).toBe(second);
    expect(first).toMatch(/^fallback:\+5546999999999:text:2026-07-13T12:34:[a-f0-9]{64}$/);
    expect(first).not.toContain("meta");
    expect(first).not.toContain("comercial");
    expect(first).not.toContain("secreta");
  });

  it("mantém apenas texto e identificador em mensagem textual", () => {
    const payload = sanitizeWhatsAppInboundPayload("text", {
      messageId: "msg-1",
      text: "oi",
      base64: "AAAA",
      mediaKey: "segredo",
      url: "https://temporaria.invalid",
      authorization: "Bearer secreto",
      nested: { webhook_secret: "segredo" },
    });
    expect(payload).toEqual({ messageId: "msg-1", text: "oi" });
  });

  it("mantém somente o localizador mínimo e metadados escalares de mídia", () => {
    const payload = sanitizeWhatsAppInboundPayload("document", {
      messageId: "doc-1",
      remoteJid: "5546999999999@s.whatsapp.net",
      mimeType: "application/pdf",
      fileName: "plano.pdf",
      caption: "Plano mensal",
      base64: "JVBERi0x",
      mediaKey: "chave-temporaria",
      directPath: "/v/t62/...",
      url: "https://temporaria.invalid/documento",
      rawMessage: { documentMessage: { mediaKey: "chave" } },
    });
    expect(payload).toEqual({
      messageId: "doc-1",
      remoteJid: "5546999999999@s.whatsapp.net",
      mimeType: "application/pdf",
      fileName: "plano.pdf",
      caption: "Plano mensal",
    });
    expect(JSON.stringify(payload)).not.toMatch(/base64|mediaKey|directPath|https?:\/\//i);
  });

  it("limita campos grandes antes do banco", () => {
    const payload = sanitizeWhatsAppInboundPayload("audio", {
      messageId: "m".repeat(500),
      fileName: "a".repeat(500),
      caption: "c".repeat(3_000),
    });
    expect(payload.messageId).toHaveLength(300);
    expect(payload.fileName).toHaveLength(240);
    expect(payload.caption).toHaveLength(2_000);
  });
});
