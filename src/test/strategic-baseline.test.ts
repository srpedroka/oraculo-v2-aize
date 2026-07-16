import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReferenceCase } from "../../scripts/strategic-reference-cases";
import {
  aggregateBaseline,
  buildBaselineChecks,
  buildManagerTurns,
  expectedPeriod,
  expectedProposalType,
  proposalShouldExist,
  selectRubricForCase,
} from "../../scripts/strategic-baseline-lib";

function fixture(overrides: Partial<ReferenceCase> = {}): ReferenceCase {
  return {
    caseId: "Q2B-FIXTURE-001",
    riskId: "QUARTERLY-EXPERIENCED-MANAGER",
    title: "Fixture",
    deliveryId: "DELIV-QUARTERLY-PLAN",
    classification: "strategic-content",
    channels: ["web"],
    sessionType: "quarterly",
    methods: ["deterministic"],
    rubrics: ["RUBRIC-CONDUCTION", "RUBRIC-QUARTERLY-PLAN"],
    criticalFailures: ["CRIT-SCOPE-001"],
    input: {
      opening: "Abrir o trimestre.",
      facts: ["Fato confirmado."],
      upperLevelContext: "Objetivo anual aplicavel: crescer com previsibilidade.",
      histories: [],
      competingContext: [],
    },
    expected: {
      requiredBehaviors: ["Preservar contexto."],
      forbiddenBehaviors: ["Nao inventar."],
      minimumEvidence: ["Escopo correto."],
      confirmationPolicy: "single-final",
      mutationPolicy: "proposal-confirmation",
      judgePolicy: "required",
    },
    ...overrides,
  };
}

describe("Q3 strategic baseline", () => {
  it("mapeia ritual, periodo e completa a resposta do gestor sintetico sem liberar invencao do Oraculo", () => {
    const experienced = fixture();
    expect(expectedProposalType(experienced)).toBe("save_quarterly_plan");
    expect(expectedPeriod(experienced)).toBe("T3 2027");
    expect(proposalShouldExist(experienced)).toBe(true);

    const incomplete = fixture({ riskId: "QUARTERLY-MISSING-BASELINE" });
    expect(proposalShouldExist(incomplete)).toBe(true);
    expect(buildManagerTurns(incomplete).join("\n")).toContain("Nao invente numero");
    expect(buildManagerTurns(incomplete).join("\n")).toContain("o gestor escolheu esta formula");
  });

  it("marca escrita prematura, repeticao de confirmacao e cleanup como gates deterministas", () => {
    const checks = buildBaselineChecks({
      sessionScopeMatches: true,
      proposalExpected: true,
      proposalCreated: true,
      proposalTypeMatches: true,
      confirmationExpected: true,
      executionCompleted: true,
      businessSnapshotObserved: true,
      preConfirmSnapshotUnchanged: false,
      confirmationPromptCount: 2,
      confirmationCallCount: 1,
      databaseChangedAfterConfirmation: true,
      canonicalDocumentCreated: true,
      judgeSnapshotUnchanged: true,
      judgeSnapshotObserved: true,
      cleanupSucceeded: false,
    });
    expect(checks.filter((check) => check.status === "fail").map((check) => check.id)).toEqual([
      "CRIT-PREMATURE-WRITE-001",
      "CRIT-MULTI-CONFIRM-001",
      "DET-CLEANUP-001",
    ]);
  });

  it("envia ao judge somente rubricas e falhas humanas aplicaveis ao caso", () => {
    const rubric = {
      rubrics: [
        { id: "RUBRIC-CONDUCTION" },
        { id: "RUBRIC-QUARTERLY-PLAN" },
        { id: "RUBRIC-MONTHLY-PLAN" },
      ],
      criticalFailures: [
        { id: "CRIT-SCOPE-001", checkType: "human" },
        { id: "CRIT-DIVERGENCE-001", checkType: "deterministic" },
      ],
    };
    const selected = selectRubricForCase(rubric, fixture());
    expect(selected.rubrics.map((item: any) => item.id)).toEqual(["RUBRIC-CONDUCTION", "RUBRIC-QUARTERLY-PLAN"]);
    expect(selected.criticalFailures.map((item: any) => item.id)).toEqual(["CRIT-SCOPE-001"]);
  });

  it("agrega as duas rodadas sem escolher somente a melhor", () => {
    const aggregate = aggregateBaseline([
      {
        phase: "Q2B", caseId: "CASE", round: 1, status: "measured",
        rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score: 60 }],
        criticalFailureCandidates: ["CRIT-SCOPE-001"], failedChecks: [],
        generationCostUsd: 0.1, judgeCostUsd: 0.05, latencyMs: 100,
        defectClasses: ["routing"], reportPath: "/private/one.json",
      },
      {
        phase: "Q2B", caseId: "CASE", round: 2, status: "measured",
        rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score: 100 }],
        criticalFailureCandidates: [], failedChecks: [],
        generationCostUsd: 0.2, judgeCostUsd: 0.05, latencyMs: 300,
        defectClasses: [], reportPath: "/private/two.json",
      },
    ]);
    expect(aggregate.rubricScores[0].average).toBe(80);
    expect(aggregate.runCount).toBe(2);
    expect(aggregate.totalCostUsd).toBeCloseTo(0.4);
  });

  it("mantem bloqueio de producao, limpeza e livro de custos no executor", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain("assertEvaluationEnvironment(process.env)");
    expect(source).toContain("destroyEvaluationOrg(handle)");
    expect(source).toContain("appendLedger(summary");
    expect(source).toContain("owner-approved");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });
});
