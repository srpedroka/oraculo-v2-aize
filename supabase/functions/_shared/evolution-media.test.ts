import { describe, expect, it } from "vitest";
import { buildEvolutionMediaAttempts } from "./evolution-media.ts";

describe("download de mídia da Evolution", () => {
  const source = {
    rawMessage: { audioMessage: { mimetype: "audio/ogg", mediaKey: "ephemeral" } },
    rawData: { message: { audioMessage: { mimetype: "audio/ogg" } } },
    messageId: "message-1",
    key: { id: "message-1", remoteJid: "5500000000000@s.whatsapp.net", fromMe: false },
    mediaKey: "ephemeral",
    directPath: "/v/t62/example",
    mimeType: "audio/ogg",
    kind: "audio" as const,
  };

  it("prioriza a rota atual da Evo Go com a mensagem original", () => {
    const attempts = buildEvolutionMediaAttempts("https://evo.example", "oraculo", source);

    expect(attempts[0]).toEqual({
      endpoint: "https://evo.example/message/downloadmedia",
      body: { message: source.rawMessage },
    });
    expect(attempts.filter((attempt) => attempt.endpoint.endsWith("/message/downloadmedia"))).toHaveLength(1);
  });

  it("mantém fallbacks legados depois da rota atual", () => {
    const attempts = buildEvolutionMediaAttempts("https://evo.example", "oraculo", source);
    const endpoints = attempts.map((attempt) => attempt.endpoint);

    expect(endpoints).toContain("https://evo.example/message/downloadimage");
    expect(endpoints).toContain("https://evo.example/chat/getBase64FromMediaMessage/oraculo");
    expect(endpoints.indexOf("https://evo.example/message/downloadmedia")).toBeLessThan(
      endpoints.indexOf("https://evo.example/message/downloadimage"),
    );
  });
});
