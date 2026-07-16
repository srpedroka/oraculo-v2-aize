import { describe, expect, it } from "vitest";
import { normalizeReadyStrategicProposal } from "./session-ready-plans.ts";

describe("ready strategic proposal quality fields", () => {
  it("keeps baseline, source, strategies, choices, risks and lessons", () => {
    const proposal = normalizeReadyStrategicProposal({
      year: 2026,
      renunciations: ["Não crescer sem margem"],
      risks: ["Concentração de responsabilidade"],
      historicalLessons: ["Baseline precisa estar explícita"],
      pendingDecisions: ["Validar delegação"],
      objectives: [{
        title: "Prever receita",
        baseline: "55%",
        metric: "Receita coberta",
        target: "80%",
        deadline: "2026-12-31",
        source: "CRM",
        strategies: ["Revisar previsão semanalmente"],
        owner: "Responsável sintético",
      }],
    }, "2026");

    expect(proposal.renunciations).toEqual(["Não crescer sem margem"]);
    expect(proposal.risks).toEqual(["Concentração de responsabilidade"]);
    expect(proposal.historicalLessons).toEqual(["Baseline precisa estar explícita"]);
    expect(proposal.pendingDecisions).toEqual(["Validar delegação"]);
    expect(proposal.objectives[0]).toMatchObject({
      current: "55%",
      deadline: "2026-12-31",
      source: "CRM",
      strategies: ["Revisar previsão semanalmente"],
    });
  });
});
