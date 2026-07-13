import { describe, expect, it } from "vitest";
import { matchAreaCandidate, normalizeAreaName } from "./area-matching.ts";

const areas = [
  { id: "prod", name: "Produção" },
  { id: "sales", name: "Comercial" },
  { id: "finance", name: "Financeiro" },
];

describe("matching conservador de áreas", () => {
  it("normaliza prefixos e acentos", () => {
    expect(normalizeAreaName("Departamento de Produção")).toBe("producao");
  });

  it("vincula aliases semânticos quando existe candidato único", () => {
    const match = matchAreaCandidate("Industrial", areas);
    expect(match.area?.id).toBe("prod");
    expect(match.strategy).toBe("semantic");
  });

  it("recusa alias semântico ambíguo", () => {
    const match = matchAreaCandidate("industrial", [
      { id: "a", name: "Produção" },
      { id: "b", name: "Operações industriais" },
    ]);
    expect(match.area).toBeNull();
    expect(match.ambiguous.map((area) => area.id)).toEqual(["a", "b"]);
  });

  it("não inventa correspondência fraca", () => {
    expect(matchAreaCandidate("Jurídico", areas).area).toBeNull();
  });
});
