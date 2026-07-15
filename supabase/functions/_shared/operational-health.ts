export type HealthTone = "warning" | "critical";

export interface OperationalSignal {
  code: string;
  tone: HealthTone;
  title: string;
  detail: string;
}

export interface OperationalMetrics {
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
  externalBackupConfigured: boolean;
  externalBackupAgeHours: number | null;
  externalBackupFailed: boolean;
  massArchiveCount15m: number;
  destructiveSchemaChanges24h: number;
  aiCostUsd: number;
  aiBudgetUsd: number;
  aiErrors24h: number;
  frontendErrors24h: number;
  lastRestoreAgeDays: number | null;
  lastDisasterDrillAgeDays: number | null;
  openRecoveryIncidents: number;
  criticalRecoveryIncidents: number;
}

export function percentile95(values: number[]) {
  if (!values.length) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function evaluateOperationalSignals(metrics: OperationalMetrics): OperationalSignal[] {
  const signals: OperationalSignal[] = [];
  if (!metrics.frontendOk) {
    signals.push({ code: "frontend_unavailable", tone: "critical", title: "Aplicativo indisponível", detail: "O monitor não conseguiu abrir o frontend de produção." });
  }
  if (metrics.migrationCount !== metrics.expectedMigrationCount) {
    signals.push({ code: "migration_drift", tone: "critical", title: "Banco fora da versão esperada", detail: `Produção tem ${metrics.migrationCount} de ${metrics.expectedMigrationCount} migrations esperadas.` });
  }
  if (metrics.whatsappEnabled && metrics.webhookEvents24h === 0) {
    signals.push({ code: "webhook_silent", tone: "warning", title: "WhatsApp sem eventos", detail: "Nenhuma mensagem entrou pelo webhook nas últimas 24 horas." });
  }
  if (metrics.whatsappP95Ms !== null && metrics.whatsappP95Ms > 30_000) {
    signals.push({ code: "whatsapp_slow", tone: "warning", title: "Respostas do WhatsApp lentas", detail: `O p95 das respostas está em ${(metrics.whatsappP95Ms / 1000).toFixed(1)} segundos.` });
  }
  if (metrics.oldestQueueMinutes !== null && metrics.oldestQueueMinutes > 5) {
    signals.push({ code: "queue_stalled", tone: "critical", title: "Fila parada", detail: `Há item aguardando há ${Math.round(metrics.oldestQueueMinutes)} minutos.` });
  }
  if (metrics.deadItems > 0) {
    signals.push({ code: "dead_items", tone: "critical", title: "Mensagens sem entrega", detail: `${metrics.deadItems} item(ns) atingiram o limite de tentativas.` });
  }
  if (metrics.backupFailed) {
    signals.push({ code: "backup_failed", tone: "critical", title: "Backup com falha", detail: "A última execução automática de backup falhou." });
  } else if (metrics.backupAgeHours === null || metrics.backupAgeHours > 26) {
    signals.push({ code: "backup_late", tone: "critical", title: "Backup atrasado", detail: "Não há backup automático concluído nas últimas 26 horas." });
  }
  if (!metrics.externalBackupConfigured) {
    signals.push({ code: "external_backup_missing", tone: "critical", title: "Réplica externa ausente", detail: "A recuperação independente fora do Supabase não está configurada." });
  } else if (metrics.externalBackupFailed) {
    signals.push({ code: "external_backup_failed", tone: "critical", title: "Falha na réplica externa", detail: "O backup interno terminou, mas a cópia externa mais recente falhou." });
  } else if (metrics.externalBackupAgeHours === null || metrics.externalBackupAgeHours > 26) {
    signals.push({ code: "external_backup_late", tone: "critical", title: "Réplica externa atrasada", detail: "Não há cópia externa concluída nas últimas 26 horas." });
  }
  if (metrics.massArchiveCount15m >= 20) {
    signals.push({ code: "mass_archive_detected", tone: "critical", title: "Retirada incomum em massa", detail: `${metrics.massArchiveCount15m} registros foram retirados da operação nos últimos 15 minutos.` });
  }
  if (metrics.destructiveSchemaChanges24h > 0) {
    signals.push({ code: "destructive_schema_change", tone: "critical", title: "Alteração destrutiva de estrutura", detail: "Uma migration destrutiva aprovada foi aplicada nas últimas 24 horas. Confira a auditoria e a saúde dos dados." });
  }
  if (metrics.aiBudgetUsd > 0 && metrics.aiCostUsd / metrics.aiBudgetUsd >= 0.9) {
    signals.push({ code: "ai_budget_near_limit", tone: "warning", title: "Custo de IA próximo da referência", detail: `O uso mensal chegou a ${Math.round(metrics.aiCostUsd / metrics.aiBudgetUsd * 100)}% da referência.` });
  }
  if (metrics.aiErrors24h >= 5) {
    signals.push({ code: "ai_errors_high", tone: "warning", title: "Erros de IA acima do normal", detail: `${metrics.aiErrors24h} falhas foram registradas nas últimas 24 horas.` });
  }
  if (metrics.frontendErrors24h >= 5) {
    signals.push({ code: "frontend_errors_high", tone: "warning", title: "Erros de tela acima do normal", detail: `${metrics.frontendErrors24h} ocorrências foram registradas nas últimas 24 horas.` });
  }
  if (metrics.lastRestoreAgeDays === null || metrics.lastRestoreAgeDays > 35) {
    signals.push({ code: "restore_test_due", tone: "warning", title: "Teste mensal de restauração pendente", detail: "Nenhuma restauração concluída foi registrada nos últimos 35 dias." });
  }
  if (metrics.lastDisasterDrillAgeDays === null || metrics.lastDisasterDrillAgeDays > 100) {
    signals.push({ code: "disaster_drill_due", tone: "warning", title: "Exercício trimestral pendente", detail: "Nenhum exercício completo de desastre foi registrado nos últimos 100 dias." });
  }
  if (metrics.criticalRecoveryIncidents > 0) {
    signals.push({ code: "critical_recovery_incident", tone: "critical", title: "Incidente crítico em aberto", detail: `${metrics.criticalRecoveryIncidents} incidente(s) crítico(s) aguardam resolução.` });
  } else if (metrics.openRecoveryIncidents > 0) {
    signals.push({ code: "recovery_incident_open", tone: "warning", title: "Incidente em acompanhamento", detail: `${metrics.openRecoveryIncidents} incidente(s) operacionais permanecem abertos.` });
  }
  return signals;
}
