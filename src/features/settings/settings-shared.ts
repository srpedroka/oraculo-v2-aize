import type { AiConfigStatus, AiFunction, AiProvider, AiValidationResult, MembershipRole, OrgTonePreset } from "../../types";

export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
  moonshot: "kimi-k2.7-code",
  xai: "grok-4.3",
};

export const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic / Claude" },
  { value: "moonshot", label: "Kimi / Moonshot" },
  { value: "xai", label: "xAI / Grok" },
];

export const AI_FUNCTIONS: { value: AiFunction; title: string; description: string }[] = [
  { value: "planning", title: "Planejamento e fechamentos", description: "Usa o melhor modelo para conduzir planos, propostas e viradas de período." },
  { value: "daily", title: "Conversa do dia a dia", description: "Atende WhatsApp e painel com respostas rápidas; pode usar modelo mais leve." },
  { value: "background", title: "Bastidores", description: "Classifica documentos, prepara resumos e executa tarefas de apoio com custo controlado." },
];

export const CUSTOM_MODEL_VALUE = "__custom_model__";

export const TONE_PRESETS: Array<{ value: OrgTonePreset; label: string; acidity: number; drive: number }> = [
  { value: "equilibrado", label: "Equilibrado", acidity: 0, drive: 0 },
  { value: "gentil", label: "Gentil", acidity: -2, drive: 0 },
  { value: "acido", label: "Ácido / franco", acidity: 2, drive: 0 },
  { value: "direto", label: "Direto", acidity: 0, drive: -2 },
  { value: "motivador", label: "Motivador", acidity: 0, drive: 2 },
  { value: "custom", label: "Personalizado", acidity: 0, drive: 0 },
];

export function acidityPreview(value: number) {
  if (value <= -2) return "bem gentil e acolhedor";
  if (value === -1) return "gentil nas provocações";
  if (value === 1) return "franco e respeitoso";
  if (value >= 2) return "franco e provocador, sem grosseria";
  return "equilibrado entre acolhimento e franqueza";
}

export function drivePreview(value: number) {
  if (value <= -2) return "seco e objetivo";
  if (value === -1) return "contido e focado";
  if (value === 1) return "positivo e orientado ao próximo passo";
  if (value >= 2) return "motivador e energético, sem exageros";
  return "sereno e prático";
}

export function normalizePhone(value: string) {
  const startsWithPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${startsWithPlus ? "+" : ""}${digits}`;
}

export function isValidInternationalPhone(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(value);
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function providerLabel(provider: AiProvider) {
  return PROVIDERS.find((item) => item.value === provider)?.label ?? provider;
}

export function functionLabel(value: unknown) {
  return AI_FUNCTIONS.find((item) => item.value === value)?.title ?? "Sem função";
}

export function membershipRoleLabel(role: MembershipRole) {
  if (role === "owner") return "Dono";
  if (role === "admin") return "Admin";
  return "Coordenador";
}

export function statusLabel(status: AiConfigStatus | null | undefined) {
  if (status === "ok") return "Validado";
  if (status === "invalid_key") return "Chave recusada";
  if (status === "unknown_model") return "Modelo não reconhecido";
  if (status === "rate_limited") return "Limite do provedor";
  if (status === "timeout") return "Sem resposta";
  if (status === "no_key") return "Sem chave";
  if (status === "provider_error") return "Erro no provedor";
  return "Não testado";
}

export function statusClasses(status: AiConfigStatus | null | undefined) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "invalid_key" || status === "unknown_model" || status === "no_key") return "border-red-200 bg-red-50 text-red-700";
  if (status === "rate_limited" || status === "timeout" || status === "provider_error") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-border bg-[#FAFAFB] text-text-secondary";
}

export function validationMessage(validation: AiValidationResult | null | undefined) {
  if (!validation) return "Configuração salva. Não houve validação do provedor.";
  const provider = providerLabel(validation.provider);
  if (validation.status === "ok") return `Validado com ${provider} agora.`;
  if (validation.status === "unknown_model") return `${provider} não reconhece o modelo ${validation.model}. Confira o id do modelo.`;
  if (validation.status === "invalid_key") return `A chave ${provider} foi recusada. Revise a chave.`;
  if (validation.status === "no_key") return `Não há chave ${provider} cadastrada para validar esse modelo.`;
  if (validation.status === "rate_limited") return `${provider} limitou a validação agora; tente novamente em instantes.`;
  if (validation.status === "timeout") return `Não consegui falar com ${provider} agora; tente de novo.`;
  return `O provedor retornou erro ao validar: ${validation.detail}`;
}

export function checkedAtLabel(value: string | null | undefined) {
  if (!value) return "Nunca testado";
  return new Date(value).toLocaleString("pt-BR");
}
