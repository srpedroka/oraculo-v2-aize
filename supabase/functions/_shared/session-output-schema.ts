import type { ModelStructuredOutput } from "./model-structured-output.ts";

export const PLANNING_SESSION_OUTPUT: ModelStructuredOutput = {
  name: "oraculo_planning_session",
  strict: true,
  strictByProvider: { openai: false },
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "state_patch", "next_phase", "proposal", "done"],
    properties: {
      reply: { type: "string" },
      state_patch: {
        type: "object",
        additionalProperties: true,
      },
      next_phase: {
        anyOf: [
          { type: "string" },
          { type: "null" },
        ],
      },
      proposal: {
        anyOf: [
          { type: "object", additionalProperties: true },
          { type: "null" },
        ],
      },
      done: { type: "boolean" },
    },
  },
};
