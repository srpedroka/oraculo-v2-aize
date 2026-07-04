import type { AiProvider } from "../types";

export interface ModelPricing {
  provider: AiProvider;
  model: string;
  inputTokenPriceUsdPerMillion: number;
  outputTokenPriceUsdPerMillion: number;
  source: string;
  note?: string;
}

export const MODEL_PRICING_CATALOG: ModelPricing[] = [
  {
    provider: "openai",
    model: "gpt-5.4",
    inputTokenPriceUsdPerMillion: 2.5,
    outputTokenPriceUsdPerMillion: 15,
    source: "https://platform.openai.com/docs/pricing",
    note: "Preço standard de short context. Cached input e long context podem ter valores diferentes na tabela oficial.",
  },
  {
    provider: "openai",
    model: "gpt-5.4-mini",
    inputTokenPriceUsdPerMillion: 0.75,
    outputTokenPriceUsdPerMillion: 4.5,
    source: "https://platform.openai.com/docs/pricing",
    note: "Preço standard de short context.",
  },
  {
    provider: "openai",
    model: "gpt-5.4-nano",
    inputTokenPriceUsdPerMillion: 0.2,
    outputTokenPriceUsdPerMillion: 1.25,
    source: "https://platform.openai.com/docs/pricing",
    note: "Preço standard de short context.",
  },
  {
    provider: "moonshot",
    model: "kimi-k2.7-code",
    inputTokenPriceUsdPerMillion: 0.95,
    outputTokenPriceUsdPerMillion: 4,
    source: "https://platform.kimi.ai/docs/pricing/chat-k27-code",
    note: "Entrada calculada com preço de cache miss. Cache hit oficial: US$ 0.19 / 1M tokens.",
  },
  {
    provider: "moonshot",
    model: "kimi-k2.7-code-highspeed",
    inputTokenPriceUsdPerMillion: 1.9,
    outputTokenPriceUsdPerMillion: 8,
    source: "https://platform.kimi.ai/docs/pricing/chat-k27-code",
    note: "Entrada calculada com preço de cache miss. Cache hit oficial: US$ 0.38 / 1M tokens.",
  },
  {
    provider: "xai",
    model: "grok-4.3",
    inputTokenPriceUsdPerMillion: 1.25,
    outputTokenPriceUsdPerMillion: 2.5,
    source: "https://docs.x.ai/developers/models",
    note: "Preço oficial do modelo Grok 4.3 em julho de 2026.",
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-8",
    inputTokenPriceUsdPerMillion: 5,
    outputTokenPriceUsdPerMillion: 25,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Opus 4.8. Cache e inferência com residência podem alterar o valor final.",
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    inputTokenPriceUsdPerMillion: 5,
    outputTokenPriceUsdPerMillion: 25,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Opus 4.7.",
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-6",
    inputTokenPriceUsdPerMillion: 5,
    outputTokenPriceUsdPerMillion: 25,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Opus 4.6.",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputTokenPriceUsdPerMillion: 3,
    outputTokenPriceUsdPerMillion: 15,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Sonnet 4.6.",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputTokenPriceUsdPerMillion: 3,
    outputTokenPriceUsdPerMillion: 15,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Sonnet 4.5.",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputTokenPriceUsdPerMillion: 1,
    outputTokenPriceUsdPerMillion: 5,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    note: "Preço base do Claude Haiku 4.5.",
  },
];

export function findModelPricing(provider: AiProvider, model: string) {
  const normalizedModel = model.trim().toLowerCase();
  return MODEL_PRICING_CATALOG.find((item) => item.provider === provider && item.model.toLowerCase() === normalizedModel) ?? null;
}

export function modelOptionsForProvider(provider: AiProvider) {
  return MODEL_PRICING_CATALOG.filter((item) => item.provider === provider);
}
