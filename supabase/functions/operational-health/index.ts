import { assertOrgMember, assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { evaluateOperationalSignals, percentile95, type OperationalMetrics } from "../_shared/operational-health.ts";
import { logStructured, requestId, safeErrorCode } from "../_shared/structured-log.ts";
import { recordAdministrativeAudit } from "../_shared/administrative-audit.ts";

const EXPECTED_MIGRATION_COUNT = 55;
const FRONTEND_URL = "https://oraculo-v2-aize.netlify.app";
type Client = ReturnType<typeof serviceClient>;

const INCIDENT_TYPES = new Set(["data_loss", "service_outage", "security", "recovery_failure"]);
const INCIDENT_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const INCIDENT_SERVICES = new Set(["supabase", "frontend", "whatsapp", "ai", "backup", "external_replica"]);

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function age(value: string | null | undefined, unitMs: number) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / unitMs) : null;
}

async function count(client: Client, table: string, apply: (query: any) => any) {
  const query = apply(client.from(table).select("id", { count: "exact", head: true }));
  const { count: total, error } = await query;
  if (error) throw error;
  return total ?? 0;
}

async function authorizeCron(req: Request, client: Client) {
  const received = req.headers.get("x-oraculo-monitor-secret") ?? "";
  const { data, error } = await client.from("operational_monitor_secrets").select("cron_secret").eq("id", "cron").single();
  if (error) throw error;
  return Boolean(received && data?.cron_secret && timingSafeEqual(received, data.cron_secret));
}

function recoveryIncidentInput(body: Record<string, any>) {
  const incidentType = String(body.incidentType ?? "");
  const severity = String(body.severity ?? "");
  const affectedServices = [...new Set(
    (Array.isArray(body.affectedServices) ? body.affectedServices : [])
      .map((value: unknown) => String(value))
      .filter((value: string) => INCIDENT_SERVICES.has(value)),
  )];
  if (!INCIDENT_TYPES.has(incidentType)) throw new Error("Tipo de incidente inválido");
  if (!INCIDENT_SEVERITIES.has(severity)) throw new Error("Severidade inválida");
  if (!affectedServices.length) throw new Error("Informe ao menos um serviço afetado");
  return { incidentType, severity, affectedServices };
}

