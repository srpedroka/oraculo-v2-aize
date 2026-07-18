// @ts-expect-error Deno Edge Functions require the explicit TypeScript extension.
import { structuredOutputRequestFields, type ModelStructuredOutput } from "./model-structured-output.ts";

export type Provider = "openai" | "anthropic" | "moonshot" | "xai";

interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelCallResult {
  text: string;
  usage: ModelUsage;
}

export interface ModelCallOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  structuredOutput?: ModelStructuredOutput;
}

export interface ModelImageInput {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
}

export type AiProviderErrorCode =
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_RATE_LIMIT"
  | "AI_PROVIDER_AUTH"
  | "AI_PROVIDER_UNKNOWN_MODEL"
  | "AI_PROVIDER_BAD_REQUEST"
  | "AI_PROVIDER_REJECTED";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(code: AiProviderErrorCode, message: string, options: { httpStatus?: number | null; retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable === true;
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: options.cause, configurable: true });
    }
  }
}

function providerLabel(provider: Provider) {
  if (provider === "moonshot") return "Kimi/Moonshot";
  if (provider === "xai") return "xAI/Grok";
  if (provider === "anthropic") return "Anthropic";
  return "OpenAI";
}

export function modelProviderHttpError(provider: Provider, status: number) {
  const label = providerLabel(provider);
  if (status === 408) return new AiProviderError("AI_PROVIDER_TIMEOUT", `${label} excedeu o tempo limite.`, { httpStatus: status, retryable: true });
  if (status === 429) return new AiProviderError("AI_PROVIDER_RATE_LIMIT", `${label} atingiu o limite temporário de solicitações.`, { httpStatus: status, retryable: true });
  if (status >= 500) return new AiProviderError("AI_PROVIDER_UNAVAILABLE", `${label} está temporariamente indisponível.`, { httpStatus: status, retryable: true });
  if (status === 401 || status === 403) return new AiProviderError("AI_PROVIDER_AUTH", `${label} recusou a credencial configurada.`, { httpStatus: status });
  if (status === 404) return new AiProviderError("AI_PROVIDER_UNKNOWN_MODEL", `${label} não reconheceu o modelo configurado.`, { httpStatus: status });
  if (status === 400) return new AiProviderError("AI_PROVIDER_BAD_REQUEST", `${label} recusou o formato da solicitação.`, { httpStatus: status });
  return new AiProviderError("AI_PROVIDER_REJECTED", `${label} recusou a solicitação.`, { httpStatus: status });
}

export function isRetryableAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError && error.retryable;
}

export interface AiRetryBudget {
  remaining: number;
}

export function createTransientAiRetryBudget(maxRetries = 1): AiRetryBudget {
  return { remaining: Math.max(0, Math.floor(maxRetries)) };
}

export async function withTransientAiRetry<T>(
  operation: () => Promise<T>,
  budget = createTransientAiRetryBudget(),
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableAiProviderError(error) || budget.remaining <= 0) throw error;
    budget.remaining -= 1;
    return await operation();
  }
}

