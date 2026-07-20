import { describe, expect, it } from "vitest";
import { enforceIntentPolicies, type IntentClassification } from "./intent-router.ts";

const aiStart: IntentClassification = {
  intent: "start_planning",
  planning_type: "strategic",
  period_hint: null,
  confidence: 0.92,
};

describe("política determinística de início de planejamento", () => {
  it("bloqueia a IA de transformar uma ação em plano estratégico", () => {
    expect(enforceIntentPolicies("Planejar o calendário de migração e instalação do sistema", aiStart)).toEqual({
      intent: "other",
      planning_type: null,
      period_hint: null,
      confidence: 1,
    });
  });

  it("aceita pedido explícito e corrige o tipo inferido pela IA", () => {
    expect(enforceIntentPolicies("Quero fazer um plano trimestral para Comercial", aiStart).planning_type).toBe("quarterly");
  });

  it("mantém pedido genérico para o sistema perguntar o tipo", () => {
    expect(enforceIntentPolicies("Quero planejar", aiStart)).toMatchObject({ intent: "start_planning", planning_type: null });
  });

  it("protege a revisão anual mesmo quando a IA classifica como criação", () => {
    expect(enforceIntentPolicies("Quero revisar o plano estratégico anual com base no primeiro semestre", aiStart))
      .toMatchObject({ intent: "start_planning", planning_type: "strategic_review", confidence: 1 });
  });
});
