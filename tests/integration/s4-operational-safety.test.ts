import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

async function callFunction(slug: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`${stagingUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() as Record<string, any> };
}

d("Etapa S / Fatia S4 — exclusões críticas e alertas", () => {
  let org: DisposableOrg | null = null;
  let token = "";
  let restoredOrgId: string | null = null;

  beforeAll(async () => {
    org = await createDisposableOrg("s4-operational-safety");
    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("Sessão de teste ausente");
    token = signIn.data.session.access_token;
    const archived = await serviceClient().from("organizations").update({ archived_at: new Date().toISOString() }).eq("id", org.orgId);
    if (archived.error) throw archived.error;
  }, 60_000);

  afterAll(async () => {
    const admin = RUN ? serviceClient() : null;
    if (restoredOrgId) await admin!.from("organizations").delete().eq("id", restoredOrgId);
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("blocks deletion without final confirmation and without a recent backup", async () => {
    const withoutConfirmation = await callFunction("organization-lifecycle", token, {
      action: "permanent_delete", orgId: org!.orgId, confirmName: org!.label,
    });
    expect(withoutConfirmation.response.status).toBe(400);
    expect(withoutConfirmation.body.error).toMatch(/Confirme explicitamente/);

    const withoutBackup = await callFunction("organization-lifecycle", token, {
      action: "permanent_delete", orgId: org!.orgId, confirmName: org!.label, finalConfirmation: true,
    });
    expect(withoutBackup.response.status).toBe(400);
    expect(withoutBackup.body.error).toMatch(/backup completo recente/);
  });

  it("blocks the same deletion at AAL1 when optional MFA is enabled", async () => {
    const security = await serviceClient().from("organization_security_settings").upsert({
      org_id: org!.orgId,
      require_mfa_for_critical_actions: true,
      enabled_by: org!.owner.id,
      enabled_at: new Date().toISOString(),
    });
    if (security.error) throw security.error;
    const blocked = await callFunction("organization-lifecycle", token, {
      action: "permanent_delete", orgId: org!.orgId, confirmName: org!.label, finalConfirmation: true,
    });
    expect(blocked.response.status).toBe(403);
    expect(blocked.body.code).toBe("MFA_REQUIRED");
    const reset = await serviceClient().from("organization_security_settings").update({
      require_mfa_for_critical_actions: false,
      enabled_by: null,
      enabled_at: null,
    }).eq("org_id", org!.orgId);
    if (reset.error) throw reset.error;
  });

  it("emits sanitized destructive and mass-removal alerts", async () => {
    const admin = serviceClient();
    const revisions = Array.from({ length: 20 }, () => ({
      org_id: org!.orgId,
      entity_type: "objective",
      entity_id: crypto.randomUUID(),
      action: "archive",
      before_data: {},
      after_data: {},
      changed_by: org!.owner.id,
    }));
    const revisionInsert = await admin.from("operational_revisions").insert(revisions);
    if (revisionInsert.error) throw revisionInsert.error;
    const safetyInsert = await admin.from("operational_safety_events").insert({
      org_id: org!.orgId,
      event_type: "destructive_schema_change",
      event_key: crypto.randomUUID(),
      detail: "fixture-sanitized",
    });
    if (safetyInsert.error) throw safetyInsert.error;

    const health = await callFunction("operational-health", token, { action: "status", orgId: org!.orgId });
    expect(health.response.status).toBe(200);
    expect(health.body.alerts.map((item: any) => item.code)).toEqual(expect.arrayContaining([
      "external_backup_missing",
      "mass_archive_detected",
      "destructive_schema_change",
      "restore_test_due",
      "disaster_drill_due",
    ]));
    expect(JSON.stringify(health.body)).not.toContain(org!.owner.email);
    const revisionCleanup = await admin.from("operational_revisions").delete().eq("org_id", org!.orgId).eq("action", "archive").gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
    if (revisionCleanup.error) throw revisionCleanup.error;
    const safetyCleanup = await admin.from("operational_safety_events").delete().eq("org_id", org!.orgId);
    if (safetyCleanup.error) throw safetyCleanup.error;
  });

  it("creates a backup, restores a monthly drill, then permits the confirmed deletion", async () => {
    const backup = await callFunction("organization-backup", token, { action: "create", orgId: org!.orgId });
    expect(backup.response.status).toBe(200);
    const backupId = String(backup.body.backup?.id ?? "");
    expect(backupId).toMatch(/^[0-9a-f-]{36}$/);

    const restored = await callFunction("organization-backup", token, {
      action: "restore", orgId: org!.orgId, backupId, exerciseType: "monthly_drill",
    });
    expect(restored.response.status, JSON.stringify(restored.body)).toBe(200);
    restoredOrgId = String(restored.body.targetOrgId ?? "");
    expect(restoredOrgId).toMatch(/^[0-9a-f-]{36}$/);
    const drill = await serviceClient().from("organization_restore_runs").select("status, exercise_type").eq("source_org_id", org!.orgId).order("created_at", { ascending: false }).limit(1).single();
    expect(drill.data).toEqual({ status: "completed", exercise_type: "monthly_drill" });

    const deleted = await callFunction("organization-lifecycle", token, {
      action: "permanent_delete", orgId: org!.orgId, confirmName: org!.label, finalConfirmation: true,
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
  }, 90_000);
});
