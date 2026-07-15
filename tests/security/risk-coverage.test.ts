import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
let org: DisposableOrg | null = null;
let foreignOrg: DisposableOrg | null = null;
let ownerClient: SupabaseClient;
let coordinatorClient: SupabaseClient;
let adminClient: SupabaseClient;

async function signIn(email: string, password: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("Sessão de staging não criada");
  return { client, token: data.session.access_token };
}

function objectiveRow(orgId: string, areaId: string, title: string) {
  return {
    org_id: orgId,
    area_id: areaId,
    level: "quarterly",
    type: "seed",
    title,
    result: "Resultado testável",
    period: "T3 2026",
  };
}

d("Fatia 4A — matriz de permissões, lifecycle e segredos (staging)", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("4a-risk");
    foreignOrg = await createDisposableOrg("4a-foreign");
    const owner = await signIn(org.owner.email, org.owner.password);
    const coordinator = await signIn(org.coordinator.email, org.coordinator.password);
    const admin = await signIn(org.admin.email, org.admin.password);
    ownerClient = owner.client;
    coordinatorClient = coordinator.client;
    adminClient = admin.client;
  }, 90_000);

  afterAll(async () => {
    await Promise.allSettled([
      ownerClient?.auth.signOut(),
      coordinatorClient?.auth.signOut(),
      adminClient?.auth.signOut(),
    ]);
    if (org) await destroyDisposableOrg(org);
    if (foreignOrg) await destroyDisposableOrg(foreignOrg);
    org = null;
    foreignOrg = null;
  }, 90_000);

  it("owner escreve toda a empresa; coordenador só a própria área; admin só o escopo delegado de KPI", async () => {
    if (!org) throw new Error("fixture ausente");

    const ownerInsert = await ownerClient
      .from("objectives")
      .insert(objectiveRow(org.orgId, org.areas.comercialId, "Objetivo criado pelo owner"))
      .select("id")
      .single();
    expect(ownerInsert.error).toBeNull();

    const ownAreaInsert = await coordinatorClient
      .from("objectives")
      .insert(objectiveRow(org.orgId, org.areas.producaoId, "Objetivo da área própria"))
      .select("id")
      .single();
    expect(ownAreaInsert.error).toBeNull();

    const otherAreaInsert = await coordinatorClient
      .from("objectives")
      .insert(objectiveRow(org.orgId, org.areas.comercialId, "Objetivo indevido em outra área"))
      .select("id");
    expect(otherAreaInsert.error).not.toBeNull();

    const service = serviceClient();
    const { data: kpi, error: kpiError } = await service
      .from("executive_kpis")
      .insert({ org_id: org.orgId, kpi_key: "revenue", label: "Faturamento", unit: "currency" })
      .select("id")
      .single();
    expect(kpiError).toBeNull();

    const adminKpi = await adminClient.from("kpi_monthly_values").insert({
      org_id: org.orgId,
      kpi_id: kpi!.id,
      year: 2026,
      month: 1,
      target_value: 100,
      actual_value: 90,
      updated_by: org.admin.id,
    });
    expect(adminKpi.error).toBeNull();

    const coordinatorKpi = await coordinatorClient.from("kpi_monthly_values").insert({
      org_id: org.orgId,
      kpi_id: kpi!.id,
      year: 2026,
      month: 2,
      target_value: 100,
      updated_by: org.coordinator.id,
    });
    expect(coordinatorKpi.error).not.toBeNull();

    const adminOrgUpdate = await adminClient
      .from("organizations")
      .update({ subtitle: "alteração indevida do admin" })
      .eq("id", org.orgId)
      .select("id");
    expect(adminOrgUpdate.error).toBeNull();
    expect(adminOrgUpdate.data).toEqual([]);
  });

  it("impede leitura e escrita cruzada entre empresas", async () => {
    if (!org || !foreignOrg) throw new Error("fixture ausente");

    const foreignRead = await ownerClient.from("objectives").select("id").eq("org_id", foreignOrg.orgId);
    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);

    const foreignWrite = await ownerClient
      .from("objectives")
      .insert(objectiveRow(foreignOrg.orgId, foreignOrg.areas.producaoId, "Objetivo cruzado"));
    expect(foreignWrite.error).not.toBeNull();
  });

  it("mantém a auditoria administrativa imutável e visível somente ao owner", async () => {
    if (!org || !foreignOrg) throw new Error("fixture ausente");
    const seeded = await serviceClient().from("administrative_audit_events").insert({
      org_id: org.orgId,
      category: "security",
      action: "security_test_event",
      actor_user_id: org.owner.id,
      actor_name: "Owner E2E",
      target_type: "organization_security",
      target_id: org.orgId,
      before_data: {},
      after_data: { enabled: true },
      request_id: `risk-${Date.now()}`,
    });
    expect(seeded.error).toBeNull();

    const ownerRead = await ownerClient.from("administrative_audit_events").select("action").eq("org_id", org.orgId);
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data?.some((event) => event.action === "security_test_event")).toBe(true);

    for (const client of [coordinatorClient, adminClient]) {
      const read = await client.from("administrative_audit_events").select("id").eq("org_id", org.orgId);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
    }

    const foreignRead = await ownerClient.from("administrative_audit_events").select("id").eq("org_id", foreignOrg.orgId);
    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);

    const ownerInsert = await ownerClient.from("administrative_audit_events").insert({
      org_id: org.orgId,
      category: "security",
      action: "forged_event",
      actor_name: "forjado",
      target_type: "security",
      request_id: "forged",
    });
    expect(ownerInsert.error).not.toBeNull();
  });

  it("mantém tabelas de segredo e RPCs de worker exclusivas do service role", async () => {
    const secretTables = [
      "ai_model_keys",
      "whatsapp_instance_keys",
      "whatsapp_worker_secrets",
      "whatsapp_sender_secrets",
      "personal_data_requests",
    ];
    for (const table of secretTables) {
      const result = await ownerClient.from(table).select("*").limit(1);
      expect(result.error, table).not.toBeNull();
    }

    const rpc = await ownerClient.rpc("claim_whatsapp_inbound_job", {
      p_worker_id: "usuario-nao-autorizado",
      p_org_id: null,
      p_lock_timeout_seconds: 120,
    });
    expect(rpc.error).not.toBeNull();

    const serviceProbe = await serviceClient().from("whatsapp_worker_secrets").select("id").eq("id", "worker").single();
    expect(serviceProbe.error).toBeNull();
    expect(serviceProbe.data).toEqual({ id: "worker" });
  });

  it("arquiva e restaura preservando registro, auditoria e solicitação de backup", async () => {
    if (!org) throw new Error("fixture ausente");
    const service = serviceClient();
    await service.from("organization_backup_requests").delete().eq("org_id", org.orgId);

    async function lifecycle(archived: boolean) {
      return service.rpc("set_operational_item_archived", {
        p_org_id: org!.orgId,
        p_entity_type: "objective",
        p_entity_id: org!.objectiveId,
        p_archived: archived,
        p_actor_id: org!.owner.id,
        p_reason: archived ? "Teste automatizado 4A" : "Restauração automatizada 4A",
      });
    }

    const archive = await lifecycle(true);
    expect(archive.error).toBeNull();
    const archived = await ownerClient
      .from("objectives")
      .select("id, archived_at, archive_reason")
      .eq("id", org.objectiveId)
      .single();
    expect(archived.error).toBeNull();
    expect(archived.data?.archived_at).toBeTruthy();
    expect(archived.data?.archive_reason).toBe("Teste automatizado 4A");

    const activeLookup = await ownerClient
      .from("objectives")
      .select("id")
      .eq("id", org.objectiveId)
      .is("archived_at", null);
    expect(activeLookup.data).toEqual([]);

    const restore = await lifecycle(false);
    expect(restore.error).toBeNull();
    const restored = await ownerClient.from("objectives").select("archived_at").eq("id", org.objectiveId).single();
    expect(restored.data?.archived_at).toBeNull();

    const revisions = await ownerClient
      .from("operational_revisions")
      .select("action")
      .eq("org_id", org.orgId)
      .eq("entity_id", org.objectiveId)
      .order("created_at", { ascending: true });
    expect(revisions.error).toBeNull();
    expect(revisions.data?.map((row) => row.action)).toEqual(expect.arrayContaining(["archive", "restore"]));

    const backup = await service
      .from("organization_backup_requests")
      .select("org_id, reason")
      .eq("org_id", org.orgId)
      .maybeSingle();
    expect(backup.error).toBeNull();
    expect(backup.data?.org_id).toBe(org.orgId);
  });
});
