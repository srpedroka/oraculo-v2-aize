import { describe, expect, it } from "vitest";
import { normalizeQuarterlySharedActions, uniqueQuarterlyActionEntries } from "./quarterly-actions.ts";

const shared = {
  description: "Publicar o padrão operacional",
  owner: "Diego",
  deadline: "2027-07-31",
  completionCriterion: "Padrão aprovado e acessível",
};

function proposal() {
  return {
    type: "save_quarterly_plan",
    quarterlyObjectives: ["Prazo", "Retrabalho", "Capacidade"].map((title) => ({
      title,
      actions: [shared],
    })),
  };
}

describe("quarterly shared actions", () => {
  it("moves an identical action present in every objective to the shared plan scope", () => {
    const normalized = normalizeQuarterlySharedActions(proposal()) as any;

    expect(normalized.sharedActions).toEqual([shared]);
    expect(normalized.quarterlyObjectives.every((objective: any) => objective.actions.length === 0)).toBe(true);
    expect(uniqueQuarterlyActionEntries(normalized)).toEqual([{
      action: shared,
      objectiveIndex: 0,
      shared: true,
    }]);
  });

  it("keeps an action objective-specific when it is not shared by every result", () => {
    const value = proposal();
    value.quarterlyObjectives[2].actions = [{ ...shared, description: "Recalibrar capacidade" }];
    const normalized = normalizeQuarterlySharedActions(value) as any;

    expect(normalized.sharedActions).toBeUndefined();
    expect(normalized.quarterlyObjectives[0].actions).toEqual([shared]);
    expect(uniqueQuarterlyActionEntries(normalized)).toHaveLength(2);
  });
});
