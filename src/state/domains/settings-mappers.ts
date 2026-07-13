import type { AiFunctionSetting, AiProviderKeyStatus, AiSettings, AiUsageLog, OrgTone, WhatsAppSettings } from "../../types";

export function mapAiSettings(row: any): AiSettings {
  return {
    orgId: row.org_id, provider: row.provider, model: row.model, hasKey: row.has_key, keyPreview: row.key_preview ?? null,
    inputTokenPriceUsdPerMillion: Number(row.input_token_price_usd_per_million ?? 0),
    outputTokenPriceUsdPerMillion: Number(row.output_token_price_usd_per_million ?? 0), pricingSource: row.pricing_source ?? null,
  };
}

export function mapAiFunctionSetting(row: any): AiFunctionSetting {
  return {
    orgId: row.org_id, function: row.function, provider: row.provider, model: row.model, lastStatus: row.last_status ?? null,
    lastStatusDetail: row.last_status_detail ?? null, lastStatusSource: row.last_status_source ?? null,
    lastCheckedAt: row.last_checked_at ?? null, updatedAt: row.updated_at,
  };
}

export function mapAiProviderKeyStatus(row: any): AiProviderKeyStatus {
  return {
    orgId: row.org_id, provider: row.provider, hasKey: row.has_key ?? false, keyPreview: row.key_preview ?? null,
    lastStatus: row.last_status ?? null, lastStatusDetail: row.last_status_detail ?? null,
    lastCheckedAt: row.last_checked_at ?? null, updatedAt: row.updated_at,
  };
}

export function mapAiUsageLog(row: any): AiUsageLog {
  return {
    id: row.id, orgId: row.org_id, provider: row.provider, model: row.model, channel: row.channel ?? "web",
    promptTokens: Number(row.prompt_tokens ?? 0), completionTokens: Number(row.completion_tokens ?? 0), totalTokens: Number(row.total_tokens ?? 0),
    inputTokenPriceUsdPerMillion: Number(row.input_token_price_usd_per_million ?? 0),
    outputTokenPriceUsdPerMillion: Number(row.output_token_price_usd_per_million ?? 0), inputCostUsd: Number(row.input_cost_usd ?? 0),
    outputCostUsd: Number(row.output_cost_usd ?? 0), totalCostUsd: Number(row.total_cost_usd ?? 0), metadata: row.metadata ?? {}, createdAt: row.created_at,
  };
}

export function mapOrgTone(row: any): OrgTone {
  return {
    orgId: row.org_id, preset: row.preset, acidity: Number(row.axis_acidity ?? 0), drive: Number(row.axis_drive ?? 0),
    customNote: row.custom_note ?? null, updatedBy: row.updated_by ?? null, updatedAt: row.updated_at ?? null,
  };
}

export function mapWhatsAppSettings(row: any): WhatsAppSettings {
  return {
    orgId: row.org_id, instanceUrl: row.instance_url ?? null, instanceName: row.instance_name ?? null,
    connectedNumber: row.connected_number ?? null, enabled: row.enabled ?? false, hasApiKey: row.has_api_key ?? false,
    keyPreview: row.key_preview ?? null, hasWebhookSecret: row.has_webhook_secret ?? false,
    webhookSecretPreview: row.webhook_secret_preview ?? null, weeklyPulseEnabled: row.weekly_pulse_enabled ?? false,
    weeklyPulseWeekday: Number(row.weekly_pulse_weekday ?? 5), weeklyPulseHour: Number(row.weekly_pulse_hour ?? 16),
  };
}
