import type { ModelStructuredOutput } from "../supabase/functions/_shared/model-structured-output";

export const STRATEGIC_JUDGE_OUTPUT: ModelStructuredOutput = {
  name: "oraculo_strategic_quality_judge",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "rubricScores", "humanCriticalFailureCandidates"],
    properties: {
      summary: { type: "string" },
      rubricScores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rubricId", "criteria", "score"],
          properties: {
            rubricId: { type: "string" },
            criteria: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "rating", "justification"],
                properties: {
                  id: { type: "string" },
                  rating: { type: "integer", minimum: 0, maximum: 4 },
                  justification: { type: "string" },
                },
              },
            },
            score: { type: "number" },
          },
        },
      },
      humanCriticalFailureCandidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "occurred", "justification"],
          properties: {
            id: { type: "string" },
            occurred: { type: "boolean" },
            justification: { type: "string" },
          },
        },
      },
    },
  },
};
