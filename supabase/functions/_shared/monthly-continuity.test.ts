import { describe, expect, it } from "vitest";
import { normalizeMonthlyContinuity } from "./monthly-continuity.ts";

describe("monthly inherited continuity", () => {
  it("keeps the inherited item as an action and promotes the measurable monthly outcome", () => {
    const proposal = normalizeMonthlyContinuity({
      type: "save_monthly_plan",
      quarterlyAlignment: { status: "linked", quarterlyObjectiveTitle: "Elevar qualidade do funil" },
      pendingDecisions: [{ item: "integração do CRM", origin: "Jun 2027", reason: "dependência do fornecedor", decision: "roll" }],
      blockers: [],
      cadence: "",
      nextCommitment: "",
      objectives: [{
        title: "integração do CRM",
        result: "integração do CRM",
        metric: "oportunidades com próxima ação",
        current: "40%",
        target: "55%",
        actions: [{
          description: "Rolar a integração do CRM",
          deadline: "2027-07-20",
          completionCriterion: "integração validada em produção",
        }],
      }],
    }) as any;

    expect(proposal.objectives[0]).toMatchObject({
      title: "Elevar oportunidades com próxima ação",
      result: "Elevar oportunidades com próxima ação de 40% para 55%",
      parentTitle: "Elevar qualidade do funil",
    });
    expect(proposal.objectives[0].actions[0].description).toBe("Rolar a integração do CRM");
    expect(proposal.blockers).toEqual(["Dependência do fornecedor"]);
    expect(proposal.cadence).toContain("até 2027-07-20");
    expect(proposal.nextCommitment).toBe("Integração validada em produção até 2027-07-20");
    expect(proposal.quarterlyAlignment.rationale).toContain("Elevar qualidade do funil");
  });

  it("does not overwrite cadence or a result already framed as an outcome", () => {
    const proposal = normalizeMonthlyContinuity({
      type: "save_monthly_plan",
      pendingDecisions: [{ item: "integração", origin: "Jun", reason: "fornecedor", decision: "roll" }],
      cadence: "checagem semanal",
      objectives: [{ result: "Elevar adoção de 40% para 55%", metric: "adoção", current: "40%", target: "55%" }],
    }) as any;

    expect(proposal.cadence).toBe("checagem semanal");
    expect(proposal.objectives[0].result).toBe("Elevar adoção de 40% para 55%");
  });
});
