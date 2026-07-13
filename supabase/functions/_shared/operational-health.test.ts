import { describe, expect, it } from "vitest";
import { evaluateOperationalSignals, percentile95, type OperationalMetrics } from "./operational-health.ts";

const healthy: OperationalMetrics = {
  frontendOk: true,
  migrationCount: 43,
  expectedMigrationCount: 43,
  whatsappEnabled: true,
  webhookEvents24h: 3,
  whatsappP95Ms: 10_000,
  oldestQueueMinutes: null,
  deadItems: 0,
  backupAgeHours: 2,
  backupFailed: false,
  aiCostUsd: 10,
  aiBudgetUsd: 100,
  aiErrors24h: 0,
  lastRestoreAgeDays: 2,
};

describe("operational health", () => {
  it("calculates p95 without interpolation", () => {
    expect(percentile95([100, 200, 300, 400, 500])).toBe(500);
    expect(percentile95([])).toBeNull();
  });

  it("keeps a healthy organization without alerts", () => {
    expect(evaluateOperationalSignals(healthy)).toEqual([]);
  });

  it("raises actionable alerts for breached SLOs", () => {
    const alerts = evaluateOperationalSignals({
      ...healthy,
      frontendOk: false,
      oldestQueueMinutes: 7,
      backupAgeHours: 27,
      aiCostUsd: 95,
      lastRestoreAgeDays: null,
    });
    expect(alerts.map((item) => item.code)).toEqual([
      "frontend_unavailable",
      "queue_stalled",
      "backup_late",
      "ai_budget_near_limit",
      "restore_test_due",
    ]);
  });
});

