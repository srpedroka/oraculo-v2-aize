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

  it("renders repeated quarterly actions once as transversal execution", () => {
    const action = {
      description: "Publicar o padrão operacional",
      owner: "PERSON_FIXTURE_A",
      deadline: "2027-07-31",
      completionCriterion: "Padrão aprovado e acessível",
    };
    const content = buildPlanDocumentPreview({
      type: "save_quarterly_plan",
      annualAlignment: { status: "linked", strategicObjectiveTitle: "Elevar confiabilidade" },
      quarterlyObjectives: ["Prazo", "Retrabalho", "Capacidade"].map((title) => ({
        title,
        actions: [action],
        kpiLinks: title === "Prazo" ? [{ kpi: "Margem operacional", linkType: "hypothesis" }] : [],
      })),
    }, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Operações",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "quarterly",
      period: "T3 2027",
    }) as any;

    expect(content.quarterly.acoes_transversais).toHaveLength(1);
    expect(content.objetivos.every((objective: any) => objective.acoes.length === 0)).toBe(true);
    expect(content.objetivos[0].vinculos_kpi[0]).toMatchObject({
      chave: "operating_margin",
      nome: "Margem operacional",
    });
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    expect(whatsapp.match(/Publicar o padrão operacional/g)).toHaveLength(1);
    expect(whatsapp).toContain("Ações transversais");
    expect(whatsapp).toContain("KPIs vinculados: Margem operacional");
  });
});
