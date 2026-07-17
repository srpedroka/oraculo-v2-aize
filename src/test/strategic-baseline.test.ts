import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReferenceCase } from "../../scripts/strategic-reference-cases";
import {
  aggregateBaseline,
  compareStrategicRegression,
  buildBaselineChecks,
  buildManagerTurns,
  expectedPeriod,
  expectedProposalType,
  phaseRunStopReason,
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
    expect(source).toContain("ORACULO_STRATEGIC_COHORT");
    expect(source).toContain("strategic-q5-comparison.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("interrompe a fase depois de persistir um gate de qualidade bloqueado", () => {
    const run = {
      phase: "Q2B" as const,
      caseId: "CASE",
      round: 1,
      status: "measured" as const,
      qualityStatus: "blocked" as const,
      rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score: 75 }],
      criticalFailureCandidates: [],
      failedChecks: [],
      generationCostUsd: 0.02,
      judgeCostUsd: 0.01,
      latencyMs: 1,
      defectClasses: [],
      reportPath: "/private/report.json",
    };
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");

    expect(phaseRunStopReason(run)).toBe("gate de qualidade bloqueado");
    expect(source.indexOf("writePrivateJson(PROGRESS_PATH, progress)")).toBeLessThan(source.indexOf("phaseRunStopReason(summary)"));
  });

  it("reexecuta na Q4G exatamente o primeiro caso anual da Q5 sem tocar seu progresso", () => {
    const source = readFileSync("scripts/strategic-q4g-smoke.ts", "utf8");
    expect(source).toContain("Q2A-ANNUAL-VAGUE-ASPIRATION-001");
    expect(source).toContain("executeCase(item, \"Q2A\", 1");
    expect(source).toContain("runLabel: \"q4g\"");
    expect(source).toContain("ledgerLabel: \"Q4G\"");
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("reexecuta na Q4H os cinco riscos anuais antes de reiniciar a Q5", () => {
    const source = readFileSync("scripts/strategic-q4h-smoke.ts", "utf8");
    expect(source).toContain("for (const item of block.cases)");
    expect(source).toContain("executeCase(item, \"Q2A\", 1");
    expect(source).toContain("runLabel: \"q4h\"");
    expect(source).toContain("ledgerLabel: \"Q4H\"");
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("reinicia Q5 somente apos uma correcao aprovada preservando medicoes e custo anteriores", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('["Q4G", "Q4H", "Q4I", "Q4J"]');
    expect(source).toContain("correctionReference: normalizedReference");
    expect(source).toContain("...progress.runs.map((run) => ({ ...run, calibrationReason, archivedAt }))");
    expect(source).toContain("progress.restarts = [");
    expect(source).toContain("progress.runs = []");
    expect(source).toContain("progress.deterministic = []");
    expect(source).toContain('"2026-07-17.q5-regression-r3"');
    expect(source).toContain("progress.initialCumulativeCostUsd = ledger.cumulativePlanCostUsd");
    expect(source).toContain('normalizedReference === "Q4I"');
    expect(source).toContain('normalizedReference === "Q4J"');
    expect(source).toContain('progress.runs.filter((run) => run.phase !== "Q2B")');
    expect(source).toContain("Q5A e matriz deterministica mantidas");
    expect(source).toContain('"2026-07-17.q5-regression-r5"');
  });

  it("reavalia somente o judge Q5 com escopo canonico e preserva a auditoria anterior", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain("rejudgeReportWithCanonicalScope");
    expect(source).toContain("reavaliacao com periodo e tipo canonicos da sessao explicitos");
    expect(source).toContain("judgeHistory");
    expect(source).toContain("Q5-REJUDGE:");
    expect(source).toContain("run.qualityStatus = qualityGate.status");
    expect(source).toContain("cleanup anterior incompleto");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("aprova somente uma Q5 completa, comparavel e dentro dos gates", () => {
    const run = (score: number, reportPath: string) => ({
      phase: "Q2B" as const,
      caseId: "CASE",
      round: 1,
      status: "measured" as const,
      rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score }],
      criticalFailureCandidates: [],
      failedChecks: [],
      generationCostUsd: 0.1,
      judgeCostUsd: 0.05,
      latencyMs: 100,
      defectClasses: [],
      reportPath,
    });
    const comparison = compareStrategicRegression({
      baselineRuns: [run(82, "/private/q3.json")],
      currentRuns: [run(90, "/private/q5.json")],
      baselineManagerTurns: { "CASE:R1": 4 },
      currentManagerTurns: { "CASE:R1": 4 },
      expectedRunKeys: ["CASE:R1"],
      deterministic: [{ caseId: "DET", status: "pending-human" }],
      expectedDeterministicCaseIds: ["DET"],
      coveredDeliveryIds: ["DELIVERY"],
      expectedDeliveryIds: ["DELIVERY"],
      cleanupFailures: [],
      inputMismatches: [],
      runtimeMismatches: [],
      cumulativeCostUsd: 4,
      authorizedLimitUsd: 20,
      minimumPerRubric: 80,
      minimumJointAverage: 85,
      maximumRubricRegression: 5,
      maximumMedianTurnIncreaseRatio: 0.25,
    });
    expect(comparison.status).toBe("approved-automatic");
    expect(comparison.current.jointAverage).toBe(90);
    expect(comparison.managerTurns).toEqual({ baselineMedian: 4, currentMedian: 4, increaseRatio: 0 });
  });

  it("bloqueia Q5 com nota baixa, falha critica, input divergente ou conversa longa", () => {
    const comparison = compareStrategicRegression({
      baselineRuns: [{
        phase: "Q2A", caseId: "CASE", round: 1, status: "measured",
        rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score: 90 }],
        criticalFailureCandidates: [], failedChecks: [], generationCostUsd: 0, judgeCostUsd: 0,
        latencyMs: 1, defectClasses: [], reportPath: "/private/q3.json",
      }],
      currentRuns: [{
        phase: "Q2A", caseId: "CASE", round: 1, status: "measured",
        rubricScores: [{ rubricId: "RUBRIC-CONDUCTION", score: 70 }],
        criticalFailureCandidates: ["CRIT-SCOPE-001"], failedChecks: [], generationCostUsd: 0, judgeCostUsd: 0,
        latencyMs: 1, defectClasses: [], reportPath: "/private/q5.json",
      }],
      baselineManagerTurns: { "CASE:R1": 4 },
      currentManagerTurns: { "CASE:R1": 6 },
      expectedRunKeys: ["CASE:R1"],
      deterministic: [],
      expectedDeterministicCaseIds: [],
      coveredDeliveryIds: ["DELIVERY"],
      expectedDeliveryIds: ["DELIVERY"],
      cleanupFailures: [],
      inputMismatches: ["Q5:CASE:R1"],
      runtimeMismatches: [],
      cumulativeCostUsd: 4,
      authorizedLimitUsd: 20,
      minimumPerRubric: 80,
      minimumJointAverage: 85,
      maximumRubricRegression: 5,
      maximumMedianTurnIncreaseRatio: 0.25,
    });
    expect(comparison.status).toBe("blocked");
    expect(comparison.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("falha critica"),
      expect.stringContaining("abaixo de 80"),
      expect.stringContaining("nao repetiram"),
      expect.stringContaining("mediana de turnos"),
    ]));
  });
});
