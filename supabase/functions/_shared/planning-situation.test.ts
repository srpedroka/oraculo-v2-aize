import { describe, expect, it } from "vitest";
import {
  applyPlanningSituation,
  legacyEnvelopeFromSituation,
  planningSituation,
  planningSituationPrompt,
} from "./planning-situation.ts";

const situation = planningSituation({
  kind: "monthly_capacity_choice",
  facts: { capacity: 5, demands: 12 },
  decision: "Escolher cinco ações.",
  authoritative: {
    state_patch: { capacidade: { comprometidas: 5, demandas: 12 } },
    next_phase: "capacidade",
    done: false,
  },
});

describe("planning situation F2", () => {
  it("shows the model only the detected facts and decision", () => {
    const prompt = planningSituationPrompt(situation);

    expect(prompt).toContain("monthly_capacity_choice");
    expect(prompt).toContain('"capacity": 5');
    expect(prompt).toContain("Escolher cinco ações.");
    expect(prompt).not.toContain("state_patch");
    expect(prompt).not.toContain("next_phase");
  });

  it("keeps the model reply but replaces structure with server authority", () => {
    const envelope = applyPlanningSituation({
      reply: "Quais cinco ações entram?",
      state_patch: { capacidade: { comprometidas: 12 } },
      next_phase: "sintese",
      proposal: { type: "save_monthly_plan" },
      done: true,
    }, situation);

    expect(envelope).toEqual({
      reply: "Quais cinco ações entram?",
      state_patch: { capacidade: { comprometidas: 5, demandas: 12 } },
      next_phase: "capacidade",
      proposal: null,
      done: false,
    });
  });

  it("keeps the legacy wrapper available for rollback without inventing a proposal", () => {
    expect(legacyEnvelopeFromSituation(situation, "Resposta anterior.")).toEqual({
      reply: "Resposta anterior.",
      state_patch: { capacidade: { comprometidas: 5, demandas: 12 } },
      next_phase: "capacidade",
      done: false,
    });
  });
});
