import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const d = hasStagingEnv() ? describe : describe.skip;
let org: DisposableOrg | null = null;
let ownerClient: ReturnType<typeof anonClient> | null = null;
let coordinatorClient: ReturnType<typeof anonClient> | null = null;

d("Fatia 4D — métricas, alertas e SLOs", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("4d-operational-health");
    ownerClient = anonClient();
    coordinatorClient = anonClient();
    const owner = await ownerClient.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (owner.error) throw owner.error;
    const coordinator = await coordinatorClient.auth.signInWithPassword({ email: org.coordinator.email, password: org.coordinator.password });
    if (coordinator.error) throw coordinator.error;
  }, 60_000);

  afterAll(async () => {
    await ownerClient?.auth.signOut();
    await coordinatorClient?.auth.signOut();
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("abre alertas sanitizados e grava snapshot para o owner", async () => {
    const { data, error } = await ownerClient!.functions.invoke("operational-health", { body: { action: "status", orgId: org!.orgId } });
    if (error) throw error;
    expect(data.ok).toBe(true);
    expect(data.alerts.map((item: any) => item.code)).toEqual(expect.arrayContaining(["backup_late", "restore_test_due"]));
    expect(JSON.stringify(data)).not.toContain(org!.owner.email);

    const admin = serviceClient();
    const { data: snapshot } = await admin.from("operational_health_snapshots").select("status, metrics").eq("org_id", org!.orgId).order("checked_at", { ascending: false }).limit(1).single();
    expect(snapshot?.status).toMatch(/warning|critical/);
    expect(snapshot?.metrics).not.toHaveProperty("content");
  });

  it("resolve automaticamente alertas quando o sinal volta ao normal", async () => {
    const admin = serviceClient();
    const now = new Date().toISOString();
    const { error: policyError } = await admin.from("organization_backup_policies").update({ last_success_at: now, last_failure_at: null }).eq("org_id", org!.orgId);
    if (policyError) throw policyError;
    const { error: restoreError } = await admin.from("organization_restore_runs").insert({
      source_org_id: org!.orgId,
      target_org_id: org!.orgId,
      target_org_name: "E2E restore validation",
      status: "completed",
      initiated_by: org!.owner.id,
      completed_at: now,
    });
    if (restoreError) throw restoreError;

    const { data, error } = await ownerClient!.functions.invoke("operational-health", { body: { action: "status", orgId: org!.orgId } });
    if (error) throw error;
    expect(data.alerts.map((item: any) => item.code)).not.toEqual(expect.arrayContaining(["backup_late", "restore_test_due"]));
    const { data: resolved } = await admin.from("operational_alerts").select("code, resolved_at").eq("org_id", org!.orgId).in("code", ["backup_late", "restore_test_due"]);
    expect(resolved).toHaveLength(2);
    expect(resolved!.every((item) => item.resolved_at)).toBe(true);
  });

  it("bloqueia coordenador e acesso direto às tabelas técnicas", async () => {
    const invocation = await coordinatorClient!.functions.invoke("operational-health", { body: { action: "status", orgId: org!.orgId } });
    expect(invocation.error).toBeTruthy();
    const snapshots = await ownerClient!.from("operational_health_snapshots").select("id");
    const alerts = await ownerClient!.from("operational_alerts").select("code");
    const aiErrors = await ownerClient!.from("ai_function_errors").select("id");
    expect(snapshots.error).toBeTruthy();
    expect(alerts.error).toBeTruthy();
    expect(aiErrors.error).toBeTruthy();
  });
});

