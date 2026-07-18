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

  it("keeps inherited monthly continuity in the canonical document", () => {
    const content = buildPlanDocumentPreview({
      type: "save_monthly_plan",
      quarterlyAlignment: { status: "linked", quarterlyObjectiveTitle: "Qualidade do funil" },
      pendingDecisions: [{ item: "integração do CRM", origin: "Jun 2027", reason: "dependência do fornecedor", decision: "roll" }],
      confidence: "amarela",
      objectives: [{
        title: "integração do CRM",
        result: "integração do CRM",
        metric: "oportunidades com próxima ação",
        current: "40%",
        target: "55%",
        source: "relatório semanal",
        deadline: "2027-07-31",
        owner: "PERSON_FIXTURE_A",
        actions: [{
          description: "Rolar a integração do CRM",
          owner: "PERSON_FIXTURE_A",
          deadline: "2027-07-20",
          completionCriterion: "integração validada e aceite registrado",
        }],
      }],
    }, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "monthly",
      period: "Jul 2027",
    }) as any;

    expect(content.objetivos[0].resultado).toBe("Elevar oportunidades com próxima ação de 40% para 55%");
    expect(content.monthly.decisoes_pendentes[0]).toMatchObject({ origem: "Jun 2027", decisao: "roll" });
    expect(content.monthly.bloqueios).toEqual(["Dependência do fornecedor"]);
    expect(content.monthly.cadencia).toContain("2027-07-20");
    expect(content.monthly.confianca).toBe("amarela");
    expect(content.monthly.proximo_compromisso).toContain("aceite registrado");
  });

  it("renders a structured partial close without object coercion", () => {
    const content = buildPlanDocumentPreview({
      type: "month_close",
      period: "Jun 2027",
      nextPeriod: "Jul 2027",
      completionRate: 50,
      reviews: [{
        title: "Qualidade do funil",
        result: "Atingido 50% contra meta 60%",
        current: "50%",
        target: "60%",
        learning: "Envolver o fornecedor no início",
      }],
      pendencies: [{ kind: "action", decision: "renegotiate", reason: "dependência externa", newDeadline: "2027-07-20" }],
      managementPulse: { confidence: "yellow", blocker: "dependência externa", nextCommitment: "Validar cronograma em 2027-07-05" },
    }, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "month_close",
      period: "Jun 2027",
    }) as any;

    expect(content.objetivos[0]).toMatchObject({ atual: "50%", meta: "60%" });
    expect(content.fechamento.aprendizados).toEqual(["Envolver o fornecedor no início"]);
    expect(content.fechamento.pendencias[0]).toContain("renegociar");
    expect(content.fechamento.pendencias[0]).not.toContain("[object Object]");
    expect(content.fechamento.pulso_gestao).toMatchObject({ confianca: "yellow", bloqueio: "dependência externa" });
    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Meta: 60%");
    expect(whatsapp).toContain("Confiança: yellow");
    expect(whatsapp).not.toContain("[object Object]");
  });
});
