import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReferenceCase } from "../../scripts/strategic-reference-cases";
import { hasGroundedRelativeHistoricalPeriod } from "../../scripts/strategic-q4ab-validation";
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

  it("repete na Q4M somente o caso trimestral de area equivalente", () => {
    const source = readFileSync("scripts/strategic-q4m-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-EQUIVALENT-AREA-003"');
    expect(source).toContain('executeCase(item, "Q2B", 1');
    expect(source).toContain('runLabel: "q4m"');
    expect(source).toContain('ledgerLabel: "Q4M"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4N somente a segunda rodada do caso CRM que sofreu timeout", () => {
    const source = readFileSync("scripts/strategic-q4n-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-ACTIVITY-OBJECTIVE-002"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4n"');
    expect(source).toContain('ledgerLabel: "Q4N"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).toContain("adaptiveRepairReasonCounts?.quarterly_complete_block_unchallenged");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4W somente o fechamento mensal parcial e retoma a Q5D", () => {
    const smoke = readFileSync("scripts/strategic-q4w-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2D-MONTH-CLOSE-PARTIAL-001"');
    expect(smoke).toContain('executeCase(item, "Q2D", 1');
    expect(smoke).toContain('runLabel: "q4w"');
    expect(smoke).toContain('ledgerLabel: "Q4W"');
    expect(smoke).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(smoke).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(smoke).not.toContain("strategic-q5-progress.json");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('normalizedReference === "Q4W"');
    expect(runner).toContain('? "Q2D"');
    expect(runner).toContain('targetPhase === "Q2D" ? "Q5D"');
  });

  it("repete na Q4X somente o fechamento trimestral aberto e retoma a Q5D", () => {
    const smoke = readFileSync("scripts/strategic-q4x-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2D-QUARTER-CLOSE-OPEN-DECISION-002"');
    expect(smoke).toContain('executeCase(item, "Q2D", 1');
    expect(smoke).toContain('runLabel: "q4x"');
    expect(smoke).toContain('ledgerLabel: "Q4X"');
    expect(smoke).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(smoke).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(smoke).not.toContain("strategic-q5-progress.json");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('["Q4W", "Q4X", "Q4Y"].includes(normalizedReference)');
    expect(runner).toContain('targetPhase === "Q2D" ? "Q5D"');
  });

  it("repete na Q4Y somente a revisao estrategica bloqueada e retoma a Q5D", () => {
    const smoke = readFileSync("scripts/strategic-q4y-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2D-STRATEGIC-REVIEW-BOUNDARY-003"');
    expect(smoke).toContain('executeCase(item, "Q2D", 1');
    expect(smoke).toContain('runLabel: "q4y"');
    expect(smoke).toContain('ledgerLabel: "Q4Y"');
    expect(smoke).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(smoke).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(smoke).not.toContain("strategic-q5-progress.json");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('normalizedReference === "Q4Y"');
    expect(runner).toContain('targetPhase === "Q2D" ? "Q5D"');
  });

  it("repete na Q4Z somente o owner anual experiente da regressao limpa", () => {
    const smoke = readFileSync("scripts/strategic-q4z-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-EXPERIENCED-OWNER-005"');
    expect(smoke).toContain('executeCase(item, "Q2A", 1');
    expect(smoke).toContain('runLabel: "q4z"');
    expect(smoke).toContain('ledgerLabel: "Q4Z"');
    expect(smoke).toContain("objectives.length !== 4");
    expect(smoke).toContain("projects.length !== 4");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AA somente a prioridade trimestral que falhou ao vincular", () => {
    const smoke = readFileSync("scripts/strategic-q4aa-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2B-QUARTERLY-PRIORITY-OVERLOAD-006"');
    expect(smoke).toContain('executeCase(item, "Q2B", 1');
    expect(smoke).toContain('runLabel: "q4aa"');
    expect(smoke).toContain('ledgerLabel: "Q4AA"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AB somente a meta anual recorrente com ano fabricado", () => {
    const smoke = readFileSync("scripts/strategic-q4ab-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-REPEATED-GOAL-004"');
    expect(smoke).toContain('executeCase(item, "Q2A", 1');
    expect(smoke).toContain('runLabel: "q4ab"');
    expect(smoke).toContain('ledgerLabel: "Q4AB"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AC somente a atividade anual aceita sem desafio", () => {
    const smoke = readFileSync("scripts/strategic-q4ac-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003"');
    expect(smoke).toContain('executeCase(item, "Q2A", 1');
    expect(smoke).toContain('runLabel: "q4ac"');
    expect(smoke).toContain('ledgerLabel: "Q4AC"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AD somente o owner anual experiente reentrevistado", () => {
    const smoke = readFileSync("scripts/strategic-q4ad-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-EXPERIENCED-OWNER-005"');
    expect(smoke).toContain('executeCase(item, "Q2A", 1');
    expect(smoke).toContain('runLabel: "q4ad"');
    expect(smoke).toContain('ledgerLabel: "Q4AD"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AE somente a aspiracao anual R2 que ignorou o bloco completo", () => {
    const smoke = readFileSync("scripts/strategic-q4ae-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-VAGUE-ASPIRATION-001"');
    expect(smoke).toContain('executeCase(item, "Q2A", 2');
    expect(smoke).toContain('runLabel: "q4ae"');
    expect(smoke).toContain('ledgerLabel: "Q4AE"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AF somente a atividade anual R2 com contagem ambigua", () => {
    const smoke = readFileSync("scripts/strategic-q4af-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003"');
    expect(smoke).toContain('executeCase(item, "Q2A", 2');
    expect(smoke).toContain('runLabel: "q4af"');
    expect(smoke).toContain('ledgerLabel: "Q4AF"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AG somente a meta trimestral sem baseline R1", () => {
    const smoke = readFileSync("scripts/strategic-q4ag-smoke.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2B-QUARTERLY-MISSING-BASELINE-005"');
    expect(smoke).toContain('executeCase(item, "Q2B", 1');
    expect(smoke).toContain('runLabel: "q4ag"');
    expect(smoke).toContain('ledgerLabel: "Q4AG"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4AI somente o gestor trimestral experiente R2 e retoma a Q5B", () => {
    const smoke = readFileSync("scripts/strategic-q4ai-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008"');
    expect(smoke).toContain('executeCase(item, "Q2B", 2');
    expect(smoke).toContain('runLabel: "q4ai"');
    expect(smoke).toContain('ledgerLabel: "Q4AI"');
    expect(smoke).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(smoke).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(smoke).not.toContain("strategic-q5-progress.json");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('normalizedReference === "Q4AI"');
    expect(runner).toContain("incremental-q4ai");
  });

  it("repete na Q4AJ somente a saida trimestral com risco estruturado", () => {
    const smoke = readFileSync("scripts/strategic-q4aj-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008"');
    expect(smoke).toContain('executeCase(item, "Q2B", 2');
    expect(smoke).toContain('runLabel: "q4aj"');
    expect(smoke).toContain('ledgerLabel: "Q4AJ"');
    expect(smoke).toContain("[object Object]");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('normalizedReference === "Q4AJ"');
    expect(runner).toContain("incremental-q4aj");
  });

  it("repete na Q4AK somente o gestor trimestral que recebeu KPI nao escolhido", () => {
    const smoke = readFileSync("scripts/strategic-q4ak-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2B-QUARTERLY-EXPERIENCED-MANAGER-008"');
    expect(smoke).toContain('executeCase(item, "Q2B", 2');
    expect(smoke).toContain('runLabel: "q4ak"');
    expect(smoke).toContain('ledgerLabel: "Q4AK"');
    expect(smoke).toContain("quarterlyKpiLinks");
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('normalizedReference === "Q4AK"');
    expect(runner).toContain("incremental-q4ak");
  });

  it("repete na Q4AL somente a pendencia mensal herdada R2", () => {
    const smoke = readFileSync("scripts/strategic-q4al-smoke.ts", "utf8");
    const runner = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(smoke).toContain('CASE_ID = "Q2C-MONTHLY-INHERITED-PENDING-002"');
    expect(smoke).toContain('executeCase(item, "Q2C", 2');
    expect(smoke).toContain('runLabel: "q4al"');
    expect(smoke).toContain('ledgerLabel: "Q4AL"');
    expect(smoke).not.toContain("bkswkfazkjilwfzwzthz");
    expect(runner).toContain('["Q4U", "Q4V", "Q4AL"].includes(normalizedReference)');
    expect(runner).toContain("incremental-q4al");
  });

  it("mantem o caso de produtividade no escopo industrial declarado pela fixture", () => {
    const block = JSON.parse(readFileSync("tests/evals/strategic-quality/cases/q2b-quarterly.json", "utf8"));
    const item = block.cases.find((candidate: ReferenceCase) => candidate.caseId === "Q2B-QUARTERLY-MISSING-BASELINE-005");
    const baseline = readFileSync("scripts/strategic-baseline.ts", "utf8");

    expect(item?.input.areaName).toBe("Producao");
    expect(baseline).toContain("item.input.areaName?.trim()");
  });

  it("mantem o projeto do sistema uma unica vez no bloco anual de atividade", () => {
    const item = fixture({
      caseId: "Q2A-ANNUAL-ACTIVITY-AS-STRATEGY-003",
      riskId: "ANNUAL-ACTIVITY-AS-STRATEGY",
      sessionType: "strategic",
    });
    const supplement = buildManagerTurns(item)[2];

    expect(supplement).toContain("Projetos (4):");
    expect(supplement.match(/implantar sistema de gestao/g)).toHaveLength(1);
    expect(supplement).toContain("aceite por integracao validada e 90% das areas treinadas");
  });

  it("aceita periodo historico relativo sem exigir uma frase literal", () => {
    expect(hasGroundedRelativeHistoricalPeriod(["o plano anterior mediu atraso"])).toBe(true);
    expect(hasGroundedRelativeHistoricalPeriod(["no ciclo anterior a meta ficou abaixo"])).toBe(true);
    expect(hasGroundedRelativeHistoricalPeriod(["meta de 2026 ficou abaixo"])).toBe(false);
  });

  it("repete na Q4O somente a segunda rodada da area equivalente com erro de envelope", () => {
    const source = readFileSync("scripts/strategic-q4o-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-EQUIVALENT-AREA-003"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4o"');
    expect(source).toContain('ledgerLabel: "Q4O"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4P somente a primeira rodada da meta sem baseline", () => {
    const source = readFileSync("scripts/strategic-q4p-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-MISSING-BASELINE-005"');
    expect(source).toContain('executeCase(item, "Q2B", 1');
    expect(source).toContain('runLabel: "q4p"');
    expect(source).toContain('ledgerLabel: "Q4P"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4Q somente a segunda rodada de excesso de prioridades apos timeout", () => {
    const source = readFileSync("scripts/strategic-q4q-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-PRIORITY-OVERLOAD-006"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4q"');
    expect(source).toContain('ledgerLabel: "Q4Q"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4R somente a segunda rodada de excesso de prioridades com retry util", () => {
    const source = readFileSync("scripts/strategic-q4r-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-PRIORITY-OVERLOAD-006"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4r"');
    expect(source).toContain('ledgerLabel: "Q4R"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4S somente a segunda rodada que duplicou acoes transversais", () => {
    const source = readFileSync("scripts/strategic-q4s-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-PRIORITY-OVERLOAD-006"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4s"');
    expect(source).toContain('ledgerLabel: "Q4S"');
    expect(source).toContain("rawActionCount !== uniqueActions.length");
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4T somente a segunda rodada instavel da hipotese de KPI", () => {
    const source = readFileSync("scripts/strategic-q4t-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2B-QUARTERLY-KPI-HYPOTHESIS-007"');
    expect(source).toContain('executeCase(item, "Q2B", 2');
    expect(source).toContain('runLabel: "q4t"');
    expect(source).toContain('ledgerLabel: "Q4T"');
    expect(source).toContain('acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4T")');
    expect(source).toContain('text(kpiLinks[0]?.kpiKey) !== "operating_margin"');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("repete na Q4U somente a primeira rodada da pendencia mensal herdada", () => {
    const source = readFileSync("scripts/strategic-q4u-smoke.ts", "utf8");
    expect(source).toContain('CASE_ID = "Q2C-MONTHLY-INHERITED-PENDING-002"');
    expect(source).toContain('executeCase(item, "Q2C", 1');
    expect(source).toContain('runLabel: "q4u"');
    expect(source).toContain('ledgerLabel: "Q4U"');
    expect(source).toContain('acquireStrategicPhaseLock(resolve(".agents-private"), "q5", "Q4U")');
    expect(source).toContain('comparable(objective.result) === comparable(pending.item)');
    expect(source).toContain("MINIMUM_PER_RUBRIC = 80");
    expect(source).toContain("MINIMUM_JOINT_AVERAGE = 85");
    expect(source).not.toContain("strategic-q5-progress.json");
    expect(source).not.toContain("bkswkfazkjilwfzwzthz");
  });

  it("reinicia Q5 somente apos uma correcao aprovada preservando medicoes e custo anteriores", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('["Q4G", "Q4H", "Q4I", "Q4J", "Q4K", "Q4L", "Q4M"]');
    expect(source).toContain("correctionReference: normalizedReference");
    expect(source).toContain("...progress.runs.map((run) => ({ ...run, calibrationReason, archivedAt }))");
    expect(source).toContain("progress.restarts = [");
    expect(source).toContain("progress.runs = []");
    expect(source).toContain("progress.deterministic = []");
    expect(source).toContain('"2026-07-17.q5-regression-r3"');
    expect(source).toContain("progress.initialCumulativeCostUsd = ledger.cumulativePlanCostUsd");
    expect(source).toContain('["Q4I", "Q4J", "Q4K", "Q4L", "Q4M"].includes(normalizedReference)');
    expect(source).toContain('normalizedReference === "Q4J"');
    expect(source).toContain('progress.runs.filter((run) => run.phase !== "Q2B")');
    expect(source).toContain("Q5A e matriz deterministica mantidas");
    expect(source).toContain('"2026-07-17.q5-regression-r5"');
    expect(source).toContain('"2026-07-17.q5-regression-r6"');
    expect(source).toContain('"2026-07-17.q5-regression-r8"');
  });

  it("retoma Q5 arquivando somente a medicao bloqueada e preservando as aprovacoes", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('["Q4N", "Q4O", "Q4P", "Q4Q", "Q4R", "Q4S", "Q4T", "Q4U", "Q4V", "Q4W", "Q4X", "Q4Y", "Q4AG", "Q4AH", "Q4AI", "Q4AJ", "Q4AK", "Q4AL"]');
    expect(source).toContain('run.status === "execution-error" || run.qualityStatus === "blocked"');
    expect(source).toContain("const failedReportPaths = new Set(failedRuns.map((run) => run.reportPath))");
    expect(source).toContain("!failedReportPaths.has(run.reportPath)");
    expect(source).toContain("!archivedReportPaths.has(run.reportPath)");
    expect(source).toContain(".map((run) => ({ ...run, calibrationReason, archivedAt }))");
    expect(source).toContain('"2026-07-17.q5-regression-r8-incremental-q4n"');
    expect(source).toContain('"2026-07-18.q5-regression-r8-incremental-q4o"');
    expect(source).toContain('"2026-07-18.q5-regression-r8-incremental-q4p"');
    expect(source).toContain('"2026-07-18.q5-regression-r14-incremental-q4y"');
    expect(source).toContain('"2026-07-18.q5-regression-r8-incremental-q4q"');
    expect(source).toContain('"2026-07-18.q5-regression-r8-incremental-q4r"');
    expect(source).toContain('"2026-07-18.q5-regression-r8-incremental-q4s"');
    expect(source).toContain('"2026-07-18.q5-regression-r9-incremental-q4t"');
    expect(source).toContain('"2026-07-18.q5-regression-r10-incremental-q4u"');
    expect(source).toContain('"2026-07-18.q5-regression-r11-incremental-q4v"');
    expect(source).toContain('"2026-07-18.q5-regression-r12-incremental-q4w"');
    expect(source).toContain('"2026-07-18.q5-regression-r13-incremental-q4x"');
    expect(source).toContain('normalizedReference === "Q4W"');
    expect(source).toContain('normalizedReference === "Q4AJ"');
    expect(source).toContain('normalizedReference === "Q4AK"');
    expect(source).toContain('normalizedReference === "Q4AL"');
    expect(source).toContain('["Q4U", "Q4V", "Q4AL"].includes(normalizedReference)');
    expect(source).toContain("medicao(oes) aprovada(s) preservada(s)");
    expect(source).toContain('command === "resume-after-correction"');
  });

  it("abre a regressao geral limpa somente depois de todas as medicoes verdes", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain("async function startCleanQ5Regression()");
    expect(source).toContain('correctionReference: "Q5-CLEAN-REGRESSION"');
    expect(source).toContain('progress.baselineVersion = "2026-07-18.q5-clean-regression-r15"');
    expect(source).toContain("progress.runs.length !== expectedRuns");
    expect(source).toContain("progress.runs.map(baselineRunKey)");
    expect(source).toContain("uniqueRuns.size !== expectedRuns");
    expect(source).toContain("blockedRuns.length");
    expect(source).toContain("progress.runs = []");
    expect(source).toContain("progress.deterministic = []");
    expect(source).toContain('command === "start-clean-regression"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4Z", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain("async function restartCleanQ5AfterCorrection(correctionReference: string)");
    expect(source).toContain('Q4Z: "2026-07-18.q5-clean-regression-r16-q4z"');
    expect(source).toContain('progress.baselineVersion.includes("q5-clean-regression")');
    expect(source).toContain("progress.baselineVersion = nextBaseline");
    expect(source).toContain('command === "restart-clean-after-correction"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AA", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AA: "2026-07-18.q5-clean-regression-r17-q4aa"');
    expect(source).toContain("progress.baselineVersion = nextBaseline");
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AB", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AB: "2026-07-18.q5-clean-regression-r18-q4ab"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AC", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AC: "2026-07-18.q5-clean-regression-r19-q4ac"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AD", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AD: "2026-07-18.q5-clean-regression-r20-q4ad"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AE", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AE: "2026-07-18.q5-clean-regression-r21-q4ae"');
  });

  it("reinicia toda a regressao limpa depois da correcao Q4AF", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('Q4AF: "2026-07-18.q5-clean-regression-r22-q4af"');
  });

  it("retoma somente a medicao bloqueada depois da correcao Q4AG", () => {
    const source = readFileSync("scripts/strategic-baseline.ts", "utf8");
    expect(source).toContain('"Q4Y", "Q4AG"');
    expect(source).toContain('"2026-07-18.q5-clean-regression-r22-incremental-q4ag"');
    expect(source).not.toContain('Q4AG: "2026-07-18.q5-clean-regression-r23-q4ag"');
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
