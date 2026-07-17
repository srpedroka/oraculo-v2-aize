import { describe, expect, it } from "vitest";
import { normalizeReadyMonthlyProposal, normalizeReadyStrategicProposal } from "./session-ready-plans.ts";

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

describe("ready monthly proposal quality fields", () => {
  it("preserva o contrato mensal e limita cinco ações no plano inteiro", () => {
    const proposal = normalizeReadyMonthlyProposal({
      quarterlyAlignment: { status: "linked", quarterlyObjectiveId: "q-1", quarterlyObjectiveTitle: "Adoção do CRM" },
      risks: ["Fornecedor"],
      blockers: ["Dados incompletos"],
      cadence: "Semanal",
      nextCommitment: "Revisar na sexta",
      objectives: [
        {
          title: "",
          actions: Array.from({ length: 5 }, (_, index) => ({ description: `Ignorada ${index + 1}` })),
        },
        {
          title: "Elevar adoção",
          result: "Sair de 40% para 55%",
          metric: "Adoção",
          current: "40%",
          target: "55%",
          source: "CRM",
          deadline: "2027-05-31",
          owner: "Diego",
          linkedQuarterlyObjectiveId: "q-1",
          actions: Array.from({ length: 4 }, (_, index) => ({
            description: `Ação ${index + 1}`,
            owner: "Diego",
            deadline: "2027-05-20",
            completionCriterion: "Concluída",
          })),
        },
        {
          title: "Melhorar dados",
          result: "Base completa",
          metric: "Completude",
          current: "70%",
          target: "95%",
          source: "Auditoria",
          deadline: "2027-05-31",
          owner: "Ana",
          linkedQuarterlyObjectiveId: "q-1",
          actions: Array.from({ length: 4 }, (_, index) => ({
            description: `Ação extra ${index + 1}`,
            owner: "Ana",
            deadline: "2027-05-25",
            completionCriterion: "Concluída",
          })),
        },
      ],
    }, "Mai 2027");

    expect(proposal.quarterlyAlignment).toMatchObject({ status: "linked", quarterlyObjectiveId: "q-1" });
    expect(proposal.risks).toEqual(["Fornecedor"]);
    expect(proposal.blockers).toEqual(["Dados incompletos"]);
    expect(proposal.objectives[0]).toMatchObject({ current: "40%", source: "CRM", deadline: "2027-05-31" });
    expect(proposal.objectives.flatMap((objective) => objective.actions)).toHaveLength(5);
    expect(proposal.objectives.flatMap((objective) => objective.actions).some((action) => action.description.startsWith("Ignorada"))).toBe(false);
  });
});
