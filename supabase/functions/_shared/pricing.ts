import type { Provider } from "./model.ts";

interface ModelPricing {
  provider: Provider;
  model: string;
  inputTokenPriceUsdPerMillion: number;
  outputTokenPriceUsdPerMillion: number;
  source: string;
}

const MODEL_PRICING_CATALOG: ModelPricing[] = [
  {
    provider: "moonshot",
    model: "kimi-k2.7-code",
    inputTokenPriceUsdPerMillion: 0.95,
    outputTokenPriceUsdPerMillion: 4,
    source: "https://platform.kimi.ai/docs/pricing/chat-k27-code",
  },
  {
    provider: "moonshot",
    model: "kimi-k2.7-code-highspeed",
    inputTokenPriceUsdPerMillion: 1.9,
    outputTokenPriceUsdPerMillion: 8,
    source: "https://platform.kimi.ai/docs/pricing/chat-k27-code",
  },
];

export function resolveKnownPricing(provider: Provider, model: string) {
  const normalizedModel = model.trim().toLowerCase();
  return MODEL_PRICING_CATALOG.find((item) => item.provider === provider && item.model.toLowerCase() === normalizedModel) ?? null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchKimiK27Pricing(model: string): Promise<ModelPricing | null> {
  const source = "https://platform.kimi.ai/docs/pricing/chat-k27-code";
  const response = await fetch(`${source}.md`);
  if (!response.ok) return null;

  const markdown = await response.text();
  const pattern = new RegExp(
    `\\["${escapeRegex(model)}",\\s*"1M tokens",\\s*<>\\{"\\$"\\}([0-9.]+)</>,\\s*<>\\{"\\$"\\}([0-9.]+)</>,\\s*<>\\{"\\$"\\}([0-9.]+)</>`,
    "i",
  );
  const match = markdown.match(pattern);
  if (!match) return null;

  return {
    provider: "moonshot",
    model,
    inputTokenPriceUsdPerMillion: Number(match[2]),
    outputTokenPriceUsdPerMillion: Number(match[3]),
    source,
  };
}

export async function resolveModelPricing(provider: Provider, model: string) {
  const normalizedModel = model.trim().toLowerCase();
  if (provider === "moonshot" && normalizedModel.startsWith("kimi-k2.7-code")) {
    const livePricing = await fetchKimiK27Pricing(normalizedModel).catch(() => null);
    if (livePricing) return livePricing;
  }

  return resolveKnownPricing(provider, model);
}
