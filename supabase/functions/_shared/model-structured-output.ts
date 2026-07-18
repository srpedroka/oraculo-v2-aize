export type StructuredOutputProvider = "openai" | "anthropic" | "moonshot" | "xai";

export interface ModelStructuredOutput {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
  strictByProvider?: Partial<Record<StructuredOutputProvider, boolean>>;
}

export function structuredOutputRequestFields(provider: StructuredOutputProvider, output?: ModelStructuredOutput) {
  if (!output) return {};
  const strict = output.strictByProvider?.[provider] ?? output.strict !== false;

  if (provider === "openai") {
    return {
      text: {
        format: {
          type: "json_schema",
          name: output.name,
          schema: output.schema,
          strict,
        },
      },
    };
  }

  if (provider === "xai") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: output.name,
          schema: output.schema,
          strict,
        },
      },
    };
  }

  return {};
}
