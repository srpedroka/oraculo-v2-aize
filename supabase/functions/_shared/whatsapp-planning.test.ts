import { describe, expect, it } from "vitest";
import { periodForPlanning } from "./periods.ts";
import { explicitPlanningRequest, isExplicitPlanningRequest, resolveAreaFromMessage, wantsDocumentAttachment } from "./whatsapp-planning.ts";

const areas = [
  { id: "commercial", name: "Comercial" },
  { id: "production", name: "Produção" },
  { id: "finance", name: "Contabilidade e Financeiro" },
];

describe("roteamento de planejamento pelo WhatsApp", () => {
  it("detecta um pedido explícito de novo plano trimestral", () => {
    expect(explicitPlanningRequest("Quero fazer um plano trimestral para a área Comercial")).toBe("quarterly");
  });

  it("não trata uma simples menção ao trimestre como troca de sessão", () => {
    expect(explicitPlanningRequest("O objetivo do trimestre é implantar o sistema")).toBeNull();
  });

  it("não transforma uma ação iniciada por Planejar em nova sessão", () => {
    expect(isExplicitPlanningRequest("Planejar o calendário de migração e instalação do sistema")).toBe(false);
  });

  it("reconhece pedido genérico de planejamento sem inventar o tipo", () => {
    expect(isExplicitPlanningRequest("Quero planejar")).toBe(true);
    expect(explicitPlanningRequest("Quero planejar")).toBeNull();
  });

  it("separa revisão do plano anual de criação de um plano anual novo", () => {
    expect(explicitPlanningRequest("Quero revisar o plano estratégico anual da GAAM com os resultados do primeiro semestre"))
      .toBe("strategic_review");
    expect(explicitPlanningRequest("Vamos atualizar o planejamento anual com as evidências de T1 e T2"))
      .toBe("strategic_review");
    expect(explicitPlanningRequest("Quero criar o plano estratégico anual de 2027"))
      .toBe("strategic");
  });

  it("resolve a área citada dentro da frase inteira", () => {
    expect(resolveAreaFromMessage("Vamos planejar o departamento comercial", areas).area?.id).toBe("commercial");
  });

  it("entende terceiro trimestre por extenso", () => {
    expect(periodForPlanning("quarterly", null, "plano do terceiro trimestre de 2026")).toBe("T3 2026");
  });

  it("reconhece pedido de documento como arquivo", () => {
    expect(wantsDocumentAttachment("É possível colar aqui o documento pronto?")).toBe(true);
    expect(wantsDocumentAttachment("Faça um resumo do documento")).toBe(false);
  });
});
