export const DATA_NOTICE_VERSION = "2026-07-15";
export const DATA_NOTICE_PUBLISHED_AT = "15 de julho de 2026";

export const DATA_NOTICE_PROVIDERS = ["OpenAI", "Anthropic", "xAI", "Moonshot"] as const;

export const DATA_NOTICE_SUMMARY =
  "Como o Oráculo trata dados da empresa, conversas, arquivos, IA, WhatsApp e backups.";

export const DATA_NOTICE_DISMISS_KEY = (orgId: string) =>
  `oraculo.data-notice.${orgId}.${DATA_NOTICE_VERSION}.dismissed`;

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  xai: "xAI",
  moonshot: "Moonshot",
};
