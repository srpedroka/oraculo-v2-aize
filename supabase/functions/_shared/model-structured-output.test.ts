import { describe, expect, it } from "vitest";
import { structuredOutputRequestFields } from "./model-structured-output.ts";
import { PLANNING_SESSION_OUTPUT } from "./session-output-schema.ts";

describe("model structured output", () => {
  it("uses strict json_schema with xAI chat completions", () => {
    expect(structuredOutputRequestFields("xai", PLANNING_SESSION_OUTPUT)).toEqual({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "oraculo_planning_session",
          schema: PLANNING_SESSION_OUTPUT.schema,
          strict: true,
        },
      },
    });
  });

  it("uses schema guidance without unsupported strict nested objects on OpenAI Responses", () => {
    expect(structuredOutputRequestFields("openai", PLANNING_SESSION_OUTPUT)).toEqual({
      text: {
        format: {
          type: "json_schema",
          name: "oraculo_planning_session",
          schema: PLANNING_SESSION_OUTPUT.schema,
          strict: false,
        },
      },
    });
  });

  it("keeps providers without an explicit contract on the compatible path", () => {
    expect(structuredOutputRequestFields("anthropic", PLANNING_SESSION_OUTPUT)).toEqual({});
    expect(structuredOutputRequestFields("moonshot", PLANNING_SESSION_OUTPUT)).toEqual({});
  });
});
