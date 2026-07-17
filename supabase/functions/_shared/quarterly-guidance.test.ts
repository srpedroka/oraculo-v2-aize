import { describe, expect, it } from "vitest";
import { preserveExplicitQuarterlyCadence, validateQuarterlyGuidanceEnvelope } from "./quarterly-guidance.ts";

function completeObjective(overrides: Record<string, unknown> = {}) {
  return {
    title: "Elevar previsibilidade do funil",
    result: "Aumentar oportunidades com próxima ação registrada",
    metric: "Oportunidades com próxima ação",
    current: "40%",
    target: "85%",
    source: "Relatório semanal do funil",
    deadline: "2027-09-30",
    owner: "Gestor Comercial",
    parentTitle: "Aumentar previsibilidade comercial",
    actions: [{
      description: "Padronizar etapas do funil",
      owner: "Gestor Comercial",
      deadline: "2027-07-31",
      completionCriterion: "Etapas publicadas e aprovadas",
    }],
    ...overrides,
  };
}

function completeProposal(overrides: Record<string, unknown> = {}) {
  return {
    type: "save_quarterly_plan",
    annualAlignment: {
      status: "linked",
      strategicObjectiveTitle: "Aumentar previsibilidade comercial",
      rationale: "O trimestre avança a qualidade do funil",
    },
    quarterlyObjectives: [completeObjective()],
    ...overrides,
  };
}

function reasons(proposal: unknown, reply = "Organizei o plano. Confirma a gravação?") {
  return validateQuarterlyGuidanceEnvelope({ envelope: { reply, proposal } });
}

describe("quarterly guidance", () => {
  it("aceita proposta trimestral verificável, priorizada e ligada ao anual", () => {
    expect(reasons(completeProposal())).toEqual([]);
  });

  it("bloqueia mudança indevida para o ritual anual", () => {
    expect(reasons(null, "Vamos construir o planejamento anual primeiro. Qual é a dor da empresa?")).toContain("quarterly_annual_ritual_switch");
  });

  it("exige vínculo anual real ou exceção explícita", () => {
    expect(reasons(completeProposal({ annualAlignment: {} }))).toContain("quarterly_alignment_missing");
  });

  it("exige justificativa para seguir sem plano anual", () => {
    expect(reasons(completeProposal({
      annualAlignment: { status: "exception", rationale: "" },
      quarterlyObjectives: [completeObjective({ parentTitle: "" })],
    }))).toContain("quarterly_alignment_exception_missing_reason");
  });

  it("aceita exceção anual justificada sem inventar vínculo", () => {
    expect(reasons(completeProposal({
      annualAlignment: { status: "exception", rationale: "A empresa ainda está consolidando o plano anual" },
      quarterlyObjectives: [completeObjective({ parentTitle: "" })],
    }))).toEqual([]);
  });

  it("recusa exceção anual contraditória com novo vínculo", () => {
    expect(reasons(completeProposal({
      annualAlignment: { status: "exception", rationale: "Plano anual ainda não existe" },
      annualObjectives: [{ title: "Objetivo anual inventado" }],
      quarterlyObjectives: [completeObjective({ parentTitle: "" })],
    }))).toContain("quarterly_exception_with_annual_link");
  });

  it("limita o trimestre a no máximo três resultados", () => {
    const objectives = Array.from({ length: 4 }, (_, index) => completeObjective({ title: `Resultado ${index + 1}` }));
    expect(reasons(completeProposal({ quarterlyObjectives: objectives }))).toContain("quarterly_priority_overload");
  });

  it("bloqueia atividade disfarçada de objetivo", () => {
    const proposal = completeProposal({
      quarterlyObjectives: [completeObjective({ title: "Implantar CRM", result: "Implementar o CRM" })],
    });
    expect(reasons(proposal)).toContain("quarterly_activity_as_objective");
  });

  it("bloqueia objetivo sem baseline ou fonte", () => {
    const proposal = completeProposal({
      quarterlyObjectives: [completeObjective({ current: "", source: "" })],
    });
    expect(reasons(proposal)).toContain("quarterly_unverifiable_objective");
  });

  it("exige ao menos uma ação com dono, prazo e critério", () => {
    const proposal = completeProposal({ quarterlyObjectives: [completeObjective({ actions: [] })] });
    expect(reasons(proposal)).toContain("quarterly_incomplete_actions");
  });

  it("preserva uma cadência semanal explícita sem inventar rotina", () => {
    const withoutCadence = { reply: "Plano pronto. Confirma?", proposal: completeProposal({ cadence: "" }) };
    const normalized = preserveExplicitQuarterlyCadence(
      withoutCadence,
      "Ação 2: revisar semanalmente as exceções até o fim do trimestre.\nFonte: relatório semanal do funil.",
    );
    const untouched = preserveExplicitQuarterlyCadence(withoutCadence, "Fonte: relatório semanal do funil.");

    expect((normalized.proposal as any).cadence).toBe("Ação 2: revisar semanalmente as exceções até o fim do trimestre.");
    expect(untouched).toBe(withoutCadence);
  });
});
