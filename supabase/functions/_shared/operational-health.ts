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
  aiCostUsd: number;
  aiBudgetUsd: number;
  aiErrors24h: number;
  lastRestoreAgeDays: number | null;
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
  if (metrics.aiBudgetUsd > 0 && metrics.aiCostUsd / metrics.aiBudgetUsd >= 0.9) {
    signals.push({ code: "ai_budget_near_limit", tone: "warning", title: "Custo de IA próximo da referência", detail: `O uso mensal chegou a ${Math.round(metrics.aiCostUsd / metrics.aiBudgetUsd * 100)}% da referência.` });
  }
  if (metrics.aiErrors24h >= 5) {
    signals.push({ code: "ai_errors_high", tone: "warning", title: "Erros de IA acima do normal", detail: `${metrics.aiErrors24h} falhas foram registradas nas últimas 24 horas.` });
  }
  if (metrics.lastRestoreAgeDays === null || metrics.lastRestoreAgeDays > 90) {
    signals.push({ code: "restore_test_due", tone: "warning", title: "Teste de restauração pendente", detail: "Nenhuma restauração concluída foi registrada nos últimos 90 dias." });
  }
  return signals;
}

