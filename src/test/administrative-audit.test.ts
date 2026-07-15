import { describe, expect, it } from "vitest";
import { administrativeRequestId, recordAdministrativeAudit, sanitizeAuditData } from "../../supabase/functions/_shared/administrative-audit";

describe("auditoria administrativa sanitizada", () => {
  it("remove segredos e dados pessoais inclusive em objetos aninhados", () => {
    const sanitized = sanitizeAuditData({
      provider: "openai",
      api_key: "sk-segredo",
      apiKey: "sk-segredo-camel",
      webhook_secret: "segredo",
      phone: "+5546999999999",
      phoneNumber: "+5546888888888",
      nested: { password: "senha", model: "gpt-5.4", promptText: "conteúdo privado" },
    });

    expect(sanitized).toEqual({ provider: "openai", nested: { model: "gpt-5.4" } });
    expect(JSON.stringify(sanitized)).not.toContain("segredo");
    expect(JSON.stringify(sanitized)).not.toContain("99999999");
  });

  it("mantém apenas indicadores booleanos seguros sobre credenciais", () => {
    expect(sanitizeAuditData({
      has_api_key: true,
      has_webhook_secret: false,
      api_key_changed: true,
      webhook_secret_changed: false,
      key_preview: "****1234",
    })).toEqual({
      has_api_key: true,
      has_webhook_secret: false,
      api_key_changed: true,
      webhook_secret_changed: false,
    });
  });

  it("reaproveita request ID recebido e gera um quando ausente", () => {
    expect(administrativeRequestId(new Request("https://oraculo.test", { headers: { "x-request-id": "req-123" } }))).toBe("req-123");
    expect(administrativeRequestId(new Request("https://oraculo.test", { headers: { "x-request-id": "pessoa@empresa.com" } }))).toMatch(/^[0-9a-f-]{36}$/);
    expect(administrativeRequestId(new Request("https://oraculo.test"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("mascara contatos em rótulos e recusa identificadores com email", async () => {
    let payload: Record<string, unknown> = {};
    const client = {
      from: () => ({
        upsert: async (value: Record<string, unknown>) => {
          payload = value;
          return { error: null };
        },
      }),
    };

    await recordAdministrativeAudit(client, new Request("https://oraculo.test"), {
      orgId: "org-1",
      actorUserId: null,
      category: "people",
      action: "member_added",
      targetType: "membership",
      targetId: "pessoa@empresa.com",
      targetLabel: "pessoa@empresa.com +55 46 99999-9999",
      requestId: "pessoa@empresa.com",
    });

    expect(payload.target_id).toBeNull();
    expect(payload.target_label).toBe("[contato removido] [contato removido]");
    expect(payload.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