function emptyUsage(): ModelUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function normalizeOpenAiUsage(usage: any): ModelUsage {
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  const totalTokens = Number(usage?.total_tokens ?? promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function responseText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const parts = Array.isArray(data?.output) ? data.output : [];
  const text = parts
    .flatMap((item: any) => item?.content ?? [])
    .map((content: any) => content?.text ?? content?.value ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "Não consegui gerar uma resposta agora.";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new AiProviderError("AI_PROVIDER_TIMEOUT", "O provedor de IA excedeu o tempo limite.", { retryable: true, cause: error });
    }
    throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", "Não foi possível alcançar o provedor de IA.", { retryable: true, cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export async function callModel(
  provider: Provider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  messages: ModelMessage[],
  options: ModelCallOptions = {},
): Promise<ModelCallResult> {
  const maxTokens = options.maxTokens;
  const temperature = options.temperature;
  const structuredOutputFields = structuredOutputRequestFields(provider, options.structuredOutput);

  if (provider === "openai" || provider === "moonshot" || provider === "xai") {
    const baseUrl = provider === "moonshot" ? "https://api.moonshot.ai/v1" : provider === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";

    if (provider === "openai") {
      const response = await fetchWithTimeout(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: systemPrompt,
          input: messages,
          max_output_tokens: maxTokens ?? 700,
          ...(typeof temperature === "number" ? { temperature } : {}),
          ...structuredOutputFields,
          store: false,
        }),
      }, options.timeoutMs);

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw modelProviderHttpError(provider, response.status);
      }

      const data = await response.json();
      return {
        text: responseText(data),
        usage: normalizeOpenAiUsage(data.usage),
      };
    }

    const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: maxTokens,
        temperature,
        ...structuredOutputFields,
      }),
    }, options.timeoutMs);

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw modelProviderHttpError(provider, response.status);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content ?? "Não consegui gerar uma resposta agora.",
      usage: normalizeOpenAiUsage(data.usage),
    };
  }

  if (provider === "anthropic") {
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        max_tokens: maxTokens ?? 900,
        temperature: temperature ?? 0.4,
      }),
    }, options.timeoutMs);

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw modelProviderHttpError(provider, response.status);
    }

    const data = await response.json();
    const promptTokens = Number(data.usage?.input_tokens ?? 0);
    const completionTokens = Number(data.usage?.output_tokens ?? 0);
    return {
      text: data.content?.map((block: { text?: string }) => block.text ?? "").join("\n").trim() || "Não consegui gerar uma resposta agora.",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  throw new Error("Provedor não suportado");
}

