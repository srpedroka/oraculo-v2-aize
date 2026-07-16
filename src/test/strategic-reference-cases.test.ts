import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatKpiCompact,
  KPI_DASHBOARD_FRACTION_DIGITS,
  KPI_TOOLTIP_FRACTION_DIGITS,
  latestClosedKpiPeriod,
} from "../lib/kpi";
import {
  type ReferenceCaseBlock,
  type ReferenceCaseManifest,
  validateReferenceCaseCatalog,
} from "../../scripts/strategic-reference-cases";

const root = process.cwd();
const manifestPath = resolve(root, "tests/evals/strategic-quality/cases/q2-catalog.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReferenceCaseManifest;
const blocks = manifest.blocks.map((declaration) => (
  JSON.parse(readFileSync(resolve(root, declaration.file), "utf8")) as ReferenceCaseBlock
));
const rubric = JSON.parse(readFileSync(resolve(root, "tests/evals/strategic-quality/rubric.json"), "utf8"));
const coverage = JSON.parse(readFileSync(resolve(root, "tests/evals/strategic-quality/deliverable-coverage.json"), "utf8"));
const humanCatalog = readFileSync(resolve(root, "docs/STRATEGIC_QUALITY_CASES.md"), "utf8");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("strategic quality reference cases Q2", () => {
  it("covers Q2A to Q2E with the owner-briefed minimum of 29 cases", () => {
    const result = validateReferenceCaseCatalog({ manifest, blocks, rubric, coverage });

    expect(result.caseCount).toBe(29);
    expect(result.phaseCounts).toEqual({ Q2A: 5, Q2B: 8, Q2C: 4, Q2D: 5, Q2E: 7 });
    expect(result.coveredDeliverables).toHaveLength(15);
    expect(result.coveredCriticalFailures).toHaveLength(16);
  });

  it("keeps Q2 as a zero-cost reference catalog without production or runtime mutation", () => {
    expect(manifest.gateStatus).toBe("owner-approved");
    expect(manifest.executionPolicy).toEqual({
      referenceCasesOnly: true,
      productionAccess: false,
      runtimeMutation: false,
      providerCalls: false,
      expectedCostUsd: 0,
    });
  });

  it("starts annual, then quarterly, monthly, reviews and information outputs", () => {
    expect(manifest.blocks.map((block) => block.phase)).toEqual(["Q2A", "Q2B", "Q2C", "Q2D", "Q2E"]);
    expect(blocks[0]?.cases.every((item) => item.deliveryId === "DELIV-ANNUAL-PLAN")).toBe(true);
    expect(blocks[1]?.cases.every((item) => item.deliveryId === "DELIV-QUARTERLY-PLAN")).toBe(true);
    expect(blocks[2]?.cases.every((item) => item.deliveryId === "DELIV-MONTHLY-PLAN")).toBe(true);
  });

  it("makes expected and forbidden behavior independently reviewable", () => {
    for (const block of blocks) {
      for (const item of block.cases) {
        expect(item.input.facts.length, item.caseId).toBeGreaterThan(0);
        expect(item.input.upperLevelContext.trim(), item.caseId).not.toBe("");
        expect(item.expected.requiredBehaviors.length, item.caseId).toBeGreaterThan(0);
        expect(item.expected.forbiddenBehaviors.length, item.caseId).toBeGreaterThan(0);
        expect(item.expected.minimumEvidence.length, item.caseId).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the human gate synchronized with every machine-readable case", () => {
    for (const block of blocks) {
      for (const item of block.cases) {
        expect(humanCatalog, item.caseId).toContain(item.caseId);
      }
    }
  });

  it("anchors the Q2E dashboard fixture to the production formatters", () => {
    expect(latestClosedKpiPeriod(new Date(2027, 6, 16))).toEqual({ year: 2027, month: 6 });
    expect(formatKpiCompact(1_254_320.456, "currency", {
      maximumFractionDigits: KPI_DASHBOARD_FRACTION_DIGITS,
    })).toBe("R$ 1,25 mi");
    expect(formatKpiCompact(1_254_320.456, "currency", {
      maximumFractionDigits: KPI_TOOLTIP_FRACTION_DIGITS,
    })).toBe("R$ 1,2543 mi");
  });

  it("prioritizes deterministic checks for Q2E and reserves a judge for relevance", () => {
    const q2e = blocks.find((block) => block.phase === "Q2E");
    expect(q2e).toBeDefined();
    const memoryCase = q2e?.cases.find((item) => item.deliveryId === "DELIV-MEMORY-CONTEXT");
    const otherCases = q2e?.cases.filter((item) => item.deliveryId !== "DELIV-MEMORY-CONTEXT") ?? [];

    expect(memoryCase?.expected.judgePolicy).toBe("optional");
    expect(memoryCase?.methods).toContain("ai-judge-read-only");
    expect(otherCases.every((item) => item.expected.judgePolicy === "not-applicable")).toBe(true);
    expect(otherCases.every((item) => item.methods.some((method) => [
      "deterministic",
      "fixture",
      "visual",
      "audit",
      "accessibility",
    ].includes(method)))).toBe(true);
  });

  it("rejects production access, duplicated cases and sensitive fixture content", () => {
    const productionManifest = clone(manifest);
    productionManifest.executionPolicy.productionAccess = true;
    expect(() => validateReferenceCaseCatalog({ manifest: productionManifest, blocks, rubric, coverage }))
      .toThrow(/producao/);

    const duplicatedBlocks = clone(blocks);
    duplicatedBlocks[1].cases[0].caseId = duplicatedBlocks[0].cases[0].caseId;
    expect(() => validateReferenceCaseCatalog({ manifest, blocks: duplicatedBlocks, rubric, coverage }))
      .toThrow(/formato invalido|duplicado/);

    const sensitiveBlocks = clone(blocks);
    sensitiveBlocks[0].cases[0].input.opening = "Contatar person@example.com";
    expect(() => validateReferenceCaseCatalog({ manifest, blocks: sensitiveBlocks, rubric, coverage }))
      .toThrow(/identificador ou credencial/);
  });
});
