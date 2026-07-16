import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBudgetAllowsNextCall,
  assertEvaluationEnvironment,
  buildDeterministicChecks,
  buildSessionRequests,
  comparisonFingerprint,
  q1Gate,
  sanitizeEvaluationValue,
  usageCostUsd,
  validateStrategicEvaluationCase,
} from "../../scripts/strategic-eval-lib";

const casePath = resolve(process.cwd(), "tests/evals/strategic-quality/cases/q1-minimal-quarterly.json");
const evaluationCase = validateStrategicEvaluationCase(JSON.parse(readFileSync(casePath, "utf8")));
const policy = { authorizedLimitUsd: 20, warningAtUsd: 15, preventiveStopAtUsd: 19 };

describe("strategic evaluation runner Q1", () => {
  it("validates the synthetic minimal quarterly case", () => {
    expect(evaluationCase.caseId).toBe("Q1-SMOKE-QUARTERLY-001");
    expect(evaluationCase.turns).toHaveLength(7);
    expect(evaluationCase.expected.proposalType).toBe("save_quarterly_plan");
  });

  it("hard-blocks production and requires an explicitly disposable key", () => {
    const base = {
      SUPABASE_STAGING_URL: "https://stagingfixture.supabase.co",
      SUPABASE_STAGING_PROJECT_REF: "stagingfixture",
      SUPABASE_STAGING_ANON_KEY: "fixture-anon",
      SUPABASE_STAGING_SERVICE_ROLE_KEY: "fixture-service",
      SUPABASE_STAGING_ACCESS_TOKEN: "fixture-management",
      ORACULO_EVAL_API_KEY: "fixture-provider-key",
      ORACULO_EVAL_KEY_SCOPE: "staging-disposable",
    } as NodeJS.ProcessEnv;
    expect(() => assertEvaluationEnvironment(base)).not.toThrow();
    expect(() => assertEvaluationEnvironment({
      ...base,
      SUPABASE_STAGING_URL: "https://bkswkfazkjilwfzwzthz.supabase.co",
      SUPABASE_STAGING_PROJECT_REF: "bkswkfazkjilwfzwzthz",
    })).toThrow(/PRODUCAO/);
    expect(() => assertEvaluationEnvironment({ ...base, ORACULO_EVAL_KEY_SCOPE: "production" })).toThrow(/staging-disposable/);
    expect(() => assertEvaluationEnvironment({ ...base, SUPABASE_STAGING_ACCESS_TOKEN: "" })).toThrow(/ACCESS_TOKEN/);
  });

  it("uses the same session core for web and synthetic WhatsApp", () => {
    const ids = { orgId: "org-fixture", areaId: "area-fixture", sessionId: "session-fixture" };
    const web = buildSessionRequests(evaluationCase, ids);
    const whatsapp = buildSessionRequests({ ...evaluationCase, channel: "whatsapp" }, ids);
    expect(web.map((item) => item.action)).toEqual(whatsapp.map((item) => item.action));
    expect(web.filter((item) => item.action === "confirm")).toHaveLength(1);
    expect(whatsapp.every((item) => item.body.channel === "whatsapp")).toBe(true);
  });

  it("maps deterministic evidence to the objective critical checks", () => {
    const checks = buildDeterministicChecks({
      sessionScopeMatches: true,
      proposalTypeMatches: true,
      requiredFieldsPresent: true,
      preConfirmMutationCount: 0,
      confirmationPromptCount: 1,
      confirmationCallCount: 1,
      databaseMatchesProposal: true,
      documentMatchesProposal: true,
      judgeSnapshotUnchanged: true,
    });
    expect(checks.every((item) => item.status === "pass")).toBe(true);
    expect(checks.map((item) => item.id)).toEqual(expect.arrayContaining([
      "CRIT-PREMATURE-WRITE-001",
      "CRIT-MULTI-CONFIRM-001",
      "CRIT-DIVERGENCE-001",
      "CRIT-JUDGE-MUTATION-001",
    ]));
  });

  it("stops before the case or plan cost ceiling", () => {
    expect(() => assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: 0,
      currentCaseCostUsd: 0.2,
      reserveUsd: 0.1,
      caseLimitUsd: 1,
      policy,
    })).not.toThrow();
    expect(() => assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: 18.95,
      currentCaseCostUsd: 0,
      reserveUsd: 0.05,
      caseLimitUsd: 1,
      policy,
    })).toThrow(/parada preventiva/);
    expect(() => assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: 0,
      currentCaseCostUsd: 0.95,
      reserveUsd: 0.1,
      caseLimitUsd: 1,
      policy,
    })).toThrow(/limite da fatia/);
  });

  it("calculates provider cost without rounding intermediate values", () => {
    expect(usageCostUsd(
      { promptTokens: 10_000, completionTokens: 2_000 },
      { inputTokenPriceUsdPerMillion: 2.5, outputTokenPriceUsdPerMillion: 15 },
    )).toBeCloseTo(0.055, 8);
  });

  it("keeps xAI planning and judge models available in the synchronized pricing catalog", async () => {
    const { resolveKnownPricing } = await import("../../supabase/functions/_shared/pricing");
    expect(resolveKnownPricing("xai", "grok-4.3")).not.toBeNull();
    expect(resolveKnownPricing("xai", "grok-4.5")).not.toBeNull();
  });

  it("redacts identifiers and secret-shaped values from reports", () => {
    const sanitized = sanitizeEvaluationValue({
      orgId: "123e4567-e89b-42d3-a456-426614174000",
      email: "person@business.example",
      phone: "+55 11 99999-0000",
      apiKey: "sk-fixture-secret-value",
      nested: "safe synthetic text",
    }) as Record<string, unknown>;
    expect(sanitized.apiKey).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain("123e4567");
    expect(JSON.stringify(sanitized)).not.toContain("person@business.example");
    expect(sanitized.nested).toBe("safe synthetic text");
  });

  it("keeps comparison fingerprints stable when runtime and cost vary", () => {
    const base = {
      caseId: evaluationCase.caseId,
      baselineVersion: "2026-07-16.q0",
      rubricVersion: "2026-07-16.q0",
      channel: "web" as const,
      transcript: [{ role: "manager", content: "synthetic" }],
      proposal: { type: "save_quarterly_plan" },
      deterministicChecks: [{ id: "DET-1", status: "pass" as const, evidence: "ok" }],
      judge: { status: "completed", scores: [] },
    };
    expect(comparisonFingerprint({ ...base, runtime: { startedAt: "one" }, cost: { total: 0.1 } }))
      .toBe(comparisonFingerprint({ ...base, runtime: { startedAt: "two" }, cost: { total: 0.9 } }));
  });

  it("never approves when the judge fails or cleanup is incomplete", () => {
    const checks = [{ id: "DET-1", status: "pass" as const, evidence: "ok" }];
    expect(q1Gate({ proposalCreated: true, judgeStatus: "error", checks, cleanupSucceeded: true, totalCaseCostUsd: 0.2, caseLimitUsd: 1 }).status)
      .toBe("blocked");
    expect(q1Gate({ proposalCreated: true, judgeStatus: "completed", checks, cleanupSucceeded: false, totalCaseCostUsd: 0.2, caseLimitUsd: 1 }).status)
      .toBe("blocked");
  });

  it("keeps the judge provider-only and outside every mutation client", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/strategic-eval.ts"), "utf8");
    const judgeStart = source.indexOf("async function runJudge");
    const judgeEnd = source.indexOf("function confirmationPromptCount", judgeStart);
    const judgeSource = source.slice(judgeStart, judgeEnd);
    expect(judgeStart).toBeGreaterThan(0);
    expect(judgeEnd).toBeGreaterThan(judgeStart);
    expect(judgeSource).toContain("callModel(");
    expect(judgeSource).not.toMatch(/serviceClient|anonClient|callFunction|\.from\(|\.rpc\(/);
  });
});
