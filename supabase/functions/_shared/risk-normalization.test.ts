import { describe, expect, it } from "vitest";
import { normalizeRisk, normalizeRiskList } from "./risk-normalization.ts";

describe("risk normalization", () => {
  it("keeps text risks and renders structured mitigation without object coercion", () => {
    expect(normalizeRisk("Baixa adesão")).toBe("Baixa adesão");
    expect(normalizeRisk({ descricao: "Baixa adesão", mitigacao: "Acompanhamento semanal" }))
      .toBe("Baixa adesão (mitigação: Acompanhamento semanal)");
  });

  it("uses the first populated alias and discards unknown objects", () => {
    expect(normalizeRiskList([], [{ description: "Fornecedor", mitigation: "Plano alternativo" }]))
      .toEqual(["Fornecedor (mitigação: Plano alternativo)"]);
    expect(normalizeRiskList([{ internal: "not visible" }])).toEqual([]);
    expect(normalizeRiskList({ mitigacao: "Revisão quinzenal" })).toEqual(["Mitigação: Revisão quinzenal"]);
  });
});