export async function callModelWithImage(
  provider: Provider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userText: string,
  image: ModelImageInput,
  options: ModelCallOptions = {},
): Promise<ModelCallResult> {
  const maxTokens = options.maxTokens;
  const temperature = options.temperature;
  const imageUrl = `data:${image.mimeType};base64,${image.base64}`;

  if (provider === "openai" || provider === "xai") {
    const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : "https://api.x.ai/v1";
    const response = await fetchWithTimeout(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: userText },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        }],
        max_output_tokens: maxTokens ?? 700,
        ...(typeof temperature === "number" ? { temperature } : {}),
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider === "openai" ? "OpenAI" : "xAI/Grok"} não conseguiu ler a imagem: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: responseText(data),
      usage: normalizeOpenAiUsage(data.usage),
    };
  }

  if (provider === "anthropic") {
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
          ],
        }],
        max_tokens: maxTokens ?? 900,
        temperature: temperature ?? 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic não conseguiu ler a imagem: ${errorText}`);
    }

    const data = await response.json();
    const promptTokens = Number(data.usage?.input_tokens ?? 0);
    const completionTokens = Number(data.usage?.output_tokens ?? 0);
    return {
      text: data.content?.map((block: { text?: string }) => block.text ?? "").join("\n").trim() || "Não consegui gerar uma resposta agora.",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  throw new Error("O modelo de bastidores selecionado não aceita leitura de imagem. Escolha OpenAI, Anthropic ou xAI em Configurações.");
}

export interface WebSearchSource {
  url: string;
  title: string;
}

export interface WebSearchResult {
  text: string;
  sources: WebSearchSource[];
  usage: ModelUsage;
}

function anthropicUsage(data: any): ModelUsage {
  const promptTokens = Number(data?.usage?.input_tokens ?? 0);
  const completionTokens = Number(data?.usage?.output_tokens ?? 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

const WEB_SEARCH_TIMEOUT_MS = 60000;

function pushWebSearchSource(sources: WebSearchSource[], url: unknown, title: unknown) {
  try {
    if (typeof url !== "string" || !url.trim()) return;
    const normalizedUrl = url.trim();
    if (sources.some((source) => source.url === normalizedUrl)) return;
    const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : normalizedUrl;
    sources.push({ url: normalizedUrl, title: normalizedTitle });
  } catch {
    // citation malformada: ignorar e seguir
  }
}

function dedupeWebSearchSources(sources: WebSearchSource[]): WebSearchSource[] {
  const seen = new Set<string>();
  const out: WebSearchSource[] = [];
  for (const source of sources) {
    try {
      if (!source?.url || seen.has(source.url)) continue;
      seen.add(source.url);
      out.push({
        url: source.url,
        title: typeof source.title === "string" && source.title.trim() ? source.title : source.url,
      });
    } catch {
      // citation malformada: ignorar e seguir
    }
  }
  return out;
}

function extractAnthropicWebSearchText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: any) => block?.type === "text")
    .map((block: any) => (typeof block?.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractAnthropicWebSearchSources(content: unknown): WebSearchSource[] {
  const sources: WebSearchSource[] = [];
  if (!Array.isArray(content)) return sources;

  for (const block of content) {
    try {
      if (Array.isArray(block?.citations)) {
        for (const citation of block.citations) {
          try {
            pushWebSearchSource(sources, citation?.url, citation?.title);
          } catch {
            // ignore
          }
        }
      }

      if (block?.type === "web_search_tool_result") {
        const resultContent = block?.content;
        if (Array.isArray(resultContent)) {
          for (const item of resultContent) {
            try {
              pushWebSearchSource(sources, item?.url, item?.title);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // bloco malformado: ignorar e seguir
    }
  }

  return dedupeWebSearchSources(sources);
}

function extractOpenAiWebSearchSources(data: any): WebSearchSource[] {
  const sources: WebSearchSource[] = [];
  try {
    const parts = Array.isArray(data?.output) ? data.output : [];
    for (const item of parts) {
      try {
        const contentItems = Array.isArray(item?.content) ? item.content : [];
        for (const content of contentItems) {
          try {
            const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
            for (const annotation of annotations) {
              try {
                if (annotation?.type !== "url_citation") continue;
                pushWebSearchSource(sources, annotation?.url, annotation?.title);
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return dedupeWebSearchSources(sources);
}

export async function callModelWithWebSearch(
  provider: Provider,
  model: string,
  apiKey: string,
  prompt: string,
  options: ModelCallOptions = {},
): Promise<WebSearchResult> {
  const maxTokens = options.maxTokens;
  const temperature = options.temperature;

  if (provider === "moonshot" || provider === "xai") {
    throw new Error("Busca web indisponível neste provedor");
  }

  if (provider === "openai") {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt,
          tools: [{ type: "web_search" }],
          max_output_tokens: maxTokens ?? 1200,
          ...(typeof temperature === "number" ? { temperature } : {}),
          store: false,
        }),
      },
      WEB_SEARCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI não conseguiu fazer a busca web: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: responseText(data),
      sources: extractOpenAiWebSearchSources(data),
      usage: normalizeOpenAiUsage(data.usage),
    };
  }

  if (provider === "anthropic") {
    const headers = {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];

    const requestAnthropic = async (messages: Array<{ role: string; content: unknown }>) => {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens ?? 1200,
            temperature: temperature ?? 0.4,
            tools,
          }),
        },
        WEB_SEARCH_TIMEOUT_MS,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic não conseguiu fazer a busca web: ${errorText}`);
      }

      return await response.json();
    };

    let data = await requestAnthropic([{ role: "user", content: prompt }]);
    let usage = anthropicUsage(data);
    const collectedSources = extractAnthropicWebSearchSources(data?.content);

    if (data?.stop_reason === "pause_turn" && Array.isArray(data?.content)) {
      data = await requestAnthropic([
        { role: "user", content: prompt },
        { role: "assistant", content: data.content },
      ]);
      usage = addUsage(usage, anthropicUsage(data));
      collectedSources.push(...extractAnthropicWebSearchSources(data?.content));
    }

    return {
      text: extractAnthropicWebSearchText(data?.content) || "Não consegui gerar uma resposta agora.",
      sources: dedupeWebSearchSources(collectedSources),
      usage,
    };
  }

  throw new Error("Provedor não suportado");
}

export async function callModelText(
  provider: Provider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  messages: ModelMessage[],
): Promise<string> {
  const result = await callModel(provider, model, apiKey, systemPrompt, messages);
  return result.text;
}
