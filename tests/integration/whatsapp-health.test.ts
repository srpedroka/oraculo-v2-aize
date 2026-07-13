import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

let org: DisposableOrg | null = null;
let ownerClient: ReturnType<typeof anonClient> | null = null;
let coordinatorClient: ReturnType<typeof anonClient> | null = null;
let inboundId = "";
let outboundId = "";

async function invoke(client: ReturnType<typeof anonClient>, body: Record<string, unknown>) {
  return client.functions.invoke("whatsapp-health", { body });
}

d("Fatia 3D — saúde e recuperação do WhatsApp", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("3d-whatsapp-health");
    const suffix = String(Date.now()).slice(-8);
    const ownerPhone = `+55465${suffix}`;
    const admin = serviceClient();
    const { error: profileError } = await admin.from("profiles").update({ phone: ownerPhone }).eq("id", org.owner.id);
    if (profileError) throw profileError;
    const { error: settingsError } = await admin.from("whatsapp_settings").upsert({
      org_id: org.orgId,
      instance_url: "http://127.0.0.1:9",
      instance_name: `health-e2e-${suffix}`,
      connected_number: ownerPhone,
      enabled: true,
      has_api_key: true,
      has_webhook_secret: true,
      inbound_queue_enabled: false,
      outbound_outbox_enabled: false,
    });
    if (settingsError) throw settingsError;
    const { error: keyError } = await admin.from("whatsapp_instance_keys").upsert({
      org_id: org.orgId,
      api_key: `e2e-${crypto.randomUUID()}`,
      webhook_secret: `e2e-${crypto.randomUUID()}`,
    });
    if (keyError) throw keyError;

    const { data: inbound, error: inboundError } = await admin.from("whatsapp_inbound_jobs").insert({
      org_id: org.orgId,
      event_key: `health-dead-${suffix}`,
      phone: ownerPhone,
      user_id: org.owner.id,
      kind: "text",
      payload: { messageId: `health-dead-${suffix}`, text: "teste" },
      status: "dead",
      attempt_count: 5,
      last_error_code: "test_inbound_failure",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }).select("id").single();
    if (inboundError) throw inboundError;
    inboundId = inbound.id;

    const { data: outbound, error: outboundError } = await admin.from("whatsapp_outbox").insert({
      org_id: org.orgId,
      correlation_id: crypto.randomUUID(),
      destination: ownerPhone,
      content: "Resposta de teste",
      status: "dead",
      attempt_count: 5,
      last_error_code: "test_outbound_failure",
    }).select("id").single();
    if (outboundError) throw outboundError;
    outboundId = outbound.id;

    ownerClient = anonClient();
    coordinatorClient = anonClient();
    const ownerSignIn = await ownerClient.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (ownerSignIn.error) throw ownerSignIn.error;
    const coordinatorSignIn = await coordinatorClient.auth.signInWithPassword({ email: org.coordinator.email, password: org.coordinator.password });
    if (coordinatorSignIn.error) throw coordinatorSignIn.error;
  }, 60_000);

  afterAll(async () => {
    await ownerClient?.auth.signOut();
    await coordinatorClient?.auth.signOut();
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("entrega diagnóstico ao owner sem expor segredo ou conteúdo", async () => {
    const { data, error } = await invoke(ownerClient!, { action: "status", orgId: org!.orgId });
    if (error) throw error;
    expect(data).toMatchObject({
      ok: true,
      configured: true,
      enabled: true,
      connection: "unknown",
      queue: { inboundEnabled: false, outboxEnabled: false, pendingInbound: 0, pendingOutbound: 0 },
    });
    expect(data.deadItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: inboundId, type: "inbound", errorCode: "test_inbound_failure" }),
      expect.objectContaining({ id: outboundId, type: "outbound", errorCode: "test_outbound_failure" }),
    ]));
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("Resposta de teste");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("webhook_secret");
  });

  it("recusa coordenador e mantém isolamento por owner", async () => {
    const { error } = await invoke(coordinatorClient!, { action: "status", orgId: org!.orgId });
    expect(error).toBeTruthy();
  });

  it("não permite reprocessar pela Edge Function enquanto o modo durável está desligado", async () => {
    const { error } = await invoke(ownerClient!, { action: "retry", orgId: org!.orgId, itemType: "outbound", itemId: outboundId });
    expect(error).toBeTruthy();
    const { data } = await serviceClient().from("whatsapp_outbox").select("status").eq("id", outboundId).single();
    expect(data?.status).toBe("dead");
  });

  it("reabre item morto de forma escopada pela RPC service-only", async () => {
    const admin = serviceClient();
    const { data, error } = await admin.rpc("requeue_whatsapp_dead_item", {
      p_org_id: org!.orgId,
      p_item_type: "inbound",
      p_item_id: inboundId,
    });
    if (error) throw error;
    expect(data).toBe(true);
    const { data: row } = await admin.from("whatsapp_inbound_jobs").select("status, attempt_count").eq("id", inboundId).single();
    expect(row).toMatchObject({ status: "retry", attempt_count: 0 });
  });

  it("bloqueia telemetria e RPC para authenticated", async () => {
    const telemetry = await ownerClient!.from("whatsapp_health_events").select("id").eq("org_id", org!.orgId);
    expect(telemetry.error).toBeTruthy();
    const retry = await ownerClient!.rpc("requeue_whatsapp_dead_item", {
      p_org_id: org!.orgId,
      p_item_type: "outbound",
      p_item_id: outboundId,
    });
    expect(retry.error).toBeTruthy();
  });

  it("registra falha sanitizada no teste sem alterar flags", async () => {
    const { error } = await invoke(ownerClient!, { action: "send_test", orgId: org!.orgId });
    expect(error).toBeTruthy();
    const admin = serviceClient();
    const { data: event } = await admin.from("whatsapp_health_events")
      .select("event_type, source, error_code")
      .eq("org_id", org!.orgId)
      .eq("event_type", "test_failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(event).toMatchObject({ event_type: "test_failed", source: "health_test" });
    const { data: settings } = await admin.from("whatsapp_settings")
      .select("inbound_queue_enabled, outbound_outbox_enabled")
      .eq("org_id", org!.orgId)
      .single();
    expect(settings).toMatchObject({ inbound_queue_enabled: false, outbound_outbox_enabled: false });
  });
});
