import type { Provider } from "./model.ts";

export type ProbeStatus =
  | "ok"
  | "invalid_key"
  | "unknown_model"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "no_key"
  | "untested";

export interface ProbeResult {
  status: ProbeStatus;
  httpStatus?: number;
  detail: string;
}

function sanitizeDetail(value: unknown, apiKey = "") {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (apiKey) text = text.split(apiKey).join("[redacted]");
  return text.slice(0, 300) || "Sem detalhe do provedor.";
}

function classifyBody(status: number, body: string): ProbeStatus {
  const normalized = body.toLowerCase();
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status === 404) return "unknown_model";
  if (status === 400 && (normalized.includes("model") || normalized.includes("does not exist") || normalized.includes("unknown"))) {
    return "unknown_model";
  }
  return "provider_error";
}

function probeEndpoint(provider: Provider) {
  if (provider === "moonshot") return "https://api.moonshot.ai/v1/chat/completions";
  if (provider === "xai") return "https://api.x.ai/v1/chat/completions";
  if (provider === "anthropic") return "https://api.anthropic.com/v1/messages";
  return "https://api.openai.com/v1/responses";
}

function probeHeaders(provider: Provider, apiKey: string) {
  if (provider === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function probeBody(provider: Provider, model: string) {
  if (provider === "openai") {
    return {
      model,
      instructions: "Responda somente com ok.",
      input: [{ role: "user", content: "ping" }],
      max_output_tokens: 16,
      temperature: 0,
      store: false,
    };
  }

  if (provider === "anthropic") {
    return {
      model,
      system: "Responda somente com ok.",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
    };
  }

  return {
    model,
    messages: [
      { role: "system", content: "Responda somente com ok." },
      { role: "user", content: "ping" },
    ],
    max_tokens: 1,
    temperature: 0,
  };
}

export function classifyModelError(error: unknown): ProbeResult {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const nativeCode = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const nativeStatus = error && typeof error === "object" && "httpStatus" in error
    ? Number((error as { httpStatus?: unknown }).httpStatus ?? 0) || undefined
    : undefined;
  const statusMatch = message.match(/\b(400|401|403|404|408|429|5\d\d)\b/);
  const httpStatus = nativeStatus ?? (statusMatch ? Number(statusMatch[1]) : undefined);
  const status: ProbeStatus = nativeCode === "AI_PROVIDER_TIMEOUT" ? "timeout"
    : nativeCode === "AI_PROVIDER_RATE_LIMIT" ? "rate_limited"
    : nativeCode === "AI_PROVIDER_AUTH" ? "invalid_key"
    : nativeCode === "AI_PROVIDER_UNKNOWN_MODEL" ? "unknown_model"
    : httpStatus ? classifyBody(httpStatus, message)
    : message.toLowerCase().includes("tempo limite") ? "timeout"
    : "provider_error";
  return { status, httpStatus, detail: sanitizeDetail(message) };
}

export async function probeModel(provider: Provider, model: string, apiKey: string): Promise<ProbeResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return { status: "no_key", detail: "Nenhuma chave cadastrada para este provedor." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(probeEndpoint(provider), {
      method: "POST",
      headers: probeHeaders(provider, cleanKey),
      body: JSON.stringify(probeBody(provider, model)),
      signal: controller.signal,
    });

    if (response.ok) return { status: "ok", httpStatus: response.status, detail: "Modelo validado com o provedor." };

    const body = await response.text();
    return {
      status: classifyBody(response.status, body),
      httpStatus: response.status,
      detail: sanitizeDetail(body, cleanKey),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "timeout", detail: "Tempo limite ao validar o modelo." };
    }
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "timeout", detail: "Tempo limite ao validar o modelo." };
    }
    return { status: "provider_error", detail: sanitizeDetail(error, cleanKey) };
  } finally {
    clearTimeout(timeout);
  }
}
