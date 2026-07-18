import { describe, expect, it } from "vitest";
import { structuredOutputRequestFields } from "../../supabase/functions/_shared/model-structured-output";
import { STRATEGIC_JUDGE_OUTPUT } from "../../scripts/strategic-judge-schema";

describe("strategic judge structured output", () => {
  it("requires the complete strict judge envelope", () => {
    expect(STRATEGIC_JUDGE_OUTPUT.strict).toBe(true);
    expect(STRATEGIC_JUDGE_OUTPUT.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["summary", "rubricScores", "humanCriticalFailureCandidates"],
    });
  });

  it("sends the same schema through xAI json_schema", () => {
    expect(structuredOutputRequestFields("xai", STRATEGIC_JUDGE_OUTPUT)).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "oraculo_strategic_quality_judge",
          strict: true,
          schema: STRATEGIC_JUDGE_OUTPUT.schema,
        },
      },
    });
  });
});
