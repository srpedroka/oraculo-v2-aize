import { describe, expect, it } from "vitest";
import { extractHistoricalHeaderMetadata } from "./historical-header.ts";
import { applyTablePeriodIfSafe, buildHistoricalImportSuggestion, extractTableCandidates, stableFingerprint } from "./historical-import-structure.ts";

const areas = [{ id: "marketing", name: "Marketing" }, { id: "producao", name: "Produção" }];

describe("metadados e estrutura do histórico", () => {
  it("extrai tipo, área, mês, trimestre, ano, gestor e versão do cabeçalho", () => {
    const metadata = extractHistoricalHeaderMetadata(
      "PLANO MENSAL DE OBJETIVOS E AÇÕES – MARKETING – ABRIL/2026 (VERSÃO FINAL)\nEmpresa: GAAM\nDepartamento: Marketing\nGestora: Larissa\nMês/Ano: Abril/2026\nTrimestre (T2 – Ativação): validar materiais",
      "plano.docx",
      areas,
      "GAAM",
    );
    expect(metadata).toMatchObject({
      documentType: "monthly",
      matchedAreaId: "marketing",
      managerName: "Larissa",
      year: 2026,
      month: 4,
      quarter: 2,
      primaryPeriod: "Abr 2026",
      sourceVersion: "Final",
    });
    expect(metadata.conflicts).toEqual([]);
  });

  it("sinaliza empresa e trimestre contraditórios", () => {
    const metadata = extractHistoricalHeaderMetadata(
      "PLANO MENSAL\nEmpresa: Outra Ltda\nDepartamento: Industrial\nMês/Ano: Abril/2026\nTrimestre: T3",
      null,
      areas,
      "GAAM",
    );
    expect(metadata.matchedAreaId).toBe("producao");
    expect(metadata.conflicts.map((conflict) => conflict.field)).toEqual(expect.arrayContaining(["quarter", "company"]));
  });

  it("extrai tabelas multi-ano com fingerprint estável", () => {
    const text = "Indicador | 2025 | 2026\nFaturamento | 100 | 120\nMargem | 5% | 6%";
    const tables = extractTableCandidates(text);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ years: [2025, 2026], rowCount: 2 });
    expect(stableFingerprint([" A  B "])).toBe(stableFingerprint(["a b"]));
  });

  it("não usa anos narrativos como período de tabela", () => {
    const suggestion = {
      documentType: "strategic" as const,
      areaId: null,
      areaName: null,
      period: "2026",
      periodFound: true,
      title: "Plano",
      summary: "Resumo",
      confidence: 0.9,
      lowConfidenceFields: [] as string[],
    };
    expect(applyTablePeriodIfSafe(suggestion, { tableExpanded: false, tableYears: [2025, 2026] }).period).toBe("2026");
    expect(applyTablePeriodIfSafe({ ...suggestion, periodFound: false }, { tableExpanded: true, tableYears: [2025, 2026] }).period).toBe("2025–2026");
  });

  it("substitui título que seja dump e mantém aviso de período ambíguo", () => {
    const result = buildHistoricalImportSuggestion({
      sourceName: "planejamento-comercial.docx",
      extractedText: '{"objetivos":["vender mais"]}',
      suggestion: {
        documentType: "quarterly",
        areaId: null,
        areaName: null,
        period: "",
        periodFound: false,
        title: '{"objetivos":["vender mais"]}',
        summary: "",
        confidence: 0.4,
        lowConfidenceFields: [],
      },
      tableExpanded: false,
    });
    expect(result.candidates[0]?.title).toBe("planejamento-comercial");
    expect(result.warnings).toContain("Período não identificado com clareza.");
  });
});
