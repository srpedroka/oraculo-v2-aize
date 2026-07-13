import { assertOrgMember, assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { evaluateOperationalSignals, percentile95, type OperationalMetrics } from "../_shared/operational-health.ts";
import { logStructured, requestId, safeErrorCode } from "../_shared/structured-log.ts";

const EXPECTED_MIGRATION_COUNT = 44;
const FRONTEND_URL = "https://oraculo-v2-aize.netlify.app";
type Client = ReturnType<typeof serviceClient>;

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
    aiUsage,
    aiPolicy,
    aiErrors24h,
    frontendErrors24h,
    restore,
  ] = await Promise.all([
    client.from("whatsapp_settings").select("enabled").eq("org_id", orgId).maybeSingle(),
    count(client, "whatsapp_health_events", (query) => query.eq("org_id", orgId).eq("event_type", "webhook_received").gte("created_at", since24h)),
    client.from("whatsapp_inbound_jobs").select("correlation_id, created_at, status").eq("org_id", orgId).gte("created_at", since24h).limit(1000),
    client.from("whatsapp_outbox").select("correlation_id, created_at, updated_at, status").eq("org_id", orgId).gte("created_at", since24h).limit(1000),
    client.from("organization_backup_policies").select("last_success_at, last_failure_at").eq("org_id", orgId).maybeSingle(),
    client.from("ai_usage_logs").select("total_cost_usd").eq("org_id", orgId).gte("created_at", monthStart).limit(1000),
    client.from("ai_control_policies").select("monthly_budget_usd").eq("org_id", orgId).maybeSingle(),
    count(client, "ai_function_errors", (query) => query.eq("org_id", orgId).gte("created_at", since24h)),
    count(client, "frontend_error_events", (query) => query.eq("org_id", orgId).gte("created_at", since24h)),
    client.from("organization_restore_runs").select("completed_at").eq("source_org_id", orgId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  for (const result of [settings, inbound, outbound, backupPolicy, aiUsage, aiPolicy, restore]) {
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
    aiCostUsd: (aiUsage.data ?? []).reduce((sum: number, row: any) => sum + Number(row.total_cost_usd ?? 0), 0),
    aiBudgetUsd: Number(aiPolicy.data?.monthly_budget_usd ?? 100),
    aiErrors24h,
    frontendErrors24h,
    lastRestoreAgeDays: age(restore.data?.completed_at ?? null, 86_400_000),
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
    logStructured("info", { requestId: id, functionName: "operational-health", orgId, userId: user.id, operation, durationMs: Math.round(performance.now() - startedAt), status: "ok" });
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    logStructured("error", { requestId: id, functionName: "operational-health", orgId, operation, durationMs: Math.round(performance.now() - startedAt), status: "error", errorCode: safeErrorCode(error) });
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha no monitor operacional", requestId: id }, 400);
  }
});
