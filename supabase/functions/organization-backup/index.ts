import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createOrganizationBackup,
  deleteOrganizationBackup,
  hasExternalBackupConfig,
  loadOrganizationEnvelope,
  loadOrganizationEnvelopeWithSource,
  processOrganizationBackupCron,
  purgeOrganizationBackupObjects,
  restoreOrganizationEnvelope,
  verifyOrganizationEnvelope,
} from "../_shared/organization-backup.ts";
import { recordAdministrativeAudit } from "../_shared/administrative-audit.ts";

function safeEqual(received: string, expected: string) {
  const receivedBytes = new TextEncoder().encode(received);
  const expectedBytes = new TextEncoder().encode(expected);
  if (receivedBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= receivedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

async function isCronRequest(req: Request) {
  const received = req.headers.get("x-oraculo-backup-cron-secret");
  if (!received) return false;
  const client = serviceClient();
  const { data, error } = await client
    .from("organization_backup_secrets")
    .select("cron_secret")
    .eq("id", "cron")
    .maybeSingle();
  if (error || !data?.cron_secret) throw new Error("Segredo do cron de backup indisponível");
  if (!safeEqual(received, data.cron_secret)) throw new Error("Chamada de cron não autorizada");
  return true;
}

async function listState(orgId: string) {
  const client = serviceClient();
  const { data: policy, error: policyError } = await client
    .from("organization_backup_policies")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (policyError) throw policyError;
  const { data: backups, error: backupsError } = await client
    .from("organization_backups")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (backupsError) throw backupsError;
  const { data: restoreRuns, error: restoreRunsError } = await client
    .from("organization_restore_runs")
    .select("*")
    .eq("source_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (restoreRunsError) throw restoreRunsError;
  const { data: pendingRequest, error: pendingRequestError } = await client
    .from("organization_backup_requests")
    .select("reason,requested_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (pendingRequestError) throw pendingRequestError;
  const completedBackups = (backups ?? []).filter((backup: any) => backup.status === "completed");
  const latestBackup = completedBackups[0] ?? null;
  const latestExternal = completedBackups.find((backup: any) => backup.external_status === "completed") ?? null;
  const latestRestore = (restoreRuns ?? []).find((run: any) => run.status === "completed") ?? null;
  const latestMonthlyDrill = (restoreRuns ?? []).find(
    (run: any) => run.status === "completed" && run.exercise_type === "monthly_drill",
  ) ?? null;
  const latestDisasterDrill = (restoreRuns ?? []).find(
    (run: any) => run.status === "completed" && run.exercise_type === "disaster_drill",
  ) ?? null;
  const pendingAgeMinutes = pendingRequest?.requested_at
    ? Math.max(0, (Date.now() - new Date(pendingRequest.requested_at).getTime()) / 60_000)
    : null;
  const backupAgeMinutes = latestBackup?.completed_at
    ? Math.max(0, (Date.now() - new Date(latestBackup.completed_at).getTime()) / 60_000)
    : null;
  const externalAgeMinutes = latestExternal?.completed_at
    ? Math.max(0, (Date.now() - new Date(latestExternal.completed_at).getTime()) / 60_000)
    : null;
  const externalConfigured = hasExternalBackupConfig();
  const recoveryStatus = !policy?.automatic_enabled ||
      !policy?.event_snapshots_enabled ||
      !latestBackup ||
      !latestExternal ||
      !externalConfigured ||
      backupAgeMinutes === null ||
      backupAgeMinutes > 26 * 60 ||
      externalAgeMinutes === null ||
      externalAgeMinutes > 26 * 60
    ? "attention"
    : pendingAgeMinutes !== null && pendingAgeMinutes > 30
      ? "attention"
      : pendingAgeMinutes !== null
        ? "protecting"
        : "protected";
  return {
    policy,
    backups: backups ?? [],
    restoreRuns: restoreRuns ?? [],
    externalConfigured,
    recovery: {
      rpoTargetMinutes: 30,
      rtoTargetMinutes: 240,
      status: recoveryStatus,
      pendingSince: pendingRequest?.requested_at ?? null,
      pendingReason: pendingRequest?.reason ?? null,
      lastBackupAt: latestBackup?.completed_at ?? null,
      lastExternalBackupAt: latestExternal?.completed_at ?? null,
      lastRestoreAt: latestRestore?.completed_at ?? null,
      lastRestoreDurationMs: latestRestore?.duration_ms ?? null,
      lastMonthlyDrillAt: latestMonthlyDrill?.completed_at ?? null,
      lastDisasterDrillAt: latestDisasterDrill?.completed_at ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    if (await isCronRequest(req)) {
      if (body.action !== "cron") throw new Error("Ação de cron inválida");
      return jsonResponse({ ok: true, summary: await processOrganizationBackupCron() });
    }

    const user = await getUser(req);
    const orgId = String(body.orgId ?? "").trim();

    if (body.action === "restore" && !body.backupId && !orgId) {
      const client = serviceClient();
      const { data: existingMembership, error: membershipError } = await client
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (existingMembership) {
        throw new Error("Abra Segurança e backups na empresa ativa para importar este pacote");
      }
      const envelope = await verifyOrganizationEnvelope(body.envelope);
      const result = await restoreOrganizationEnvelope({
        auditOrgId: null,
        userId: user.id,
        envelope,
        backupId: null,
      });
      await recordAdministrativeAudit(client, req, {
        orgId: result.targetOrgId,
        actorUserId: user.id,
        category: "backup",
        action: "organization_restored",
        targetType: "organization",
        targetId: result.targetOrgId,
        targetLabel: result.targetOrgName,
        after: { source: "portable_package", recordCounts: result.recordCounts },
      });
      return jsonResponse({ ok: true, ...result });
    }

    if (!orgId) throw new Error("Empresa não informada");
    await assertOwner(user.id, orgId);

    if (["download", "restore", "drill", "discard_drill"].includes(String(body.action))) {
      await assertCriticalActionAal2(req, orgId);
    }

    if (body.action === "list") {
      return jsonResponse(await listState(orgId));
    }

    if (body.action === "create") {
      const backup = await createOrganizationBackup(orgId, "manual", user.id);
      await recordAdministrativeAudit(serviceClient(), req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "backup_created",
        targetType: "organization_backup",
        targetId: backup.id,
        targetLabel: "Backup manual",
        after: { kind: backup.kind, status: backup.status, externalStatus: backup.external_status },
      });
      return jsonResponse({ ok: true, backup });
    }

    if (body.action === "download") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) throw new Error("Backup não informado");
      const envelope = await loadOrganizationEnvelope(orgId, backupId);
      await recordAdministrativeAudit(serviceClient(), req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "backup_downloaded",
        targetType: "organization_backup",
        targetId: backupId,
        targetLabel: "Pacote portátil",
        after: { downloaded: true, schemaVersion: envelope.payload.manifest.schemaVersion },
      });
      const fileName = `oraculo-${envelope.payload.manifest.sourceOrganization.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()}-${envelope.payload.manifest.createdAt.slice(0, 10)}.json`;
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Access-Control-Expose-Headers": "Content-Disposition",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (body.action === "restore") {
      const backupId = body.backupId ? String(body.backupId) : null;
      const exerciseType = body.exerciseType == null ? "restore" : String(body.exerciseType);
      if (!["restore", "monthly_drill", "disaster_drill"].includes(exerciseType)) {
        throw new Error("Tipo de exercício de recuperação inválido");
      }
      const loaded = backupId
        ? await loadOrganizationEnvelopeWithSource(
          orgId,
          backupId,
          exerciseType === "disaster_drill" ? "external" : exerciseType === "monthly_drill" ? "internal" : "auto",
        )
        : { envelope: await verifyOrganizationEnvelope(body.envelope), sourceKind: "portable" as const };
      const result = await restoreOrganizationEnvelope({
        auditOrgId: orgId,
        userId: user.id,
        envelope: loaded.envelope,
        backupId,
        exerciseType: exerciseType as "restore" | "monthly_drill" | "disaster_drill",
        sourceKind: loaded.sourceKind,
      });
      await recordAdministrativeAudit(serviceClient(), req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "organization_restored",
        targetType: "organization",
        targetId: result.targetOrgId,
        targetLabel: result.targetOrgName,
        after: {
          backupId,
          exerciseType,
          sourceKind: result.sourceKind,
          durationMs: result.durationMs,
          verification: result.verification,
          recordCounts: result.recordCounts,
        },
      });
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === "drill") {
      const exerciseType = String(body.exerciseType ?? "");
      if (!["monthly_drill", "disaster_drill"].includes(exerciseType)) {
        throw new Error("Tipo de exercício de recuperação inválido");
      }
      let backupQuery = serviceClient()
        .from("organization_backups")
        .select("id")
        .eq("org_id", orgId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);
      if (exerciseType === "disaster_drill") backupQuery = backupQuery.eq("external_status", "completed");
      const { data: backup, error: backupError } = await backupQuery.maybeSingle();
      if (backupError) throw backupError;
      if (!backup?.id) {
        throw new Error(exerciseType === "disaster_drill"
          ? "Nenhuma cópia externa concluída está disponível para o teste"
          : "Nenhum backup concluído está disponível para o teste");
      }
      const loaded = await loadOrganizationEnvelopeWithSource(
        orgId,
        backup.id,
        exerciseType === "disaster_drill" ? "external" : "internal",
      );
      const result = await restoreOrganizationEnvelope({
        auditOrgId: orgId,
        userId: user.id,
        envelope: loaded.envelope,
        backupId: backup.id,
        exerciseType: exerciseType as "monthly_drill" | "disaster_drill",
        sourceKind: loaded.sourceKind,
      });
      await recordAdministrativeAudit(serviceClient(), req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "recovery_drill_completed",
        targetType: "organization",
        targetId: result.targetOrgId,
        targetLabel: result.targetOrgName,
        after: {
          backupId: backup.id,
          exerciseType,
          sourceKind: result.sourceKind,
          durationMs: result.durationMs,
          verification: result.verification,
        },
      });
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === "discard_drill") {
      const restoreRunId = String(body.restoreRunId ?? "").trim();
      if (!restoreRunId) throw new Error("Teste de recuperação não informado");
      const client = serviceClient();
      const { data: run, error: runError } = await client
        .from("organization_restore_runs")
        .select("id,target_org_id,target_org_name,exercise_type,status,drill_cleaned_at")
        .eq("id", restoreRunId)
        .eq("source_org_id", orgId)
        .in("exercise_type", ["monthly_drill", "disaster_drill"])
        .maybeSingle();
      if (runError) throw runError;
      if (!run || run.status !== "completed" || !run.target_org_id) throw new Error("Cópia de teste não encontrada");
      if (run.drill_cleaned_at) return jsonResponse({ ok: true, alreadyCleaned: true });
      const { data: targetBackups, error: targetBackupsError } = await client
        .from("organization_backups")
        .select("object_path")
        .eq("org_id", run.target_org_id);
      if (targetBackupsError) throw targetBackupsError;
      await purgeOrganizationBackupObjects(targetBackups ?? []);
      const { error: deleteError } = await client.from("organizations").delete().eq("id", run.target_org_id);
      if (deleteError) throw deleteError;
      const { error: updateError } = await client
        .from("organization_restore_runs")
        .update({ drill_cleaned_at: new Date().toISOString(), drill_cleaned_by: user.id })
        .eq("id", run.id);
      if (updateError) throw updateError;
      await recordAdministrativeAudit(client, req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "recovery_drill_cleaned",
        targetType: "organization",
        targetId: run.target_org_id,
        targetLabel: run.target_org_name ?? "Cópia de recuperação",
        after: { restoreRunId: run.id, cleaned: true },
      });
      return jsonResponse({ ok: true });
    }

    if (body.action === "update_policy") {
      const policy = body.policy ?? {};
      const patch = {
        automatic_enabled: Boolean(policy.automaticEnabled),
        event_snapshots_enabled: Boolean(policy.eventSnapshotsEnabled),
        event_retention_days: Number(policy.eventRetentionDays),
        daily_retention_days: Number(policy.dailyRetentionDays),
        weekly_retention_days: Number(policy.weeklyRetentionDays),
        monthly_retention_days: Number(policy.monthlyRetentionDays),
      };
      const client = serviceClient();
      const { data: previousPolicy, error: previousPolicyError } = await client
        .from("organization_backup_policies")
        .select("automatic_enabled,event_snapshots_enabled,event_retention_days,daily_retention_days,weekly_retention_days,monthly_retention_days")
        .eq("org_id", orgId)
        .maybeSingle();
      if (previousPolicyError) throw previousPolicyError;
      const { data, error } = await client
        .from("organization_backup_policies")
        .update(patch)
        .eq("org_id", orgId)
        .select("*")
        .single();
      if (error) throw error;
      await recordAdministrativeAudit(client, req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "backup_policy_updated",
        targetType: "backup_policy",
        targetId: orgId,
        targetLabel: "Política de backup",
        before: previousPolicy ?? {},
        after: patch,
      });
      return jsonResponse({ ok: true, policy: data });
    }

    if (body.action === "delete") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) throw new Error("Backup não informado");
      const client = serviceClient();
      const { data: previousBackup, error: previousBackupError } = await client
        .from("organization_backups")
        .select("id,kind,status,created_at,external_status")
        .eq("org_id", orgId)
        .eq("id", backupId)
        .maybeSingle();
      if (previousBackupError) throw previousBackupError;
      await deleteOrganizationBackup(orgId, backupId);
      await recordAdministrativeAudit(client, req, {
        orgId,
        actorUserId: user.id,
        category: "backup",
        action: "backup_deleted",
        targetType: "organization_backup",
        targetId: backupId,
        targetLabel: "Backup",
        before: previousBackup ?? {},
        after: { deleted: true },
      });
      return jsonResponse({ ok: true });
    }

    throw new Error("Ação de backup inválida");
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    const message = error instanceof Error ? error.message : "Erro inesperado no backup";
    const status = /Sessão|autorizad|Apenas o dono|Sem acesso/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
