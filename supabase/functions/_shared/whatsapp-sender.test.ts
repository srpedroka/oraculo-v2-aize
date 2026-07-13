import { describe, expect, it } from "vitest";
import { WhatsAppSendError } from "./whatsapp.ts";
import { classifyWhatsAppSenderFailure, sanitizeWhatsAppSenderError } from "./whatsapp-sender.ts";

describe("whatsapp sender", () => {
  it("classifica timeout, 429 e 5xx como transitórios", () => {
    expect(classifyWhatsAppSenderFailure(new WhatsAppSendError("timeout"))).toMatchObject({ transient: true, httpStatus: null });
    expect(classifyWhatsAppSenderFailure(new WhatsAppSendError("limite", 429, 45))).toMatchObject({
      transient: true,
      code: "evolution_rate_limit",
      retryAfterSeconds: 45,
    });
    expect(classifyWhatsAppSenderFailure(new WhatsAppSendError("falha", 503))).toMatchObject({ transient: true });
  });

  it("classifica erros 4xx permanentes", () => {
    expect(classifyWhatsAppSenderFailure(new WhatsAppSendError("inválido", 400))).toMatchObject({
      transient: false,
      code: "evolution_http_400",
    });
  });

  it("remove URL, credencial, conteúdo longo e controles do erro", () => {
    const sanitized = sanitizeWhatsAppSenderError(
      new Error(`POST https://evo.invalid/send apikey=segredo ${"A".repeat(100)}\u0000`),
    );
    expect(sanitized).not.toMatch(/https?:\/\/|segredo|A{80}|\u0000/);
  });
});
