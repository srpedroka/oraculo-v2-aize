export type Provider = "openai" | "anthropic";

interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export async function callModel(
  provider: Provider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  messages: ModelMessage[],
): Promise<string> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI não respondeu corretamente: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "Não consegui gerar uma resposta agora.";
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
    return data.content?.map((block: { text?: string }) => block.text ?? "").join("\n").trim() || "Não consegui gerar uma resposta agora.";
  }

  throw new Error("Provedor não suportado");
}
