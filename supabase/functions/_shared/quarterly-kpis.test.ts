import { describe, expect, it } from "vitest";
import {
  isExplicitQuarterlyKpiHypothesisChoiceReply,
  normalizeQuarterlyKpiLinks,
  quarterlyKpiLinks,
} from "./quarterly-kpis.ts";

describe("quarterly KPI links", () => {
  it("normalizes a confirmed human label to the canonical dashboard key", () => {
    const proposal = normalizeQuarterlyKpiLinks({
      type: "save_quarterly_plan",
      quarterlyObjectives: [{
        kpiLinks: [{ kpi: "Margem operacional", linkType: "hypothesis" }],
      }],
    }) as any;

    expect(proposal.quarterlyObjectives[0].kpiLinks[0]).toMatchObject({
      kpiKey: "operating_margin",
      rationale: "Hipótese confirmada pelo gestor; efeito causal ainda não comprovado.",
    });
    expect(quarterlyKpiLinks(proposal)).toHaveLength(1);
  });

  it("does not turn an unknown label into a dashboard KPI", () => {
    const proposal = normalizeQuarterlyKpiLinks({
      type: "save_quarterly_plan",
      quarterlyObjectives: [{ kpiLinks: ["Ticket mágico"] }],
    }) as any;

    expect(proposal.quarterlyObjectives[0].kpiLinks).toEqual([{ kpiKey: "Ticket mágico" }]);
    expect(quarterlyKpiLinks(proposal)).toEqual([]);
  });

  it("recognizes a natural explicit choice without requiring one literal disclaimer", () => {
    expect(isExplicitQuarterlyKpiHypothesisChoiceReply(
      "Quer vincular o resultado à Margem operacional, mesmo o efeito ainda sendo hipótese?",
    )).toBe(true);
    expect(isExplicitQuarterlyKpiHypothesisChoiceReply(
      "Margem operacional pode melhorar.",
    )).toBe(false);
  });
});
