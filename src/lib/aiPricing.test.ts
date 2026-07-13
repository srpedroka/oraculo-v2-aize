import { describe, expect, it } from "vitest";
import { MODEL_PRICING_CATALOG, findModelPricing, modelOptionsForProvider } from "./aiPricing";
import { resolveKnownPricing } from "../../supabase/functions/_shared/pricing";

describe("catálogo de modelos e preços", () => {
  it("mantém IDs únicos e preços positivos", () => {
    const keys = MODEL_PRICING_CATALOG.map((item) => `${item.provider}:${item.model.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of MODEL_PRICING_CATALOG) {
      expect(item.inputTokenPriceUsdPerMillion).toBeGreaterThan(0);
      expect(item.outputTokenPriceUsdPerMillion).toBeGreaterThan(0);
      expect(item.source).toMatch(/^https:\/\//);
    }
  });

  it("mantém catálogo do frontend sincronizado com o servidor", () => {
    for (const item of MODEL_PRICING_CATALOG) {
      const server = resolveKnownPricing(item.provider, item.model);
      expect(server, `${item.provider}/${item.model}`).not.toBeNull();
      expect(server?.inputTokenPriceUsdPerMillion).toBe(item.inputTokenPriceUsdPerMillion);
      expect(server?.outputTokenPriceUsdPerMillion).toBe(item.outputTokenPriceUsdPerMillion);
    }
  });

  it("lista todos os provedores e busca sem diferenciar maiúsculas", () => {
    for (const provider of ["openai", "anthropic", "moonshot", "xai"] as const) {
      expect(modelOptionsForProvider(provider).length).toBeGreaterThan(0);
    }
    expect(findModelPricing("xai", " GROK-4.5 ")?.model).toBe("grok-4.5");
    expect(findModelPricing("xai", "inexistente")).toBeNull();
  });
});
