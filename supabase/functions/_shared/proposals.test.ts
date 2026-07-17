import { describe, expect, it } from "vitest";
import { proposalMatchesCanonicalAnnualParent } from "./proposals.ts";

const parent = {
  id: "area-annual-id",
  parent_id: "strategic-id",
  title: "Aumentar a previsibilidade comercial",
};

describe("canonical quarterly annual parent", () => {
  it("accepts the existing area annual objective when the strategic link matches", () => {
    expect(proposalMatchesCanonicalAnnualParent({
      linkedStrategicObjectiveIds: ["strategic-id"],
    }, {
      parentTitle: "Outro rotulo explicativo",
    }, parent)).toBe(true);
  });

  it("accepts a normalized confirmed title when no strategic id was repeated", () => {
    expect(proposalMatchesCanonicalAnnualParent({
      annualAlignment: { strategicObjectiveTitle: "AUMENTAR A PREVISIBILIDADE COMERCIAL" },
    }, {
      parentTitle: "",
    }, parent)).toBe(true);
  });

  it("rejects an unrelated or missing canonical parent", () => {
    expect(proposalMatchesCanonicalAnnualParent({
      linkedStrategicObjectiveIds: ["other-strategic-id"],
      annualAlignment: { strategicObjectiveTitle: "Crescer receita" },
    }, {
      parentTitle: "Reduzir custos",
    }, parent)).toBe(false);
    expect(proposalMatchesCanonicalAnnualParent({}, {}, null)).toBe(false);
  });
});
