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
}

export interface ModelImageInput {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
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
  const timeout = setTimeout(() => controller.abort("Tempo limite da IA atingido"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
          store: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI não respondeu corretamente: ${errorText}`);
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider === "moonshot" ? "Kimi/Moonshot" : provider === "xai" ? "xAI/Grok" : "OpenAI"} não respondeu corretamente: ${errorText}`);
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic não respondeu corretamente: ${errorText}`);
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
