import { describe, expect, it } from "vitest";
import { validateMonthlyGuidanceEnvelope, validateMonthlyProposal } from "./monthly-guidance.ts";

const completeProposal = {
  type: "save_monthly_plan",
  period: "Mai 2027",
  quarterlyAlignment: {
    status: "linked",
    quarterlyObjectiveId: "quarterly-1",
    quarterlyObjectiveTitle: "Aumentar adoção do CRM",
    rationale: "",
  },
  capacity: { maxCommittedActions: 5 },
  pendingDecisions: [],
  backlog: [],
  risks: ["Fornecedor atrasar integração"],
  blockers: [],
  cadence: "Semanal",
  nextCommitment: "Validar painel na sexta-feira",
  objectives: [{
    title: "Elevar adoção ativa do CRM",
    result: "Adoção ativa do CRM sobe de 40% para 55%",
    type: "harvest",
    metric: "Vendedores ativos no CRM",
    current: "40%",
    target: "55%",
    source: "Relatório semanal de uso",
    deadline: "2027-05-31",
    owner: "Diego",
    period: "Mai 2027",
    linkedQuarterlyObjectiveId: "quarterly-1",
    parentTitle: "Aumentar adoção do CRM",
    actions: [{
      description: "Treinar vendedores inativos",
      owner: "Diego",
      deadline: "2027-05-12",
      completionCriterion: "Todos os vendedores inativos treinados",
    }],
  }],
};

describe("contrato de condução mensal Q4C", () => {
  it("aceita um plano mensal verificável e vinculado ao trimestre correto", () => {
    expect(validateMonthlyProposal(completeProposal, "Mai 2027")).toEqual([]);
  });

  it("bloqueia troca para os rituais anual ou trimestral", () => {
    expect(validateMonthlyGuidanceEnvelope({
      envelope: { reply: "Vamos montar o plano trimestral primeiro." },
      sessionPeriod: "Mai 2027",
    })).toContain("monthly_ritual_switch");
  });

  it("limita o plano a três resultados mensais", () => {
    const proposal = { ...completeProposal, objectives: Array.from({ length: 4 }, () => completeProposal.objectives[0]) };
    expect(validateMonthlyProposal(proposal, "Mai 2027")).toContain("monthly_result_overload");
  });

  it("limita a cinco ações comprometidas no plano inteiro", () => {
    const objective = { ...completeProposal.objectives[0], actions: Array.from({ length: 6 }, () => completeProposal.objectives[0].actions[0]) };
    expect(validateMonthlyProposal({ ...completeProposal, objectives: [objective] }, "Mai 2027")).toContain("monthly_action_overload");
  });

  it("exige indicador, baseline, alvo, fonte, prazo e dono", () => {
    const objective = { ...completeProposal.objectives[0], current: "", source: "" };
    expect(validateMonthlyProposal({ ...completeProposal, objectives: [objective] }, "Mai 2027")).toContain("monthly_unverifiable_objective");
  });

  it("mantém os prazos dentro do mês planejado", () => {
    const objective = {
      ...completeProposal.objectives[0],
      deadline: "2027-06-01",
      actions: [{ ...completeProposal.objectives[0].actions[0], deadline: "2027-04-30" }],
    };
    const reasons = validateMonthlyProposal({ ...completeProposal, objectives: [objective] }, "Mai 2027");
    expect(reasons).toContain("monthly_deadline_out_of_period");
    expect(reasons).toContain("monthly_action_out_of_period");
  });

  it("aceita exceção trimestral explícita sem inventar vínculo", () => {
    const objective = { ...completeProposal.objectives[0], linkedQuarterlyObjectiveId: "", parentTitle: "" };
    const proposal = {
      ...completeProposal,
      quarterlyAlignment: { status: "exception", rationale: "O trimestre ainda não foi planejado; o mês cobre uma obrigação contratual." },
      objectives: [objective],
    };
    expect(validateMonthlyProposal(proposal, "Mai 2027")).toEqual([]);
  });

  it("recusa exceção sem motivo ou acompanhada de vínculo", () => {
    const proposal = { ...completeProposal, quarterlyAlignment: { status: "exception", rationale: "" } };
    const reasons = validateMonthlyProposal(proposal, "Mai 2027");
    expect(reasons).toContain("monthly_alignment_exception_missing_reason");
    expect(reasons).toContain("monthly_exception_with_quarterly_link");
  });

  it("exige decisão explícita para pendência herdada", () => {
    const proposal = {
      ...completeProposal,
      pendingDecisions: [{ item: "Integração", origin: "Abr 2027", reason: "Fornecedor atrasou", decision: "" }],
    };
    expect(validateMonthlyProposal(proposal, "Mai 2027")).toContain("monthly_pending_decision_incomplete");
  });

  it("exige opções executáveis ao conduzir uma pendência ainda indecisa", () => {
    expect(validateMonthlyGuidanceEnvelope({
      envelope: { reply: "Qual ponto ainda precisa ser decidido?" },
      sessionPeriod: "Mai 2027",
      userMessage: "A integração ficou pendente e ainda não decidi o que fazer.",
    })).toContain("monthly_pending_without_options");

    expect(validateMonthlyGuidanceEnvelope({
      envelope: { reply: "Você prefere rolar com novo prazo, renegociar, cortar ou deixar no backlog?" },
      sessionPeriod: "Mai 2027",
      userMessage: "A integração ficou pendente e ainda não decidi o que fazer.",
    })).not.toContain("monthly_pending_without_options");
  });

  it("preserva a decisão de rolar uma pendência com origem e motivo", () => {
    const proposal = {
      ...completeProposal,
      pendingDecisions: [{ item: "Integração", origin: "Abr 2027", reason: "Fornecedor atrasou", decision: "roll" }],
    };
    expect(validateMonthlyProposal(proposal, "Mai 2027")).toEqual([]);
  });

  it("recusa atividade descrita como resultado final", () => {
    const objective = { ...completeProposal.objectives[0], title: "Implantar CRM", result: "Implantar CRM" };
    expect(validateMonthlyProposal({ ...completeProposal, objectives: [objective] }, "Mai 2027")).toContain("monthly_activity_as_result");
  });
});
