import { describe, expect, it } from "vitest";
import { buildPlanDocumentPreview } from "./plan-documents.ts";
import { renderPlanForWhatsApp } from "./plan-render.ts";

describe("canonical plan document preview", () => {
  it("projects an annual proposal into the same canonical shape used by derived outputs", () => {
    const content = buildPlanDocumentPreview({
      type: "save_strategic_plan",
      year: 2027,
      drivers: { purpose: "Simplificar", vision: "Crescer com previsibilidade", values: ["Clareza"] },
      swot: { strengths: ["Equipe"], weaknesses: ["Margem"], opportunities: ["Base"], threats: ["Fornecedor"] },
      themes: ["Foco"],
      renunciations: ["Adiar canal"],
      risks: ["Adesão"],
      historicalLessons: ["O ciclo anterior teve prioridades demais"],
      rituals: ["Revisão mensal"],
      objectives: [{
        title: "Elevar margem",
        type: "harvest",
        current: "8%",
        metric: "Margem operacional",
        target: "10%",
        source: "DRE",
        deadline: "2027-12-31",
        owner: "PERSON_FIXTURE_A",
        strategies: ["Revisar mix"],
      }],
      projects: [{
        name: "Programa de margem",
        owner: "PERSON_FIXTURE_A",
        deadline: "2027-09-30",
        linkedObjectiveTitle: "Elevar margem",
      }],
    }, {
      organizationName: "ORG_FIXTURE_A",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "strategic",
      period: "2027",
    });

    expect(content).toMatchObject({
      empresa: "ORG_FIXTURE_A",
      tipo: "strategic",
      periodo: "2027",
      rastreabilidade: { origem: "proposta_confirmada" },
      objetivos: [{ atual: "8%", meta: "10%", fonte: "DRE" }],
    });
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    expect(whatsapp).toContain("Baseline: 8%");
    expect(whatsapp).toContain("Meta: 10%");
    expect(whatsapp).toContain("Versão 1");
  });
});
