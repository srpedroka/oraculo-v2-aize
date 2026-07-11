import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createOrganizationBackup,
  deleteOrganizationBackup,
  hasExternalBackupConfig,
  loadOrganizationEnvelope,
  processOrganizationBackupCron,
  restoreOrganizationEnvelope,
  verifyOrganizationEnvelope,
} from "../_shared/organization-backup.ts";

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
  return {
    policy,
    backups: backups ?? [],
    restoreRuns: restoreRuns ?? [],
    externalConfigured: hasExternalBackupConfig(),
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
      return jsonResponse({ ok: true, ...result });
    }

    if (!orgId) throw new Error("Empresa não informada");
    await assertOwner(user.id, orgId);

    if (body.action === "list") {
      return jsonResponse(await listState(orgId));
    }

    if (body.action === "create") {
      const backup = await createOrganizationBackup(orgId, "manual", user.id);
      return jsonResponse({ ok: true, backup });
    }

    if (body.action === "download") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) throw new Error("Backup não informado");
      const envelope = await loadOrganizationEnvelope(orgId, backupId);
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
      const envelope = backupId
        ? await loadOrganizationEnvelope(orgId, backupId)
        : await verifyOrganizationEnvelope(body.envelope);
      const result = await restoreOrganizationEnvelope({
        auditOrgId: orgId,
        userId: user.id,
        envelope,
        backupId,
      });
      return jsonResponse({ ok: true, ...result });
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
      const { data, error } = await client
        .from("organization_backup_policies")
        .update(patch)
        .eq("org_id", orgId)
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, policy: data });
    }

    if (body.action === "delete") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) throw new Error("Backup não informado");
      await deleteOrganizationBackup(orgId, backupId);
      return jsonResponse({ ok: true });
    }

    throw new Error("Ação de backup inválida");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no backup";
    const status = /Sessão|autorizad|Apenas o dono|Sem acesso/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
