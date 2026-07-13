import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

let org: DisposableOrg | null = null;
let ownerClient: ReturnType<typeof anonClient> | null = null;
let phone = "";
let remoteJid = "";
let instanceName = "";
let webhookSecret = "";

function textEvent(messageId: string, text: string, fromMe = false) {
  return {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      key: { id: messageId, remoteJid, fromMe },
      message: { conversation: text },
    },
  };
}

async function callWebhook(payload: unknown, secret = webhookSecret) {
  if (!org) throw new Error("Organização de teste não criada");
  return fetch(`${stagingUrl}/functions/v1/whatsapp-webhook?orgId=${org.orgId}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      ...(secret ? { "x-oraculo-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(payload),
  });
}

d("Fatia 3A — fila durável de entrada do WhatsApp", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("3a-whatsapp-queue");
    const suffix = String(Date.now()).slice(-8);
    phone = `+55469${suffix}`;
    remoteJid = `${phone.slice(1)}@s.whatsapp.net`;
    instanceName = `oraculo-e2e-${suffix}`;
    webhookSecret = `e2e-${crypto.randomUUID()}`;

    const admin = serviceClient();
    const { error: profileError } = await admin.from("profiles").update({ phone }).eq("id", org.owner.id);
    if (profileError) throw profileError;

    const { error: settingsError } = await admin.from("whatsapp_settings").upsert({
      org_id: org.orgId,
      instance_url: "https://evolution.invalid",
      instance_name: instanceName,
      connected_number: "+5546999990000",
      enabled: true,
      has_api_key: true,
      has_webhook_secret: true,
      inbound_queue_enabled: false,
    });
    if (settingsError) throw settingsError;

    const { error: keyError } = await admin.from("whatsapp_instance_keys").upsert({
      org_id: org.orgId,
      api_key: `e2e-${crypto.randomUUID()}`,
      webhook_secret: webhookSecret,
    });
    if (keyError) throw keyError;

    ownerClient = anonClient();
    const { error: signInError } = await ownerClient.auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (signInError) throw signInError;
  }, 60_000);

  afterAll(async () => {
    await ownerClient?.auth.signOut();
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("nasce desligada e rejeita enfileiramento", async () => {
    const admin = serviceClient();
    const { data: settings } = await admin
      .from("whatsapp_settings")
      .select("inbound_queue_enabled")
      .eq("org_id", org!.orgId)
      .single();
    expect(settings?.inbound_queue_enabled).toBe(false);

    const { error } = await admin.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: "message:disabled",
      p_phone: phone,
      p_user_id: org!.owner.id,
      p_kind: "text",
      p_payload: { messageId: "disabled", text: "oi" },
    });
    expect(error?.message).toMatch(/não está habilitada/i);
  });

  it("não permite que o navegador ligue a flag", async () => {
    const { error } = await ownerClient!
      .from("whatsapp_settings")
      .update({ inbound_queue_enabled: true })
      .eq("org_id", org!.orgId);
    expect(error?.message).toMatch(/só pode ser alterada pelo serviço/i);
  });

  it("não enfileira webhook sem segredo válido", async () => {
    const response = await callWebhook(textEvent("unauthorized-1", "oi"), "segredo-incorreto");
    expect(response.status).toBe(401);

    const { count } = await serviceClient()
      .from("whatsapp_inbound_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);
    expect(count).toBe(0);
  });

  it("deduplica atomicamente dez entregas concorrentes", async () => {
    const admin = serviceClient();
    const { error: flagError } = await admin
      .from("whatsapp_settings")
      .update({ inbound_queue_enabled: true })
      .eq("org_id", org!.orgId);
    if (flagError) throw flagError;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => callWebhook(textEvent("same-message-1", "Avancei na meta comercial"))),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(bodies.map((body) => body.correlationId)).size).toBe(1);
    expect(bodies.filter((body) => body.duplicate === false)).toHaveLength(1);
    expect(bodies.filter((body) => body.duplicate === true)).toHaveLength(9);

    const { data: jobs, error } = await admin
      .from("whatsapp_inbound_jobs")
      .select("user_id, phone, kind, payload, status, attempt_count, correlation_id")
      .eq("org_id", org!.orgId)
      .eq("event_key", `message:${phone}:same-message-1`);
    if (error) throw error;
    expect(jobs).toHaveLength(1);
    expect(jobs?.[0]).toMatchObject({
      user_id: org!.owner.id,
      phone,
      kind: "text",
      payload: { messageId: "same-message-1", text: "Avancei na meta comercial" },
      status: "queued",
      attempt_count: 0,
    });
  });

  it("bloqueia leitura e RPC para usuário autenticado", async () => {
    const { data, error } = await ownerClient!.from("whatsapp_inbound_jobs").select("id").eq("org_id", org!.orgId);
    expect(data).toBeNull();
    expect(error).toBeTruthy();

    const { error: rpcError } = await ownerClient!.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: "message:owner-client",
      p_phone: phone,
      p_user_id: org!.owner.id,
      p_kind: "text",
      p_payload: { text: "não deve entrar" },
    });
    expect(rpcError).toBeTruthy();
  });

  it("rejeita payload perigoso e usuário de outra empresa", async () => {
    const admin = serviceClient();
    const { error: payloadError } = await admin.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: "message:unsafe-payload",
      p_phone: phone,
      p_user_id: org!.owner.id,
      p_kind: "document",
      p_payload: { messageId: "unsafe-payload", base64: "JVBERi0x", mediaKey: "segredo" },
    });
    expect(payloadError?.message).toMatch(/campos não permitidos/i);

    const { error: userError } = await admin.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: "message:foreign-user",
      p_phone: phone,
      p_user_id: crypto.randomUUID(),
      p_kind: "text",
      p_payload: { messageId: "foreign-user", text: "oi" },
    });
    expect(userError?.message).toMatch(/não pertence à empresa/i);
  });

  it("retém apenas metadados mínimos em job de documento legado", async () => {
    const admin = serviceClient();
    const eventKey = `message:${phone}:document-1`;
    const { error: enqueueError } = await admin.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: eventKey,
      p_phone: phone,
      p_user_id: null,
      p_kind: "document",
      p_payload: {
        messageId: "document-1",
        remoteJid,
        mimeType: "application/pdf",
        fileName: "plano.pdf",
        caption: "Plano mensal",
      },
    });
    if (enqueueError) throw enqueueError;

    const { data: job, error } = await admin
      .from("whatsapp_inbound_jobs")
      .select("payload, kind")
      .eq("org_id", org!.orgId)
      .eq("event_key", eventKey)
      .single();
    if (error) throw error;
    expect(job.kind).toBe("document");
    expect(job.payload).toEqual({
      messageId: "document-1",
      remoteJid,
      mimeType: "application/pdf",
      fileName: "plano.pdf",
      caption: "Plano mensal",
    });
    expect(JSON.stringify(job.payload)).not.toMatch(/base64|mediaKey|directPath|temporaria/i);
  });

  it("ignora mensagens enviadas pela própria instância", async () => {
    const admin = serviceClient();
    const { count: before } = await admin
      .from("whatsapp_inbound_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);

    const response = await callWebhook(textEvent("from-me-1", "resposta do Oráculo", true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ignored: "from_me" });

    const { count: after } = await admin
      .from("whatsapp_inbound_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);
    expect(after).toBe(before);
  });
});
