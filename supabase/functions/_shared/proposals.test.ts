import { describe, expect, it, vi } from "vitest";
import { canonicalizeQuarterlyStrategicReferences, proposalMatchesCanonicalAnnualParent } from "./proposals.ts";

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

  it("maps an area annual id to its same-area strategic parent before confirmation", async () => {
    const areaAnnualId = "11111111-1111-4111-8111-111111111111";
    const strategicId = "22222222-2222-4222-8222-222222222222";
    const inMock = vi.fn(async () => ({
      data: [{ id: areaAnnualId, level: "area_annual", area_id: "area-a", parent_id: strategicId }],
      error: null,
    }));
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, in: inMock };
    const client = { from: vi.fn(() => chain) };

    const normalized = await canonicalizeQuarterlyStrategicReferences(client, {
      org_id: "org-a",
      area_id: "area-a",
    }, {
      type: "save_quarterly_plan",
      linkedStrategicObjectiveIds: [areaAnnualId],
      annualObjectives: [{ title: "Objetivo da area", linkedStrategicObjectiveId: areaAnnualId }],
    });

    expect(normalized.linkedStrategicObjectiveIds).toEqual([strategicId]);
    expect(normalized.annualObjectives[0].linkedStrategicObjectiveId).toBe(strategicId);
    expect(inMock).toHaveBeenCalledWith("id", [areaAnnualId]);
  });

  it("does not translate a same-org annual id from another area", async () => {
    const areaAnnualId = "11111111-1111-4111-8111-111111111111";
    const inMock = vi.fn(async () => ({
      data: [{ id: areaAnnualId, level: "area_annual", area_id: "area-b", parent_id: "strategic-id" }],
      error: null,
    }));
    const chain: any = { select: () => chain, eq: () => chain, is: () => chain, in: inMock };
    const client = { from: vi.fn(() => chain) };

    const normalized = await canonicalizeQuarterlyStrategicReferences(client, {
      org_id: "org-a",
      area_id: "area-a",
    }, { linkedStrategicObjectiveIds: [areaAnnualId] });

    expect(normalized.linkedStrategicObjectiveIds).toEqual([areaAnnualId]);
  });
});
