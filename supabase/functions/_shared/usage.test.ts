import { describe, expect, it, vi } from "vitest";
import { recordAiUsage } from "./usage";

describe("registro de uso da IA", () => {
  it("atualiza os alertas de orçamento depois de inserir o custo", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await recordAiUsage({
      client: { from, rpc },
      orgId: "org-1",
      provider: "openai",
      model: "model-1",
      channel: "web",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      settings: { input_token_price_usd_per_million: 10, output_token_price_usd_per_million: 20 },
    });
    expect(insert).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("refresh_ai_budget_events", { p_org_id: "org-1" });
  });

  it("não avalia orçamento quando o log de uso falha", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn();
    await recordAiUsage({
      client: { from: () => ({ insert: vi.fn().mockResolvedValue({ error: { message: "db" } }) }), rpc },
      orgId: "org-1",
      provider: "openai",
      model: "model-1",
      channel: "web",
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    });
    expect(rpc).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

