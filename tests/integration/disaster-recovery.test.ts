import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

async function callFunction(token: string, requestId: string, body: Record<string, unknown>) {
  const response = await fetch(`${stagingUrl}/functions/v1/${body.functionName ?? "operational-health"}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(Object.fromEntries(Object.entries(body).filter(([key]) => key !== "functionName"))),
  });
  return { response, body: await response.json() as Record<string, any> };
}

d("Etapa 6 / Fatia 6F — recuperação de desastre", () => {
  let org: DisposableOrg | null = null;
  let ownerToken = "";
  let coordinatorToken = "";
  let restoredOrgId: string | null = null;

  beforeAll(async () => {
    org = await createDisposableOrg("6f-disaster-recovery");
    const owner = anonClient();
    const coordinator = anonClient();
    const ownerSession = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    const coordinatorSession = await coordinator.auth.signInWithPassword({ email: org.coordinator.email, password: org.coordinator.password });
    if (ownerSession.error || !ownerSession.data.session) throw ownerSession.error ?? new Error("Sessão owner ausente");
    if (coordinatorSession.error || !coordinatorSession.data.session) throw coordinatorSession.error ?? new Error("Sessão coordinator ausente");
    ownerToken = ownerSession.data.session.access_token;
    coordinatorToken = coordinatorSession.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    const admin = RUN ? serviceClient() : null;
    if (restoredOrgId) await admin!.from("organizations").delete().eq("id", restoredOrgId);
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 90_000);

  it("preserva o instante da primeira alteração ainda não protegida", async () => {
    const admin = serviceClient();
    await admin.from("organization_backup_requests").delete().eq("org_id", org!.orgId);
    const first = await admin.from("chat_messages").insert({
      org_id: org!.orgId,
      author: "user",
      text: "Mensagem descartável para testar o RPO",
    });
    if (first.error) throw first.error;
    const firstRequest = await admin.from("organization_backup_requests").select("requested_at,reason").eq("org_id", org!.orgId).single();
    if (firstRequest.error) throw firstRequest.error;

    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await admin.from("chat_messages").insert({
      org_id: org!.orgId,
      author: "oracle",
      text: "Segunda mensagem descartável para testar o RPO",
    });
    if (second.error) throw second.error;
    const secondRequest = await admin.from("organization_backup_requests").select("requested_at,reason").eq("org_id", org!.orgId).single();
    if (secondRequest.error) throw secondRequest.error;

    expect(firstRequest.data.reason).toBe("chat_messages");
    expect(secondRequest.data.reason).toBe("chat_messages");
    expect(secondRequest.data.requested_at).toBe(firstRequest.data.requested_at);
  });

  it("registra incidente estruturado somente pelo owner e resolve sem apagar a trilha", async () => {
    const blocked = await callFunction(coordinatorToken, "6f-incident-blocked", {
      action: "incident_open",
      orgId: org!.orgId,
      incidentType: "service_outage",
      severity: "high",
      affectedServices: ["supabase"],
    });
    expect(blocked.response.status).not.toBe(200);

    const opened = await callFunction(ownerToken, "6f-incident-open", {
      action: "incident_open",
      orgId: org!.orgId,
      incidentType: "recovery_failure",
      severity: "critical",
      affectedServices: ["backup", "external_replica"],
    });
    expect(opened.response.status, JSON.stringify(opened.body)).toBe(200);
    const incidentId = String(opened.body.incident?.id ?? "");
    expect(incidentId).toMatch(/^[0-9a-f-]{36}$/);

    const owner = anonClient();
    const coordinator = anonClient();
    await owner.auth.signInWithPassword({ email: org!.owner.email, password: org!.owner.password });
    await coordinator.auth.signInWithPassword({ email: org!.coordinator.email, password: org!.coordinator.password });
    const ownerRead = await owner.from("organization_recovery_incidents").select("id,status").eq("id", incidentId).single();
    const coordinatorRead = await coordinator.from("organization_recovery_incidents").select("id").eq("org_id", org!.orgId);
    const ownerInsert = await owner.from("organization_recovery_incidents").insert({
      org_id: org!.orgId,
      incident_type: "security",
      severity: "low",
      affected_services: ["frontend"],
      request_id: "forged",
    });
    expect(ownerRead.error).toBeNull();
    expect(coordinatorRead.data).toEqual([]);
    expect(ownerInsert.error).not.toBeNull();

    const resolved = await callFunction(ownerToken, "6f-incident-resolve", {
      action: "incident_resolve",
      orgId: org!.orgId,
      incidentId,
    });
    expect(resolved.response.status, JSON.stringify(resolved.body)).toBe(200);
    const stored = await serviceClient().from("organization_recovery_incidents").select("status,resolved_at").eq("id", incidentId).single();
    expect(stored.data?.status).toBe("resolved");
    expect(stored.data?.resolved_at).toBeTruthy();
  }, 60_000);

  it("mede o drill interno, verifica o clone e remove somente a cópia de teste", async () => {
    const backup = await callFunction(ownerToken, "6f-backup", {
      functionName: "organization-backup",
      action: "create",
      orgId: org!.orgId,
    });
    expect(backup.response.status, JSON.stringify(backup.body)).toBe(200);

    const drill = await callFunction(ownerToken, "6f-monthly-drill", {
      functionName: "organization-backup",
      action: "drill",
      orgId: org!.orgId,
      exerciseType: "monthly_drill",
    });
    expect(drill.response.status, JSON.stringify(drill.body)).toBe(200);
    restoredOrgId = String(drill.body.targetOrgId ?? "");
    expect(drill.body).toMatchObject({ sourceKind: "internal", verification: { passed: true, secretsExcluded: true, whatsappDisabled: true } });
    expect(Number(drill.body.durationMs)).toBeGreaterThanOrEqual(0);

    const run = await serviceClient()
      .from("organization_restore_runs")
      .select("id,source_kind,source_checksum,duration_ms,verification,drill_cleaned_at")
      .eq("id", drill.body.restoreRunId)
      .single();
    expect(run.error).toBeNull();
    expect(run.data?.source_kind).toBe("internal");
    expect(run.data?.source_checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(run.data?.verification).toMatchObject({ passed: true });

    const cleanup = await callFunction(ownerToken, "6f-clean-drill", {
      functionName: "organization-backup",
      action: "discard_drill",
      orgId: org!.orgId,
      restoreRunId: drill.body.restoreRunId,
    });
    expect(cleanup.response.status, JSON.stringify(cleanup.body)).toBe(200);
    const target = await serviceClient().from("organizations").select("id").eq("id", restoredOrgId).maybeSingle();
    const cleanedRun = await serviceClient().from("organization_restore_runs").select("drill_cleaned_at").eq("id", drill.body.restoreRunId).single();
    expect(target.data).toBeNull();
    expect(cleanedRun.data?.drill_cleaned_at).toBeTruthy();
    restoredOrgId = null;
  }, 120_000);

  it("recusa exercício externo quando o staging não tem réplica R2 concluída", async () => {
    const drill = await callFunction(ownerToken, "6f-external-drill", {
      functionName: "organization-backup",
      action: "drill",
      orgId: org!.orgId,
      exerciseType: "disaster_drill",
    });
    expect(drill.response.status).toBe(400);
    expect(String(drill.body.error)).toMatch(/cópia externa/i);
  });
});
