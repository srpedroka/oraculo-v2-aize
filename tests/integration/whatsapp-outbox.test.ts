import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

let org: DisposableOrg | null = null;
let ownerClient: ReturnType<typeof anonClient> | null = null;
let conversationId = "";
let ownerPhone = "";
let senderSecret = "";
let webhookSecret = "";
let workerSecret = "";

async function setEnabled(enabled: boolean) {
  const { error } = await serviceClient()
    .from("whatsapp_settings")
    .update({ outbound_outbox_enabled: enabled })
    .eq("org_id", org!.orgId);
  if (error) throw error;
}

async function insertReply(text: string, contents = [text]) {
  const { data, error } = await serviceClient().rpc("insert_whatsapp_oracle_message", {
    p_org_id: org!.orgId,
    p_area_id: org!.areas.producaoId,
    p_user_id: org!.owner.id,
    p_conversation_id: conversationId,
    p_text: text,
    p_contents: contents,
    p_queue_delivery: true,
    p_correlation_id: null,
  });
  if (error) throw error;
  return data[0] as {
    message_id: string;
    outbox_ids: string[];
    correlation_id: string;
    queued: boolean;
  };
}

async function claim(senderId: string) {
  const { data, error } = await serviceClient().rpc("claim_whatsapp_outbox_item", {
    p_worker_id: senderId,
    p_org_id: org!.orgId,
    p_lock_timeout_seconds: 30,
  });
  if (error) throw error;
  return data as Array<Record<string, any>>;
}

async function complete(itemId: string, senderId: string) {
  const { data, error } = await serviceClient().rpc("complete_whatsapp_outbox_item", {
    p_item_id: itemId,
    p_worker_id: senderId,
    p_http_status: 201,
    p_provider_message_id: `provider-${itemId}`,
    p_provider_status: "PENDING",
  });
  if (error) throw error;
  expect(data).toBe(true);
}

