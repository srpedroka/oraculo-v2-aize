import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Criterion {
  id: string;
  weight: number;
}

interface RubricFile {
  schemaVersion: number;
  rubricVersion: string;
  ratingScale: Array<{ rating: number }>;
  thresholds: {
    minimumPerRubric: number;
    minimumJointAverage: number;
    ranges: Array<{ id: string; minimum: number; maximum: number }>;
  };
  rubrics: Array<{ id: string; criteria: Criterion[] }>;
  criticalFailures: Array<{ id: string; checkType: string; requiredEvidence: string }>;
  costPolicy: {
    authorizedLimitUsd: number;
    warningAtUsd: number;
    preventiveStopAtUsd: number;
    includedComponents: string[];
    caseFields: string[];
  };
}

interface CoverageFile {
  schemaVersion: number;
  coverageVersion: string;
  requiredRoutes: string[];
  requiredSessionTypes: string[];
  evaluationOrder: string[];
  deliverables: Array<{
    id: string;
    classification: string;
    phase: string;
    routes: string[];
    sessionTypes: string[];
    rubrics: string[];
    methods: string[];
    gate: string;
  }>;
}

interface BaselineFile {
  schemaVersion: number;
  baselineVersion: string;
  sourceCommit: string;
  runtimeAssignments: Array<{ function: string; provider: string; model: string }>;
  codeArtifacts: Array<{ path: string; sha256: string }>;
}

const root = process.cwd();
const rubricPath = resolve(root, "tests/evals/strategic-quality/rubric.json");
const baselinePath = resolve(root, "tests/evals/strategic-quality/baseline.json");
const standardPath = resolve(root, "docs/STRATEGIC_QUALITY_STANDARD.md");
const reviewPath = resolve(root, "tests/evals/strategic-quality/human-review-template.md");
const coveragePath = resolve(root, "tests/evals/strategic-quality/deliverable-coverage.json");
const appPath = resolve(root, "src/App.tsx");
const sessionEnginePath = resolve(root, "supabase/functions/_shared/session-engine.ts");

const rubricSource = readFileSync(rubricPath, "utf8");
const baselineSource = readFileSync(baselinePath, "utf8");
const standardSource = readFileSync(standardPath, "utf8");
const reviewSource = readFileSync(reviewPath, "utf8");
const coverageSource = readFileSync(coveragePath, "utf8");
const appSource = readFileSync(appPath, "utf8");
const sessionEngineSource = readFileSync(sessionEnginePath, "utf8");
const rubric = JSON.parse(rubricSource) as RubricFile;
const baseline = JSON.parse(baselineSource) as BaselineFile;
const coverage = JSON.parse(coverageSource) as CoverageFile;

