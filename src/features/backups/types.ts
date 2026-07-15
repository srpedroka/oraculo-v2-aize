export type OrganizationBackupKind = "manual" | "event" | "daily" | "weekly" | "monthly";
export type OrganizationBackupStatus = "pending" | "completed" | "failed";
export type ExternalBackupStatus = "not_configured" | "pending" | "completed" | "failed";

export interface OrganizationBackupPolicy {
  org_id: string;
  automatic_enabled: boolean;
  event_snapshots_enabled: boolean;
  event_retention_days: number;
  daily_retention_days: number;
  weekly_retention_days: number;
  monthly_retention_days: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_message: string | null;
  updated_at: string;
}

export interface OrganizationBackupRecord {
  id: string;
  org_id: string;
  kind: OrganizationBackupKind;
  status: OrganizationBackupStatus;
  checksum: string | null;
  size_bytes: number | null;
  record_count: number;
  manifest: {
    createdAt?: string;
    sourceOrganization?: { id: string; name: string; subtitle: string | null };
    recordCounts?: Record<string, number>;
  };
  external_status: ExternalBackupStatus;
  external_error_message: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export interface OrganizationRestoreRun {
  id: string;
  target_org_id: string | null;
  target_org_name: string | null;
  status: "pending" | "completed" | "failed";
  record_counts: Record<string, number>;
  warnings: string[];
  error_message: string | null;
  exercise_type: "restore" | "monthly_drill" | "disaster_drill";
  source_kind: "unknown" | "internal" | "external" | "portable";
  source_checksum: string | null;
  duration_ms: number | null;
  verification: {
    passed?: boolean;
    checksumVerified?: boolean;
    criticalCountsMatch?: boolean;
    secretsExcluded?: boolean;
    whatsappDisabled?: boolean;
  };
  drill_cleaned_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface OrganizationRecoveryStatus {
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  status: "protected" | "protecting" | "attention";
  pendingSince: string | null;
  pendingReason: string | null;
  lastBackupAt: string | null;
  lastExternalBackupAt: string | null;
  lastRestoreAt: string | null;
  lastRestoreDurationMs: number | null;
  lastMonthlyDrillAt: string | null;
  lastDisasterDrillAt: string | null;
}

export interface OrganizationBackupState {
  policy: OrganizationBackupPolicy | null;
  backups: OrganizationBackupRecord[];
  restoreRuns: OrganizationRestoreRun[];
  externalConfigured: boolean;
  recovery: OrganizationRecoveryStatus;
}

export interface RestoreOrganizationResult {
  ok: true;
  targetOrgId: string;
  targetOrgName: string;
  recordCounts: Record<string, number>;
  warnings: string[];
  restoreRunId: string;
  sourceKind: "unknown" | "internal" | "external" | "portable";
  durationMs: number;
  verification: OrganizationRestoreRun["verification"];
}
