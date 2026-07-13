import { describe, expect, it } from "vitest";
import { periodForPlanning } from "./periods.ts";
import { explicitPlanningRequest, resolveAreaFromMessage, wantsDocumentAttachment } from "./whatsapp-planning.ts";

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