async function listOpenIncidents(client: Client, orgId: string) {
  const { data, error } = await client
    .from("organization_recovery_incidents")
    .select("id,incident_type,severity,affected_services,status,opened_at")
    .eq("org_id", orgId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

async function globalSignals(client: Client) {
  const [frontend, migration] = await Promise.all([
    fetch(FRONTEND_URL, { method: "HEAD", signal: AbortSignal.timeout(8_000) }).catch(() => null),
    client.rpc("operational_migration_count"),
  ]);
  if (migration.error) throw migration.error;
  return { frontendOk: Boolean(frontend?.ok), migrationCount: Number(migration.data ?? 0) };
}

async function collectMetrics(client: Client, orgId: string, global: { frontendOk: boolean; migrationCount: number }): Promise<OperationalMetrics> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [
    settings,
    webhookEvents24h,
    inbound,
    outbound,
    backupPolicy,
    recentBackups,
    massArchiveCount15m,
    destructiveSchemaChanges24h,
    aiUsage,
    aiPolicy,
    aiErrors24h,
    frontendErrors24h,
    restore,
    disasterDrill,
    openIncidents,
  ] = await Promise.all([
    client.from("whatsapp_settings").select("enabled").eq("org_id", orgId).maybeSingle(),
    count(client, "whatsapp_health_events", (query) => query.eq("org_id", orgId).eq("event_type", "webhook_received").gte("created_at", since24h)),
    client.from("whatsapp_inbound_jobs").select("correlation_id, created_at, status").eq("org_id", orgId).gte("created_at", since24h).limit(1000),
    client.from("whatsapp_outbox").select("correlation_id, created_at, updated_at, status").eq("org_id", orgId).gte("created_at", since24h).limit(1000),
    client.from("organization_backup_policies").select("last_success_at, last_failure_at").eq("org_id", orgId).maybeSingle(),
    client.from("organization_backups").select("external_status, created_at, completed_at").eq("org_id", orgId).eq("status", "completed").order("created_at", { ascending: false }).limit(40),
    count(client, "operational_revisions", (query) => query.eq("org_id", orgId).eq("action", "archive").gte("created_at", new Date(now.getTime() - 15 * 60 * 1000).toISOString())),
    count(client, "operational_safety_events", (query) => query.eq("org_id", orgId).eq("event_type", "destructive_schema_change").gte("occurred_at", since24h)),
    client.from("ai_usage_logs").select("total_cost_usd").eq("org_id", orgId).gte("created_at", monthStart).limit(1000),
    client.from("ai_control_policies").select("monthly_budget_usd").eq("org_id", orgId).maybeSingle(),
    count(client, "ai_function_errors", (query) => query.eq("org_id", orgId).gte("created_at", since24h)),
    count(client, "frontend_error_events", (query) => query.eq("org_id", orgId).gte("created_at", since24h)),
    client.from("organization_restore_runs").select("completed_at").eq("source_org_id", orgId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("organization_restore_runs").select("completed_at").eq("source_org_id", orgId).eq("status", "completed").eq("exercise_type", "disaster_drill").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("organization_recovery_incidents").select("severity").eq("org_id", orgId).eq("status", "open").limit(100),
  ]);

  for (const result of [settings, inbound, outbound, backupPolicy, recentBackups, aiUsage, aiPolicy, restore, disasterDrill, openIncidents]) {
    if (result.error) throw result.error;
  }

  const inboundByCorrelation = new Map((inbound.data ?? []).map((item: any) => [item.correlation_id, item]));
  const responseDurations = (outbound.data ?? []).flatMap((item: any) => {
    if (item.status !== "sent") return [];
    const source: any = inboundByCorrelation.get(item.correlation_id);
    if (!source) return [];
    const duration = new Date(item.updated_at).getTime() - new Date(source.created_at).getTime();
    return duration >= 0 ? [duration] : [];
  });
  const pending = [
    ...(inbound.data ?? []).filter((item: any) => ["queued", "processing", "retry"].includes(item.status)),
    ...(outbound.data ?? []).filter((item: any) => ["queued", "sending", "retry"].includes(item.status)),
  ];
  const oldestPendingAt = pending.map((item: any) => item.created_at).sort()[0] ?? null;
  const deadItems = [...(inbound.data ?? []), ...(outbound.data ?? [])].filter((item: any) => item.status === "dead").length;
  const backupSuccessAt = backupPolicy.data?.last_success_at ?? null;
  const backupFailureAt = backupPolicy.data?.last_failure_at ?? null;
  const externalBackups = (recentBackups.data ?? []).filter((item: any) => item.external_status !== "not_configured");
  const latestExternal = externalBackups[0] ?? null;
  const latestExternalCompleted = externalBackups.find((item: any) => item.external_status === "completed") ?? null;

  return {
    frontendOk: global.frontendOk,
    migrationCount: global.migrationCount,
    expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
    whatsappEnabled: settings.data?.enabled === true,
    webhookEvents24h,
    whatsappP95Ms: percentile95(responseDurations),
    oldestQueueMinutes: age(oldestPendingAt, 60_000),
    deadItems,
    backupAgeHours: age(backupSuccessAt, 3_600_000),
    backupFailed: Boolean(backupFailureAt && (!backupSuccessAt || backupFailureAt > backupSuccessAt)),
    externalBackupConfigured: externalBackups.length > 0,
    externalBackupAgeHours: age(latestExternalCompleted?.completed_at ?? latestExternalCompleted?.created_at ?? null, 3_600_000),
    externalBackupFailed: latestExternal?.external_status === "failed",
    massArchiveCount15m,
    destructiveSchemaChanges24h,
    aiCostUsd: (aiUsage.data ?? []).reduce((sum: number, row: any) => sum + Number(row.total_cost_usd ?? 0), 0),
    aiBudgetUsd: Number(aiPolicy.data?.monthly_budget_usd ?? 100),
    aiErrors24h,
    frontendErrors24h,
    lastRestoreAgeDays: age(restore.data?.completed_at ?? null, 86_400_000),
    lastDisasterDrillAgeDays: age(disasterDrill.data?.completed_at ?? null, 86_400_000),
    openRecoveryIncidents: (openIncidents.data ?? []).length,
    criticalRecoveryIncidents: (openIncidents.data ?? []).filter((incident: any) => incident.severity === "critical").length,
  };
}

async function persistHealth(client: Client, orgId: string, metrics: OperationalMetrics) {
  const signals = evaluateOperationalSignals(metrics);
  const status = signals.some((item) => item.tone === "critical") ? "critical" : signals.length ? "warning" : "healthy";
  const checkedAt = new Date().toISOString();
  const { error: snapshotError } = await client.from("operational_health_snapshots").insert({ org_id: orgId, status, metrics, checked_at: checkedAt });
  if (snapshotError) throw snapshotError;
  if (signals.length) {
    const { error } = await client.from("operational_alerts").upsert(signals.map((signal) => ({
      org_id: orgId,
      code: signal.code,
      tone: signal.tone,
      title: signal.title,
      detail: signal.detail,
      last_seen_at: checkedAt,
      resolved_at: null,
    })), { onConflict: "org_id,code" });
    if (error) throw error;
  }
  const activeCodes = signals.map((item) => item.code);
  let resolveQuery = client.from("operational_alerts").update({ resolved_at: checkedAt }).eq("org_id", orgId).is("resolved_at", null);
  if (activeCodes.length) resolveQuery = resolveQuery.not("code", "in", `(${activeCodes.join(",")})`);
  const { error: resolveError } = await resolveQuery;
  if (resolveError) throw resolveError;
  await client.from("operational_health_snapshots").delete().eq("org_id", orgId).lt("checked_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return { status, checkedAt, metrics, alerts: signals };
}

async function checkOrganization(client: Client, orgId: string, global: { frontendOk: boolean; migrationCount: number }) {
  return persistHealth(client, orgId, await collectMetrics(client, orgId, global));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);
  const id = requestId(req);
  const startedAt = performance.now();
  const client = serviceClient();
  let operation = "status";
  let orgId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    operation = String(body?.action ?? "status");
    if (operation === "frontend_error") {
      const user = await getUser(req);
      orgId = String(body?.orgId ?? "");
      await assertOrgMember(user.id, orgId);
      const occurrenceId = String(body?.occurrenceId ?? "");
      const errorCode = String(body?.errorCode ?? "RENDER_ERROR").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
      const path = String(body?.path ?? "/").split(/[?#]/)[0].replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) || "/";
      if (!/^ORC-[A-F0-9]{10}$/.test(occurrenceId)) return jsonResponse({ error: "Código de ocorrência inválido" }, 400);
      const { error } = await client.from("frontend_error_events").upsert({ org_id: orgId, user_id: user.id, occurrence_id: occurrenceId, error_code: errorCode, path }, { onConflict: "org_id,occurrence_id" });
      if (error) throw error;
      return jsonResponse({ ok: true, occurrenceId });
    }

    if (operation === "incident_open" || operation === "incident_resolve") {
      const user = await getUser(req);
      orgId = String(body?.orgId ?? "");
      await assertOwner(user.id, orgId);

      if (operation === "incident_open") {
        const input = recoveryIncidentInput(body);
        const { error: insertError } = await client
          .from("organization_recovery_incidents")
          .upsert({
            org_id: orgId,
            incident_type: input.incidentType,
            severity: input.severity,
            affected_services: input.affectedServices,
            opened_by: user.id,
            request_id: id,
          }, { onConflict: "org_id,request_id", ignoreDuplicates: true });
        if (insertError) throw insertError;
        const { data: incident, error: incidentError } = await client
          .from("organization_recovery_incidents")
          .select("id,incident_type,severity,affected_services,status,opened_at")
          .eq("org_id", orgId)
          .eq("request_id", id)
          .single();
        if (incidentError) throw incidentError;
        await recordAdministrativeAudit(client, req, {
          orgId,
          actorUserId: user.id,
          category: "security",
          action: "recovery_incident_opened",
          targetType: "recovery_incident",
          targetId: incident.id,
          targetLabel: "Incidente de recuperação",
          after: {
            incidentType: incident.incident_type,
            severity: incident.severity,
            affectedServices: incident.affected_services,
            status: incident.status,
          },
        });
        return jsonResponse({ ok: true, incident });
      }

      const incidentId = String(body?.incidentId ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(incidentId)) throw new Error("Incidente inválido");
      const { data: previous, error: previousError } = await client
        .from("organization_recovery_incidents")
        .select("id,incident_type,severity,affected_services,status,opened_at")
        .eq("id", incidentId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (previousError) throw previousError;
      if (!previous) throw new Error("Incidente não encontrado");
      if (previous.status !== "resolved") {
        const { error: resolveError } = await client
          .from("organization_recovery_incidents")
          .update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString() })
          .eq("id", incidentId)
          .eq("org_id", orgId);
        if (resolveError) throw resolveError;
      }
      await recordAdministrativeAudit(client, req, {
        orgId,
        actorUserId: user.id,
        category: "security",
        action: "recovery_incident_resolved",
        targetType: "recovery_incident",
        targetId: incidentId,
        targetLabel: "Incidente de recuperação",
        before: previous,
        after: { status: "resolved" },
      });
      return jsonResponse({ ok: true });
    }
    const global = await globalSignals(client);
    if (operation === "cron") {
      if (!(await authorizeCron(req, client))) return jsonResponse({ error: "Monitor não autorizado" }, 401);
      const { data: organizations, error } = await client.from("organizations").select("id").is("archived_at", null);
      if (error) throw error;
      const results = [];
      for (const organization of organizations ?? []) results.push(await checkOrganization(client, organization.id, global));
      logStructured("info", { requestId: id, functionName: "operational-health", operation, durationMs: Math.round(performance.now() - startedAt), status: "ok" });
      return jsonResponse({ ok: true, checked: results.length });
    }

    const user = await getUser(req);
    orgId = String(body?.orgId ?? "");
    await assertOwner(user.id, orgId);
    const result = await checkOrganization(client, orgId, global);
    const incidents = await listOpenIncidents(client, orgId);
    logStructured("info", { requestId: id, functionName: "operational-health", orgId, userId: user.id, operation, durationMs: Math.round(performance.now() - startedAt), status: "ok" });
    return jsonResponse({ ok: true, ...result, incidents });
  } catch (error) {
    logStructured("error", { requestId: id, functionName: "operational-health", orgId, operation, durationMs: Math.round(performance.now() - startedAt), status: "error", errorCode: safeErrorCode(error) });
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha no monitor operacional", requestId: id }, 400);
  }
});
