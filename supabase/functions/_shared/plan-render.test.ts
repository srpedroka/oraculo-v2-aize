import { describe, expect, it } from "vitest";
import { renderPlanForWhatsApp } from "./plan-render.ts";

describe("renderização canônica para WhatsApp", () => {
  it("preserva campos materiais, hierarquia, decisões e rastreabilidade", () => {
    const rendered = renderPlanForWhatsApp({
      empresa: "Empresa Q4E",
      area: "Comercial",
      tipo: "quarterly",
      periodo: "T3 2027",
      rastreabilidade: { schema_version: 1, origem: "proposta_confirmada", tipo_sessao: "quarterly" },
      referencia: { objetivo_anual: "Tornar o funil previsível", objetivos_trimestre: ["Elevar disciplina do CRM"] },
      quarterly: {
        papel_area: { missao: "Dar previsibilidade à receita", contribuicao: ["Manter o funil confiável"] },
        diagnostico: { forcas: ["Liderança experiente"], gargalos: ["Atualização irregular"] },
        alinhamento_anual: { objetivo: "Tornar o funil previsível" },
        riscos: ["Rotina não se sustentar"],
        trade_offs: ["Adiar automações secundárias"],
        cadencia: "Revisão semanal",
      },
      objetivos: [{
        numero: 1,
        titulo: "Elevar disciplina do CRM",
        resultado: "Elevar adoção de 40% para 85%",
        atual: "40%",
        indicador: "Vendedores ativos",
        meta: "85%",
        fonte: "Relatório do CRM",
        prazo: "2027-09-30",
        responsavel: "PERSON_FIXTURE_MANAGER",
        vinculo: "Tornar o funil previsível",
        acoes: [{
          descricao: "Treinar líderes",
          responsavel: "PERSON_FIXTURE_MANAGER",
          prazo: "2027-08-15",
          criterio: "Todos treinados",
        }],
      }],
    }, { version: 3, origin: "session" });

    for (const expected of [
      "Versão 3 · Origem: Proposta confirmada",
      "Alinhamento anual: Tornar o funil previsível",
      "Baseline: 40%",
      "Indicador: Vendedores ativos",
      "Meta: 85%",
      "Prazo: 2027-09-30",
      "Fonte: Relatório do CRM",
      "Treinar líderes",
      "critério: Todos treinados",
      "Acompanhamento: Revisão semanal",
    ]) expect(rendered).toContain(expected);
  });

  it("mostra o conteúdo completo de fechamento", () => {
    const rendered = renderPlanForWhatsApp({
      tipo: "month_close",
      periodo: "Jun 2027",
      fechamento: {
        resumo: "Objetivo parcialmente atingido",
        percentual: 70,
        aprendizados: ["Treinar por equipe"],
        pendencias: ["Concluir migração"],
        decisoes: ["Rolar para julho"],
        proximo_periodo: "Jul 2027",
      },
    });

    expect(rendered).toContain("Aprendizados: Treinar por equipe");
    expect(rendered).toContain("Pendências: Concluir migração");
    expect(rendered).toContain("Decisões: Rolar para julho");
    expect(rendered).toContain("Próximo período: Jul 2027");
  });

  it("preserva a hierarquia e as decisões do plano mensal", () => {
    const rendered = renderPlanForWhatsApp({
      tipo: "monthly",
      periodo: "Ago 2027",
      referencia: { objetivo_anual: "Crescer com previsibilidade", objetivos_trimestre: ["Tornar o CRM confiável"] },
      monthly: {
        alinhamento_trimestral: { objetivo: "Tornar o CRM confiável" },
        capacidade: { acoes_comprometidas: 2, maximo_acoes_comprometidas: 5 },
        decisoes_pendentes: [{ item: "Migrar carteira antiga", decisao: "Renegociar para setembro" }],
        backlog: ["Automação secundária"],
        riscos: ["Baixa adesão"],
        bloqueios: ["Integração pendente"],
        cadencia: "Check-in semanal",
        proximo_compromisso: "Primeira revisão em 07/08",
      },
    });

    expect(rendered).toContain("Alinhamento trimestral: Tornar o CRM confiável");
    expect(rendered).toContain("Capacidade: 2/5 ações comprometidas");
    expect(rendered).toContain("Migrar carteira antiga → Renegociar para setembro");
    expect(rendered).toContain("Backlog: Automação secundária");
    expect(rendered).toContain("Próximo compromisso: Primeira revisão em 07/08");
  });
});
