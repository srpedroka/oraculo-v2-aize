import type { Provider, ModelUsage } from "./model.ts";

interface UsageSettings {
  input_token_price_usd_per_million?: number | string | null;
  output_token_price_usd_per_million?: number | string | null;
}

interface RecordUsageParams {
  client: any;
  orgId: string;
  provider: Provider;
  model: string;
  channel: "web" | "whatsapp" | "system";
  usage: ModelUsage;
  settings?: UsageSettings | null;
  metadata?: Record<string, unknown>;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordAiUsage({
  client,
  orgId,
  provider,
  model,
  channel,
  usage,
  settings,
  metadata = {},
}: RecordUsageParams) {
  const promptTokens = Math.max(0, Math.round(toNumber(usage.promptTokens)));
  const completionTokens = Math.max(0, Math.round(toNumber(usage.completionTokens)));
  const totalTokens = Math.max(0, Math.round(toNumber(usage.totalTokens || promptTokens + completionTokens)));
  if (!totalTokens) return;

  const inputPrice = Math.max(0, toNumber(settings?.input_token_price_usd_per_million));
  const outputPrice = Math.max(0, toNumber(settings?.output_token_price_usd_per_million));
  const inputCost = (promptTokens * inputPrice) / 1_000_000;
  const outputCost = (completionTokens * outputPrice) / 1_000_000;

  const { error } = await client.from("ai_usage_logs").insert({
    org_id: orgId,
    provider,
    model,
    channel,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    input_token_price_usd_per_million: inputPrice,
    output_token_price_usd_per_million: outputPrice,
    input_cost_usd: inputCost,
    output_cost_usd: outputCost,
    total_cost_usd: inputCost + outputCost,
    metadata,
  });

  if (error) {
    console.error("Erro ao registrar uso da IA", error.message);
  }
}
