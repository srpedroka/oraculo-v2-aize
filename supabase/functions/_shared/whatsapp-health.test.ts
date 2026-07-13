import { describe, expect, it } from "vitest";
import {
  parseEvolutionConnectionState,
  parseEvolutionWebhookState,
  safeEvolutionBaseUrl,
  safeEvolutionError,
  shouldAlertSilentWebhook,
  webhookUrlMatches,
} from "./whatsapp-health.ts";

const expected = "https://project.supabase.co/functions/v1/whatsapp-webhook?orgId=11111111-1111-1111-1111-111111111111";

describe("saúde do WhatsApp", () => {
  it("normaliza estados oficiais e variantes do Evo Go", () => {
    expect(parseEvolutionConnectionState({ instance: { state: "open" } })).toBe("connected");
    expect(parseEvolutionConnectionState({ instance: { status: "connecting" } })).toBe("connecting");
    expect(parseEvolutionConnectionState({ state: "close" })).toBe("disconnected");
    expect(parseEvolutionConnectionState({})).toBe("unknown");
  });

  it("recusa destinos internos na consulta server-side", () => {
    expect(safeEvolutionBaseUrl("https://143-95-217-64.sslip.io")?.hostname).toBe("143-95-217-64.sslip.io");
    expect(safeEvolutionBaseUrl("http://127.0.0.1:8080")).toBeNull();
    expect(safeEvolutionBaseUrl("http://169.254.169.254/latest")).toBeNull();
    expect(safeEvolutionBaseUrl("http://service.internal")).toBeNull();
  });

  it("compara o webhook sem exigir ou expor o token adicional", () => {
    expect(webhookUrlMatches(`${expected}&evoGoToken=segredo-que-nao-deve-voltar`, expected)).toBe(true);
    expect(webhookUrlMatches(expected.replace("11111111", "22222222"), expected)).toBe(false);
    expect(webhookUrlMatches("https://example.com/webhook", expected)).toBe(false);
  });

  it("exige URL, flag e evento de mensagem quando o provedor os informa", () => {
    expect(parseEvolutionWebhookState({ enabled: true, url: expected, events: ["MESSAGES_UPSERT"] }, expected)).toEqual({
      configured: true,
      enabled: true,
      urlMatches: true,
      messagesEnabled: true,
    });
    expect(parseEvolutionWebhookState({ enabled: true, url: expected, events: ["CONNECTION_UPDATE"] }, expected).configured).toBe(false);
    expect(parseEvolutionWebhookState({ webhook: { enabled: false, url: expected } }, expected).configured).toBe(false);
  });

  it("sanitiza falhas sem devolver URL ou corpo remoto", () => {
    expect(safeEvolutionError(new Error("Evolution HTTP 401: https://secret"))).toBe("http_401");
    expect(safeEvolutionError(new Error("network timeout for apikey secret"))).toBe("timeout");
  });

  it("alerta webhook conectado sem evento ou silencioso por 72 horas", () => {
    const now = Date.parse("2026-07-13T12:00:00Z");
    expect(shouldAlertSilentWebhook({ enabled: true, connection: "connected", lastEventAt: null, now })).toBe(true);
    expect(shouldAlertSilentWebhook({ enabled: true, connection: "connected", lastEventAt: "2026-07-10T11:59:59Z", now })).toBe(true);
    expect(shouldAlertSilentWebhook({ enabled: true, connection: "connected", lastEventAt: "2026-07-13T11:00:00Z", now })).toBe(false);
    expect(shouldAlertSilentWebhook({ enabled: false, connection: "connected", lastEventAt: null, now })).toBe(false);
  });
});