async function callSender(body: Record<string, unknown>, secret = senderSecret) {
  return fetch(`${stagingUrl}/functions/v1/whatsapp-sender`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      ...(secret ? { "x-oraculo-sender-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

d("Fatia 3C — outbox transacional e sender do WhatsApp", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("3c-whatsapp-outbox");
    const suffix = String(Date.now()).slice(-8);
    ownerPhone = `+55466${suffix}`;
    const admin = serviceClient();

    const { error: profileError } = await admin.from("profiles").update({ phone: ownerPhone }).eq("id", org.owner.id);
    if (profileError) throw profileError;
    const { error: settingsError } = await admin.from("whatsapp_settings").upsert({
      org_id: org.orgId,
      instance_url: "https://127.0.0.1:9",
      instance_name: `sender-e2e-${suffix}`,
      connected_number: "+5546999990000",
      enabled: true,
      has_api_key: true,
      has_webhook_secret: true,
      inbound_queue_enabled: true,
      outbound_outbox_enabled: true,
    });
    if (settingsError) throw settingsError;
    webhookSecret = `e2e-${crypto.randomUUID()}`;
    const { error: keyError } = await admin.from("whatsapp_instance_keys").upsert({
      org_id: org.orgId,
      api_key: `e2e-${crypto.randomUUID()}`,
      webhook_secret: webhookSecret,
    });
    if (keyError) throw keyError;

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({
        org_id: org.orgId,
        user_id: org.owner.id,
        area_id: org.areas.producaoId,
        channel: "whatsapp",
      })
      .select("id")
      .single();
    if (conversationError) throw conversationError;
    conversationId = conversation.id;

    const { data: secretRow, error: secretError } = await admin
      .from("whatsapp_sender_secrets")
      .update({ endpoint_url: null })
      .eq("id", "sender")
      .select("sender_secret")
      .single();
    if (secretError) throw secretError;
    senderSecret = secretRow.sender_secret;
    const { data: workerRow, error: workerError } = await admin
      .from("whatsapp_worker_secrets")
      .select("worker_secret")
      .eq("id", "worker")
      .single();
    if (workerError) throw workerError;
    workerSecret = workerRow.worker_secret;

    ownerClient = anonClient();
    const { error: signInError } = await ownerClient.auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (signInError) throw signInError;
  }, 60_000);

  beforeEach(async () => {
    const admin = serviceClient();
    await admin.from("whatsapp_outbox").delete().eq("org_id", org!.orgId);
    await admin.from("chat_messages").delete().eq("conversation_id", conversationId);
    await setEnabled(true);
  });

  afterAll(async () => {
    if (org) {
      const admin = serviceClient();
      await admin.from("whatsapp_sender_secrets").update({ endpoint_url: null }).eq("id", "sender");
      await admin.from("whatsapp_settings").update({ outbound_outbox_enabled: false }).eq("org_id", org.orgId);
    }
    await ownerClient?.auth.signOut();
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("mantém toda resposta textual no caminho durável", async () => {
    const result = await insertReply("Resposta com outbox obrigatória");
    expect(result.queued).toBe(true);
    expect(result.outbox_ids).toHaveLength(1);
    const { count } = await serviceClient()
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("id", result.message_id);
    expect(count).toBe(1);
  });

  it("grava a resposta e todos os blocos da outbox na mesma transação", async () => {
    await setEnabled(true);
    const result = await insertReply("Resposta completa", ["Bloco 1", "Bloco 2"]);
    expect(result.queued).toBe(true);
    expect(result.outbox_ids).toHaveLength(2);

    const { data: rows, error } = await serviceClient()
      .from("whatsapp_outbox")
      .select("chat_message_id, correlation_id, destination, content, part_index, part_count, status")
      .eq("chat_message_id", result.message_id)
      .order("part_index");
    if (error) throw error;
    expect(rows).toEqual([
      expect.objectContaining({ correlation_id: result.correlation_id, destination: ownerPhone, content: "Bloco 1", part_index: 0, part_count: 2, status: "queued" }),
      expect.objectContaining({ correlation_id: result.correlation_id, destination: ownerPhone, content: "Bloco 2", part_index: 1, part_count: 2, status: "queued" }),
    ]);
  });

  it("o webhook enfileira a resposta sem chamar a Evolution quando a outbox está ativa", async () => {
    await setEnabled(true);
    const messageId = `outbox-webhook-${Date.now()}`;
    const response = await fetch(`${stagingUrl}/functions/v1/whatsapp-webhook?orgId=${org!.orgId}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
        "x-oraculo-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: `sender-e2e-${ownerPhone.slice(-8)}`,
        data: {
          key: { id: messageId, remoteJid: `${ownerPhone.slice(1)}@s.whatsapp.net`, fromMe: false },
          message: { conversation: "oi" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, queued: true });

    const workerResponse = await fetch(`${stagingUrl}/functions/v1/whatsapp-worker`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
        "x-oraculo-worker-secret": workerSecret,
      },
      body: JSON.stringify({ orgId: org!.orgId, batchSize: 1 }),
    });
    expect(workerResponse.status).toBe(200);
    expect(await workerResponse.json()).toMatchObject({ ok: true, claimed: 1, completed: 1 });

    const { data: rows, error } = await serviceClient()
      .from("whatsapp_outbox")
      .select("status, destination, chat_message_id")
      .eq("org_id", org!.orgId);
    if (error) throw error;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "queued", destination: ownerPhone });
    expect(rows[0].chat_message_id).toBeTruthy();
  });

  it("faz rollback do histórico quando os blocos são inválidos", async () => {
    await setEnabled(true);
    const { count: before } = await serviceClient()
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    const { error } = await serviceClient().rpc("insert_whatsapp_oracle_message", {
      p_org_id: org!.orgId,
      p_area_id: org!.areas.producaoId,
      p_user_id: org!.owner.id,
      p_conversation_id: conversationId,
      p_text: "Não pode persistir",
      p_contents: ["1", "2", "3", "4"],
      p_queue_delivery: true,
      p_correlation_id: null,
    });
    expect(error).toBeTruthy();
    const { count: after } = await serviceClient()
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(after).toBe(before);
  });

  it("preserva ordem por destino e por bloco", async () => {
    await setEnabled(true);
    const first = await insertReply("Primeira", ["Primeira A", "Primeira B"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await insertReply("Segunda");

    const firstClaim = await claim("sender-order-01");
    expect(firstClaim[0].id).toBe(first.outbox_ids[0]);
    expect(await claim("sender-order-02")).toHaveLength(0);
    await complete(firstClaim[0].id, "sender-order-01");

    const secondPart = await claim("sender-order-02");
    expect(secondPart[0].id).toBe(first.outbox_ids[1]);
    await complete(secondPart[0].id, "sender-order-02");

    const nextMessage = await claim("sender-order-03");
    expect(nextMessage[0].id).toBe(second.outbox_ids[0]);
    await complete(nextMessage[0].id, "sender-order-03");
  });

  it("faz retry transitório e encerra erro permanente em dead-letter", async () => {
    await setEnabled(true);
    const retry = await insertReply("Retry");
    await claim("sender-retry-01");
    const admin = serviceClient();
    const { data: retryStatus, error: retryError } = await admin.rpc("fail_whatsapp_outbox_item", {
      p_item_id: retry.outbox_ids[0],
      p_worker_id: "sender-retry-01",
      p_transient: true,
      p_error_code: "evolution_http_500",
      p_error_message: "Falha temporária",
      p_http_status: 500,
      p_retry_after_seconds: 0,
    });
    if (retryError) throw retryError;
    expect(retryStatus).toBe("retry");

    const retried = await claim("sender-retry-02");
    expect(retried[0].attempt_count).toBe(2);
    const { data: deadStatus, error: deadError } = await admin.rpc("fail_whatsapp_outbox_item", {
      p_item_id: retry.outbox_ids[0],
      p_worker_id: "sender-retry-02",
      p_transient: false,
      p_error_code: "evolution_http_400",
      p_error_message: "Destino inválido",
      p_http_status: 400,
      p_retry_after_seconds: null,
    });
    if (deadError) throw deadError;
    expect(deadStatus).toBe("dead");
  });

  it("agenda o primeiro retry padrão para cerca de 10 segundos", async () => {
    await setEnabled(true);
    const queued = await insertReply("Backoff padrão");
    await claim("sender-default-backoff");
    const startedAt = Date.now();
    const { data: status, error: failError } = await serviceClient().rpc("fail_whatsapp_outbox_item", {
      p_item_id: queued.outbox_ids[0],
      p_worker_id: "sender-default-backoff",
      p_transient: true,
      p_error_code: "evolution_http_500",
      p_error_message: "Falha temporária",
      p_http_status: 500,
      p_retry_after_seconds: null,
    });
    if (failError) throw failError;
    expect(status).toBe("retry");
    const { data: item, error } = await serviceClient()
      .from("whatsapp_outbox")
      .select("next_retry_at")
      .eq("id", queued.outbox_ids[0])
      .single();
    if (error) throw error;
    const delayMs = new Date(item.next_retry_at).getTime() - startedAt;
    expect(delayMs).toBeGreaterThanOrEqual(8_000);
    expect(delayMs).toBeLessThanOrEqual(12_000);
  });

  it("protege flag, tabela, RPC e segredo contra o owner", async () => {
    const { error: flagError } = await ownerClient!
      .from("whatsapp_settings")
      .update({ outbound_outbox_enabled: false })
      .eq("org_id", org!.orgId);
    expect(flagError).toBeTruthy();

    const { data: rows, error: readError } = await ownerClient!.from("whatsapp_outbox").select("id");
    expect(rows).toBeNull();
    expect(readError).toBeTruthy();
    const { data: secrets, error: secretError } = await ownerClient!.from("whatsapp_sender_secrets").select("sender_secret");
    expect(secrets).toBeNull();
    expect(secretError).toBeTruthy();
    const { error: claimError } = await ownerClient!.rpc("claim_whatsapp_outbox_item", {
      p_worker_id: "owner-nao-e-sender",
      p_org_id: org!.orgId,
      p_lock_timeout_seconds: 30,
    });
    expect(claimError).toBeTruthy();
  });

  it("autentica o endpoint e transforma falha de rede em retry sanitizado", async () => {
    const unauthorized = await callSender({ orgId: org!.orgId }, "segredo-incorreto");
    expect(unauthorized.status).toBe(401);
    const invalidOrg = await callSender({ orgId: "inválida" });
    expect(invalidOrg.status).toBe(400);

    await setEnabled(true);
    const queued = await insertReply("Teste de indisponibilidade");
    const response = await callSender({ orgId: org!.orgId, batchSize: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 1, retry: 1 });

    const { data: item, error } = await serviceClient()
      .from("whatsapp_outbox")
      .select("status, attempt_count, last_error_code, last_error_message")
      .eq("id", queued.outbox_ids[0])
      .single();
    if (error) throw error;
    expect(item).toMatchObject({ status: "retry", attempt_count: 1, last_error_code: "evolution_unavailable" });
    expect(item.last_error_message).not.toMatch(/https?:\/\/|apikey|e2e-[a-f0-9-]{20,}/i);
  });
});
