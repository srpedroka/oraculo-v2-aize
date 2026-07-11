import assert from "node:assert/strict";
import { extractHistoricalHeaderMetadata } from "../supabase/functions/_shared/historical-header.ts";
import { buildHistoricalImportSuggestion } from "../supabase/functions/_shared/historical-import-structure.ts";
import { matchAreaCandidate } from "../supabase/functions/_shared/area-matching.ts";

const areas = [{ id: "marketing", name: "Marketing" }];

const industrialMatch = matchAreaCandidate("Industrial", [{ id: "production", name: "Produção" }]);
assert.equal(industrialMatch.area?.id, "production");
assert.equal(industrialMatch.strategy, "semantic");

const ambiguousOperations = matchAreaCandidate("Industrial", [
  { id: "production", name: "Produção" },
  { id: "operations", name: "Operações" },
]);
assert.equal(ambiguousOperations.area, null);
assert.deepEqual(ambiguousOperations.ambiguous.map((area) => area.id), ["production", "operations"]);

const realCase = extractHistoricalHeaderMetadata(
  "PLANO MENSAL DE OBJETIVOS E AÇÕES – MARKETING – ABRIL/2026 (VERSÃO FINAL AJUSTADA)\n1. CONTEXTO RÁPIDO ● Empresa: GAAM Gabinetes ● Departamento: Marketing ● Gestora: Larissa ● Mês/Ano: Abril/2026 ● Trimestre (T2 – Ativação): validar materiais\n2. OBJETIVOS DO MÊS",
  "plano-marketing.pdf",
  areas,
  "GAAM Gabinetes",
);
assert.deepEqual(
  {
    type: realCase.documentType,
    area: realCase.matchedAreaId,
    period: realCase.primaryPeriod,
    year: realCase.year,
    quarter: realCase.quarter,
    month: realCase.month,
    manager: realCase.managerName,
    company: realCase.sourceCompany,
    title: realCase.title,
  },
  {
    type: "monthly",
    area: "marketing",
    period: "Abr 2026",
    year: 2026,
    quarter: 2,
    month: 4,
    manager: "Larissa",
    company: "GAAM Gabinetes",
    title: "Plano mensal de objetivos e ações",
  },
);

const quarterly = extractHistoricalHeaderMetadata("PLANO TRIMESTRAL COMERCIAL – T3 2025", null, [], null);
assert.equal(quarterly.documentType, "quarterly");
assert.equal(quarterly.primaryPeriod, "T3 2025");

const annual = extractHistoricalHeaderMetadata("PLANO ESTRATÉGICO\nAno: 2026\nOBJETIVOS\nVisão 2030", null, [], null);
assert.equal(annual.primaryPeriod, "2026");

const missingArea = extractHistoricalHeaderMetadata("PLANO MENSAL\nDepartamento: Vendas\nMês/Ano: 04/2026", null, areas, null);
assert.equal(missingArea.matchedAreaId, null);
assert.ok(missingArea.conflicts.some((conflict) => conflict.field === "area" && conflict.required));

const conflictingQuarter = extractHistoricalHeaderMetadata("PLANO MENSAL ABRIL/2026\nTrimestre: T3", null, [], null);
assert.ok(conflictingQuarter.conflicts.some((conflict) => conflict.field === "quarter" && conflict.required));

const otherCompany = extractHistoricalHeaderMetadata("PLANO MENSAL\nEmpresa: Outra Ltda\nMês/Ano: Abr/2026", null, [], "GAAM Gabinetes");
assert.ok(otherCompany.conflicts.some((conflict) => conflict.field === "company" && conflict.required));

const approved = extractHistoricalHeaderMetadata("PLANO MENSAL DE VENDAS – MAIO/2025 (VERSÃO FINAL APROVADA)", null, [], null);
assert.equal(approved.sourceVersion, "Final aprovada");
assert.equal(approved.title, "Plano mensal de vendas");

const baseSuggestion = {
  documentType: "monthly" as const,
  areaId: null,
  areaName: null,
  period: "2026",
  periodFound: true,
  title: "Indicadores mensais",
  summary: "",
  confidence: 0.9,
  lowConfidenceFields: [],
};
const complementary = buildHistoricalImportSuggestion({
  sourceName: null,
  extractedText: "Faturamento | 2026 | Meta\nJan | 10 | 12\n\nMargem | 2026 | Meta\nJan | 5 | 6",
  suggestion: baseSuggestion,
  tableExpanded: false,
});
assert.equal(complementary.conflicts.filter((conflict) => conflict.kind === "table_choice").length, 0);

const competing = buildHistoricalImportSuggestion({
  sourceName: null,
  extractedText: "Faturamento | 2026 | Meta\nJan | 10 | 12\n\nFaturamento | 2026 | Meta\nJan | 11 | 12",
  suggestion: baseSuggestion,
  tableExpanded: false,
});
assert.equal(competing.conflicts.filter((conflict) => conflict.kind === "table_choice").length, 1);

console.log("Historical import fixtures: OK");
