import { describe, expect, it } from "vitest";
import {
  isExplicitQuarterlyKpiHypothesisChoiceReply,
  normalizeQuarterlyKpiLinks,
  quarterlyKpiLinks,
  retainConfirmedQuarterlyKpiLinks,
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

  it("keeps only KPI links explicitly chosen by the manager", () => {
    const proposal = {
      type: "save_quarterly_plan",
      quarterlyObjectives: [{
        kpiLinks: [{ kpi: "Margem operacional", linkType: "hypothesis" }],
      }],
    };
    const unconfirmed = retainConfirmedQuarterlyKpiLinks(proposal) as any;
    const confirmed = retainConfirmedQuarterlyKpiLinks(proposal, {
      userMessage: "O gestor confirma vinculo apenas como hipotese com o KPI existente Margem operacional.",
    }) as any;

    expect(unconfirmed.quarterlyObjectives[0].kpiLinks).toEqual([]);
    expect(confirmed.quarterlyObjectives[0].kpiLinks[0]).toMatchObject({ kpiKey: "operating_margin" });
  });

  it("accepts a short yes only after an explicit KPI question", () => {
    const proposal = {
      type: "save_quarterly_plan",
      quarterlyObjectives: [{ kpiLinks: [{ kpi: "Margem operacional" }] }],
    };
    const confirmed = retainConfirmedQuarterlyKpiLinks(proposal, {
      userMessage: "sim",
      previousOracleReply: "Você quer vincular este objetivo ao KPI Margem operacional?",
    }) as any;
    const unrelated = retainConfirmedQuarterlyKpiLinks(proposal, {
      userMessage: "sim",
      previousOracleReply: "O prazo está correto?",
    }) as any;

    expect(confirmed.quarterlyObjectives[0].kpiLinks).toHaveLength(1);
    expect(unrelated.quarterlyObjectives[0].kpiLinks).toEqual([]);
  });
});
