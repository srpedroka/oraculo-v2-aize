export type Provider = "openai" | "anthropic" | "moonshot";

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

function emptyUsage(): ModelUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function normalizeOpenAiUsage(usage: any): ModelUsage {
  const promptTokens = Number(usage?.prompt_tokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? 0);
  const totalTokens = Number(usage?.total_tokens ?? promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

export async function callModel(
  provider: Provider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  messages: ModelMessage[],
): Promise<ModelCallResult> {
  if (provider === "openai" || provider === "moonshot") {
    const baseUrl = provider === "moonshot" ? "https://api.moonshot.ai/v1" : "https://api.openai.com/v1";
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    };

    if (provider === "openai") {
      body.temperature = 0.4;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider === "moonshot" ? "Kimi/Moonshot" : "OpenAI"} não respondeu corretamente: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content ?? "Não consegui gerar uma resposta agora.",
      usage: normalizeOpenAiUsage(data.usage),
    };
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
        max_tokens: 900,
        temperature: 0.4,
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
