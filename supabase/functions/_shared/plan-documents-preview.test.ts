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

  it("projects a strategic review with before, after and channel traceability", () => {
    const content = buildPlanDocumentPreview({
      type: "apply_strategic_review",
      period: "2027",
      motivo_revisao: "Fechamento validado",
      adjustments: [
        { objectiveId: "objective-a", title: "Objetivo A", field: "current", from: "68%", to: "72%", because: "Fechamento validado" },
        { objectiveId: "objective-b", title: "Objetivo B", field: "target", from: "15%", to: "12%", because: "Fechamento validado" },
      ],
    }, {
      organizationName: "ORG_FIXTURE_A",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "strategic_review",
      period: "2027",
    }) as any;

    expect(content).toMatchObject({
      tipo: "strategic_review",
      periodo: "2027",
      motivo_revisao: "Fechamento validado",
      rastreabilidade: { origem: "proposta_confirmada", tipo_sessao: "strategic_review" },
      ajustes: [
        { titulo: "Objetivo A", campo: "current", de: "68%", para: "72%" },
        { titulo: "Objetivo B", campo: "target", de: "15%", para: "12%" },
      ],
    });
    expect(content.antes).toEqual(expect.arrayContaining([
      expect.objectContaining({ titulo: "Objetivo A", valor: "68%" }),
      expect.objectContaining({ titulo: "Objetivo B", valor: "15%" }),
    ]));
    expect(content.depois).toEqual(expect.arrayContaining([
      expect.objectContaining({ titulo: "Objetivo A", valor: "72%" }),
      expect.objectContaining({ titulo: "Objetivo B", valor: "12%" }),
    ]));
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    expect(whatsapp).toContain("Objetivo A: current de 68% para 72%");
    expect(whatsapp).toContain("Objetivo B: target de 15% para 12%");
    expect(whatsapp).toContain("Origem: Proposta confirmada");
  });

  it("renders the semester diagnosis and second-semester direction without replacing the annual plan", () => {
    const content = buildPlanDocumentPreview({
      type: "apply_strategic_review",
      period: "2026",
      motivo_revisao: "Fechamento de T1 e T2",
      semester_review: {
        executiveSummary: "A receita avançou, mas a margem ficou abaixo do esperado.",
        confirmedAdvances: ["CRM implantado"],
        lessons: ["Menos prioridades melhorou a entrega"],
      },
      second_semester_plan: {
        focus: "Recuperar margem sem perder previsibilidade",
        priorities: [{ title: "Revisar mix", expectedResult: "Margem em 10%", owner: "Diretoria", deadline: "2026-09-30" }],
      },
      adjustments: [],
    }, {
      organizationName: "ORG_FIXTURE_A",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "strategic_review",
      period: "2026",
    }) as any;

    expect(content.plano_anual_original_preservado).toBe(true);
    expect(content.revisao_semestre.resumo_executivo).toContain("receita");
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    expect(whatsapp).toContain("Revisão do primeiro semestre");
    expect(whatsapp).toContain("Plano do segundo semestre");
    expect(whatsapp).toContain("Plano Estratégico Anual original foi preservado");
  });

  it("projects explicit updates to the current annual plan before confirmation", () => {
    const content = buildPlanDocumentPreview({
      type: "apply_strategic_review",
      period: "2026",
      review_cycle: "midyear",
      motivo_revisao: "Evidências do primeiro semestre mudaram as prioridades",
      semester_review: {
        executiveSummary: "A produtividade passou a ser a principal restrição do ano.",
      },
      second_semester_plan: {
        focus: "Recuperar produtividade sem elevar custo fixo",
      },
      annual_plan_update: {
        mode: "update_current_year",
        planChanges: {
          executiveSummary: "O segundo semestre prioriza produtividade e margem.",
          themes: ["Produtividade com margem"],
        },
        objectiveChanges: [{
          operation: "update",
          objectiveId: "objective-a",
          title: "Evolução da fábrica",
          because: "As paradas reduziram a produtividade no primeiro semestre",
          changes: { target: "20%", deadline: "2026-12-31" },
        }, {
          operation: "create",
          because: "A margem exige uma prioridade explícita",
          objective: {
            title: "Recuperar margem operacional",
            result: "Margem recuperada no segundo semestre",
            metric: "Margem operacional",
            target: "8%",
            deadline: "2026-12-31",
            owner: "Diretoria",
            source: "DRE mensal",
          },
        }],
      },
    }, {
      organizationName: "ORG_FIXTURE_A",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "strategic_review",
      period: "2026",
    }) as any;

    expect(content.plano_anual_original_preservado).toBe(false);
    expect(content.plano_anual_atualizado).toBe(true);
    expect(content.atualizacao_plano_anual).toMatchObject({
      modo: "update_current_year",
      alteracoes_plano: { themes: ["Produtividade com margem"] },
      mudancas_objetivos: [
        { operacao: "update", objetivo_id: "objective-a" },
        { operacao: "create", titulo: "Recuperar margem operacional" },
      ],
    });
    const whatsapp = renderPlanForWhatsApp(content, { version: 1, origin: "session" });
    expect(whatsapp).toContain("Atualizado: Evolução da fábrica");
    expect(whatsapp).toContain("Criado: Recuperar margem operacional");
    expect(whatsapp).toContain("Plano Estratégico Anual vigente foi atualizado");
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

  it("renders structured quarterly risks as readable text", () => {
    const content = buildPlanDocumentPreview({
      type: "save_quarterly_plan",
      risks: [{ descricao: "Baixa adesão dos vendedores", mitigacao: "Acompanhamento semanal" }],
      quarterlyObjectives: [{
        title: "Elevar adoção do sistema",
        current: "40%",
        target: "80%",
      }],
    }, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_A",
      sessionType: "quarterly",
      period: "T3 2027",
    }) as any;

    expect(content.quarterly.riscos).toEqual([
      "Baixa adesão dos vendedores (mitigação: Acompanhamento semanal)",
    ]);
    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Baixa adesão dos vendedores");
    expect(whatsapp).toContain("Acompanhamento semanal");
    expect(whatsapp).not.toContain("[object Object]");
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
        baseline: "40%",
        achieved: "50%",
        target: "60%",
        verdict: "partial",
        statusFinal: "at_risk",
        progressFinal: 50,
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

    expect(content.objetivos[0]).toMatchObject({
      atual: "40%",
      atingido: "50%",
      meta: "60%",
      veredito: "partial",
      status_final: "at_risk",
      progresso_final: 50,
    });
    expect(content.fechamento.aprendizados).toEqual(["Envolver o fornecedor no início"]);
    expect(content.fechamento.pendencias[0]).toContain("renegociar");
    expect(content.fechamento.pendencias[0]).not.toContain("[object Object]");
    expect(content.fechamento.pulso_gestao).toMatchObject({ confianca: "yellow", bloqueio: "dependência externa" });
    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Baseline: 40%");
    expect(whatsapp).toContain("Atingido: 50%");
    expect(whatsapp).toContain("Veredito: partial");
    expect(whatsapp).not.toContain("Baseline: 50%");
    expect(whatsapp).toContain("Meta: 60%");
    expect(whatsapp).toContain("Confiança: yellow");
    expect(whatsapp).not.toContain("[object Object]");
  });

  it("preserves quarterly alignment and complete roll decision", () => {
    const content = buildPlanDocumentPreview({
      type: "quarter_close",
      period: "T2 2027",
      nextPeriod: "T3 2027",
      completionRate: 78,
      annualAlignment: { status: "linked", strategicObjectiveTitle: "Aumentar previsibilidade comercial" },
      reviews: [{
        title: "Elevar adoção do processo",
        result: "Atingido 78% contra meta 80%",
        current: "78%",
        target: "80%",
        owner: "PERSON_FIXTURE_MANAGER",
        decision: "roll",
        reason: "dependência externa subestimada",
        newScope: "integração principal",
        newDeadline: "2027-07-31",
        learning: "Validar dependência no início",
      }],
    }, {
      organizationName: "ORG_FIXTURE_A",
      areaName: "Comercial",
      managerName: "PERSON_FIXTURE_MANAGER",
      sessionType: "quarter_close",
      period: "T2 2027",
    }) as any;

    expect(content.referencia).toMatchObject({
      objetivo_anual: "Aumentar previsibilidade comercial",
      objetivos_trimestre: ["Elevar adoção do processo"],
    });
    expect(content.objetivos[0]).toMatchObject({ atual: "", atingido: "78%", meta: "80%", responsavel: "PERSON_FIXTURE_MANAGER" });
    expect(content.fechamento.pendencias[0]).toContain("integração principal");
    expect(content.fechamento.pendencias[0]).toContain("novo prazo: 2027-07-31");
    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Alinhamento anual: Aumentar previsibilidade comercial");
    expect(whatsapp).toContain("novo prazo: 2027-07-31");
  });
});
