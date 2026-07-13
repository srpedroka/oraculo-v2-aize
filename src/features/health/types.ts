export interface OperationalHealthAlert {
  code: string;
  tone: "warning" | "critical";
  title: string;
  detail: string;
}

export interface OperationalHealthStatus {
  ok: true;
  status: "healthy" | "warning" | "critical";
  checkedAt: string;
  metrics: {
    frontendOk: boolean;
    migrationCount: number;
    expectedMigrationCount: number;
    whatsappEnabled: boolean;
    webhookEvents24h: number;
    whatsappP95Ms: number | null;
    oldestQueueMinutes: number | null;
    deadItems: number;
    backupAgeHours: number | null;
    backupFailed: boolean;
    aiCostUsd: number;
    aiBudgetUsd: number;
    aiErrors24h: number;
    frontendErrors24h: number;
    lastRestoreAgeDays: number | null;
  };
  alerts: OperationalHealthAlert[];
}