describe("strategic quality standard Q0 R2", () => {
  it("starts with the annual plan and keeps every rubric at 100 points", () => {
    expect(rubric.schemaVersion).toBe(2);
    expect(rubric.rubricVersion).toBe("2026-07-16.q0-r2");
    expect(rubric.rubrics).toHaveLength(7);

    const rubricIds = rubric.rubrics.map((item) => item.id);
    const criterionIds = rubric.rubrics.flatMap((item) => item.criteria.map((criterion) => criterion.id));

    expect(rubricIds).toEqual([
      "RUBRIC-CONDUCTION",
      "RUBRIC-ANNUAL-PLAN",
      "RUBRIC-QUARTERLY-PLAN",
      "RUBRIC-MONTHLY-PLAN",
      "RUBRIC-REVIEW-CLOSE",
      "RUBRIC-INFORMATION-QUALITY",
      "RUBRIC-DERIVED-OUTPUT",
    ]);

    expect(new Set(rubricIds).size).toBe(rubricIds.length);
    expect(new Set(criterionIds).size).toBe(criterionIds.length);
    for (const item of rubric.rubrics) {
      expect(item.criteria.reduce((total, criterion) => total + criterion.weight, 0)).toBe(100);
      expect(item.criteria.every((criterion) => criterion.weight > 0)).toBe(true);
    }
  });

  it("defines the rating scale, thresholds and continuous score ranges", () => {
    expect(rubric.ratingScale.map((item) => item.rating)).toEqual([0, 1, 2, 3, 4]);
    expect(rubric.thresholds.minimumPerRubric).toBe(80);
    expect(rubric.thresholds.minimumJointAverage).toBe(85);

    const ranges = rubric.thresholds.ranges;
    expect(ranges[0]?.minimum).toBe(0);
    expect(ranges.at(-1)?.maximum).toBe(100);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index].minimum - ranges[index - 1].maximum).toBeCloseTo(0.01, 8);
    }
  });

  it("maps every critical failure to a deterministic or human check", () => {
    const failureIds = rubric.criticalFailures.map((failure) => failure.id);
    expect(rubric.criticalFailures).toHaveLength(16);
    expect(new Set(failureIds).size).toBe(failureIds.length);
    expect(rubric.criticalFailures.every((failure) => ["deterministic", "human"].includes(failure.checkType))).toBe(true);
    expect(rubric.criticalFailures.every((failure) => failure.requiredEvidence.trim().length > 0)).toBe(true);
  });

  it("covers every app route and every planning ritual with an explicit gate", () => {
    expect(coverage.schemaVersion).toBe(1);
    expect(coverage.coverageVersion).toBe(rubric.rubricVersion);

    const deliverableIds = coverage.deliverables.map((item) => item.id);
    expect(new Set(deliverableIds).size).toBe(deliverableIds.length);
    expect(coverage.evaluationOrder).toEqual(deliverableIds);
    expect(coverage.evaluationOrder[0]).toBe("DELIV-ANNUAL-PLAN");
    expect(coverage.deliverables.every((item) => item.phase.trim() && item.methods.length > 0 && item.gate.trim())).toBe(true);

    const rubricIds = new Set(rubric.rubrics.map((item) => item.id));
    for (const item of coverage.deliverables) {
      expect(item.rubrics.every((rubricId) => rubricIds.has(rubricId)), item.id).toBe(true);
    }

    const routesInApp = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "*")
      .sort();
    expect([...coverage.requiredRoutes].sort()).toEqual(routesInApp);
    const coveredRoutes = new Set(coverage.deliverables.flatMap((item) => item.routes));
    expect(coverage.requiredRoutes.every((route) => coveredRoutes.has(route))).toBe(true);

    const sessionTypeDeclaration = sessionEngineSource.match(/export type PlanningSessionType\s*=\s*([^;]+);/)?.[1] ?? "";
    const sessionTypesInCode = [...sessionTypeDeclaration.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
    expect([...coverage.requiredSessionTypes].sort()).toEqual(sessionTypesInCode);
    const coveredSessionTypes = new Set(coverage.deliverables.flatMap((item) => item.sessionTypes));
    expect(coverage.requiredSessionTypes.every((type) => coveredSessionTypes.has(type))).toBe(true);
  });

  it("enforces the owner-approved cost boundaries", () => {
    expect(rubric.costPolicy.includedComponents.sort()).toEqual(["generation", "judge"]);
    expect(rubric.costPolicy.warningAtUsd).toBe(15);
    expect(rubric.costPolicy.preventiveStopAtUsd).toBe(19);
    expect(rubric.costPolicy.authorizedLimitUsd).toBe(20);
    expect(rubric.costPolicy.warningAtUsd).toBeLessThan(rubric.costPolicy.preventiveStopAtUsd);
    expect(rubric.costPolicy.preventiveStopAtUsd).toBeLessThan(rubric.costPolicy.authorizedLimitUsd);
    expect(rubric.costPolicy.caseFields).toEqual([
      "generationCostUsd",
      "judgeCostUsd",
      "totalCaseCostUsd",
      "cumulativePlanCostUsd",
    ]);
  });

  it("keeps committed evaluation material free of real identifiers and credential shapes", () => {
    const committedMaterial = [rubricSource, baselineSource, standardSource, reviewSource, coverageSource].join("\n");
    const forbiddenPatterns = [
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /\+55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,
      /\bsk-[A-Za-z0-9_-]{8,}\b/,
      /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
      /\beyJ[A-Za-z0-9_-]{20,}\b/,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(committedMaterial).not.toMatch(pattern);
    }
  });

  it("locks the prompt, conductor and model baseline against silent drift", () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.baselineVersion).toBe(rubric.rubricVersion);
    expect(baseline.sourceCommit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(baseline.runtimeAssignments.map((assignment) => assignment.function).sort()).toEqual([
      "background",
      "daily",
      "planning",
    ]);

    const artifactPaths = baseline.codeArtifacts.map((artifact) => artifact.path);
    expect(new Set(artifactPaths).size).toBe(artifactPaths.length);
    for (const artifact of baseline.codeArtifacts) {
      const currentHash = createHash("sha256")
        .update(readFileSync(resolve(root, artifact.path)))
        .digest("hex");
      expect(currentHash, artifact.path).toBe(artifact.sha256);
    }
  });
});
