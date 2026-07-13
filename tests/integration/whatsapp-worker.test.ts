import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

let org: DisposableOrg | null = null;
let ownerPhone = "";
let coordinatorPhone = "";
let workerSecret = "";
let webhookSecret = "";
let ownerClient: ReturnType<typeof anonClient> | null = null;

async function enqueue(eventKey: string, phone = ownerPhone, userId = org!.owner.id) {
  const { data, error } = await serviceClient().rpc("enqueue_whatsapp_inbound_job", {
    p_org_id: org!.orgId,
    p_event_key: eventKey,
    p_phone: phone,
    p_user_id: userId,
    p_kind: "text",
    p_payload: { messageId: eventKey, text: "oi" },
  });
  if (error) throw error;
  return data[0] as { job_id: string; correlation_id: string; inserted: boolean };
}

async function claim(workerId: string) {
  const { data, error } = await serviceClient().rpc("claim_whatsapp_inbound_job", {
    p_worker_id: workerId,
    p_org_id: org!.orgId,
    p_lock_timeout_seconds: 30,
  });
  if (error) throw error;
  return data as Array<Record<string, any>>;
}

async function complete(jobId: string, workerId: string) {
  const { data, error } = await serviceClient().rpc("complete_whatsapp_inbound_job", {
    p_job_id: jobId,
    p_worker_id: workerId,
  });
  if (error) throw error;
  expect(data).toBe(true);
}

async function callWorker(body: Record<string, unknown>, secret = workerSecret) {
  return fetch(`${stagingUrl}/functions/v1/whatsapp-worker`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      ...(secret ? { "x-oraculo-worker-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

d("Fatia 3B — worker, ordem e retry do WhatsApp", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("3b-whatsapp-worker");
    const suffix = String(Date.now()).slice(-8);
    ownerPhone = `+55468${suffix}`;
    coordinatorPhone = `+55467${suffix}`;
    const admin = serviceClient();

    const { error: ownerProfileError } = await admin.from("profiles").update({ phone: ownerPhone }).eq("id", org.owner.id);
    if (ownerProfileError) throw ownerProfileError;
    const { error: coordinatorProfileError } = await admin
      .from("profiles")
      .update({ phone: coordinatorPhone })
      .eq("id", org.coordinator.id);
    if (coordinatorProfileError) throw coordinatorProfileError;

    const { error: settingsError } = await admin.from("whatsapp_settings").upsert({
      org_id: org.orgId,
      instance_url: "http://127.0.0.1:9",
      instance_name: `worker-e2e-${suffix}`,
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

    const { data: secretRow, error: secretError } = await admin
      .from("whatsapp_worker_secrets")
      .update({ endpoint_url: null })
      .eq("id", "worker")
      .select("worker_secret")
      .single();
    if (secretError) throw secretError;
    workerSecret = secretRow.worker_secret;

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

  it("preserva a ordem e bloqueia o segundo job da mesma conversa", async () => {
    const first = await enqueue("order-1");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await enqueue("order-2");

    const firstClaim = await claim("worker-order-01");
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0].id).toBe(first.job_id);

    const blockedClaim = await claim("worker-order-02");
    expect(blockedClaim).toHaveLength(0);

    await complete(first.job_id, "worker-order-01");
    const secondClaim = await claim("worker-order-02");
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim[0].id).toBe(second.job_id);
    await complete(second.job_id, "worker-order-02");
  });

  it("processa pessoas diferentes em paralelo", async () => {
    await enqueue("parallel-owner", ownerPhone, org!.owner.id);
    await enqueue("parallel-coordinator", coordinatorPhone, org!.coordinator.id);

    const [ownerClaim, coordinatorClaim] = await Promise.all([
      claim("worker-parallel-owner"),
      claim("worker-parallel-coordinator"),
    ]);
    expect(ownerClaim).toHaveLength(1);
    expect(coordinatorClaim).toHaveLength(1);
    expect(ownerClaim[0].id).not.toBe(coordinatorClaim[0].id);
    await Promise.all([
      complete(ownerClaim[0].id, "worker-parallel-owner"),
      complete(coordinatorClaim[0].id, "worker-parallel-coordinator"),
    ]);
  });

  it("renova heartbeat e recupera lock abandonado", async () => {
    const queued = await enqueue("stale-lock");
    const [job] = await claim("worker-stale-old");
    expect(job.id).toBe(queued.job_id);

    const admin = serviceClient();
    const { data: wrongHeartbeat } = await admin.rpc("heartbeat_whatsapp_inbound_job", {
      p_job_id: job.id,
      p_worker_id: "worker-stale-other",
    });
    expect(wrongHeartbeat).toBe(false);
    const { data: heartbeat } = await admin.rpc("heartbeat_whatsapp_inbound_job", {
      p_job_id: job.id,
      p_worker_id: "worker-stale-old",
    });
    expect(heartbeat).toBe(true);

    const { error: ageError } = await admin
      .from("whatsapp_inbound_jobs")
      .update({ locked_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", job.id);
    if (ageError) throw ageError;

    const recovered = await claim("worker-stale-new");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: job.id, attempt_count: 2, last_error_code: "lock_expired" });
    await complete(job.id, "worker-stale-new");
  });

  it("faz retry transitório e envia erro permanente para dead-letter", async () => {
    const queued = await enqueue("retry-then-dead");
    await claim("worker-retry-01");
    const admin = serviceClient();
    const { data: retryStatus, error: retryError } = await admin.rpc("fail_whatsapp_inbound_job", {
      p_job_id: queued.job_id,
      p_worker_id: "worker-retry-01",
      p_transient: true,
      p_error_code: "timeout",
      p_error_message: "Timeout temporário",
      p_retry_after_seconds: 0,
    });
    if (retryError) throw retryError;
    expect(retryStatus).toBe("retry");

    const retried = await claim("worker-retry-02");
    expect(retried[0].attempt_count).toBe(2);
    const { data: deadStatus, error: deadError } = await admin.rpc("fail_whatsapp_inbound_job", {
      p_job_id: queued.job_id,
      p_worker_id: "worker-retry-02",
      p_transient: false,
      p_error_code: "invalid_configuration",
      p_error_message: "Configuração inválida",
      p_retry_after_seconds: null,
    });
    if (deadError) throw deadError;
    expect(deadStatus).toBe("dead");
  });

  it("encerra na quinta tentativa mesmo para falha transitória", async () => {
    const queued = await enqueue("attempt-limit");
    const { error: attemptError } = await serviceClient()
      .from("whatsapp_inbound_jobs")
      .update({ attempt_count: 4 })
      .eq("id", queued.job_id);
    if (attemptError) throw attemptError;

    const [job] = await claim("worker-attempt-limit");
    expect(job.attempt_count).toBe(5);
    const { data: status, error } = await serviceClient().rpc("fail_whatsapp_inbound_job", {
      p_job_id: job.id,
      p_worker_id: "worker-attempt-limit",
      p_transient: true,
      p_error_code: "timeout",
      p_error_message: "Timeout novamente",
      p_retry_after_seconds: 0,
    });
    if (error) throw error;
    expect(status).toBe("dead");
  });

  it("protege o endpoint e aceita somente o segredo server-side", async () => {
    const unauthorized = await callWorker({ orgId: org!.orgId }, "segredo-incorreto");
    expect(unauthorized.status).toBe(401);

    const authorized = await callWorker({ orgId: org!.orgId, batchSize: 1 });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ ok: true, claimed: 0 });

    const invalidOrg = await callWorker({ orgId: "inválida", batchSize: 1 });
    expect(invalidOrg.status).toBe(400);
  });

  it("impede owner de ler segredo ou operar a fila privilegiada", async () => {
    const { data: secrets, error: secretError } = await ownerClient!.from("whatsapp_worker_secrets").select("worker_secret");
    expect(secrets).toBeNull();
    expect(secretError).toBeTruthy();

    const { error: claimError } = await ownerClient!.rpc("claim_whatsapp_inbound_job", {
      p_worker_id: "owner-nao-e-worker",
      p_org_id: org!.orgId,
      p_lock_timeout_seconds: 30,
    });
    expect(claimError).toBeTruthy();
  });

  it("conclui retry já deduplicado sem reenviar resposta", async () => {
    const messageId = `already-processed-${Date.now()}`;
    const eventKey = `message:${ownerPhone}:${messageId}`;
    const admin = serviceClient();
    const { data: queuedRows, error: enqueueError } = await admin.rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: eventKey,
      p_phone: ownerPhone,
      p_user_id: org!.owner.id,
      p_kind: "text",
      p_payload: { messageId, text: "oi" },
    });
    if (enqueueError) throw enqueueError;
    const { error: dedupeError } = await admin.from("whatsapp_processed_events").insert({
      org_id: org!.orgId,
      event_key: eventKey,
    });
    if (dedupeError) throw dedupeError;

    const response = await callWorker({ orgId: org!.orgId, batchSize: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 1, completed: 1 });

    const { data: job, error } = await admin
      .from("whatsapp_inbound_jobs")
      .select("status, completed_at, attempt_count")
      .eq("id", queuedRows[0].job_id)
      .single();
    if (error) throw error;
    expect(job.status).toBe("completed");
    expect(job.completed_at).toBeTruthy();
    expect(job.attempt_count).toBe(1);
  });

  it("não grava resposta quando a outbox fica indisponível com job pendente", async () => {
    const admin = serviceClient();
    const queued = await enqueue(`durable-disabled-${Date.now()}`);
    const { count: messagesBefore } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);

    const { error: disableError } = await admin
      .from("whatsapp_settings")
      .update({ outbound_outbox_enabled: false })
      .eq("org_id", org!.orgId);
    if (disableError) throw disableError;

    try {
      const response = await callWorker({ orgId: org!.orgId, batchSize: 1 });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, claimed: 1, retry: 1, completed: 0 });
      const { data: job, error: jobError } = await admin
        .from("whatsapp_inbound_jobs")
        .select("status, last_error_code")
        .eq("id", queued.job_id)
        .single();
      if (jobError) throw jobError;
      expect(job).toMatchObject({ status: "retry", last_error_code: "http_503" });
      const { count: messagesAfter } = await admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org!.orgId);
      expect(messagesAfter).toBe(messagesBefore);
    } finally {
      await admin.from("whatsapp_settings").update({ outbound_outbox_enabled: true }).eq("org_id", org!.orgId);
      await admin.from("whatsapp_inbound_jobs").delete().eq("id", queued.job_id);
    }
  });

  it("isola a entrega na outbox sem refazer o processamento no worker", async () => {
    const admin = serviceClient();
    const { count: outboxBefore } = await admin
      .from("whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);
    const queued = await enqueue("worker-real-failure");
    const response = await callWorker({ orgId: org!.orgId, batchSize: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 1, completed: 1, retry: 0 });

    const { data: job, error } = await admin
      .from("whatsapp_inbound_jobs")
      .select("status, attempt_count, last_error_code, last_error_message")
      .eq("id", queued.job_id)
      .single();
    if (error) throw error;
    expect(job).toMatchObject({ status: "completed", attempt_count: 1, last_error_code: null, last_error_message: null });
    const { count: outboxAfter } = await admin
      .from("whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId);
    expect(outboxAfter).toBe((outboxBefore ?? 0) + 1);
  });

  it("drena job legado de mídia sem persistir conteúdo bruto", async () => {
    const eventKey = `audio-invalid-${Date.now()}`;
    const { data, error: enqueueError } = await serviceClient().rpc("enqueue_whatsapp_inbound_job", {
      p_org_id: org!.orgId,
      p_event_key: eventKey,
      p_phone: coordinatorPhone,
      p_user_id: org!.coordinator.id,
      p_kind: "audio",
      p_payload: {
        messageId: eventKey,
        remoteJid: `${coordinatorPhone.slice(1)}@s.whatsapp.net`,
        mimeType: "audio/ogg",
      },
    });
    if (enqueueError) throw enqueueError;

    const response = await callWorker({ orgId: org!.orgId, batchSize: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 1, completed: 1, retry: 0 });

    const { data: job, error } = await serviceClient()
      .from("whatsapp_inbound_jobs")
      .select("status, payload, last_error_message")
      .eq("id", data[0].job_id)
      .single();
    if (error) throw error;
    expect(job.status).toBe("completed");
    expect(job.payload).toEqual({
      messageId: eventKey,
      remoteJid: `${coordinatorPhone.slice(1)}@s.whatsapp.net`,
      mimeType: "audio/ogg",
    });
    expect(JSON.stringify(job)).not.toMatch(/base64|mediaKey|https?:\/\//i);
    const { data: outbox, error: outboxError } = await serviceClient()
      .from("whatsapp_outbox")
      .select("status, content")
      .eq("org_id", org!.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (outboxError) throw outboxError;
    expect(outbox.status).toBe("queued");
    expect(outbox.content).toMatch(/não consegui transcrever/i);
  });

  it("remove somente jobs concluídos além da retenção", async () => {
    const queued = await enqueue("cleanup-completed");
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const admin = serviceClient();
    const { error: updateError } = await admin
      .from("whatsapp_inbound_jobs")
      .update({ status: "completed", completed_at: old, updated_at: old })
      .eq("id", queued.job_id);
    if (updateError) throw updateError;

    const { data: deleted, error: cleanupError } = await admin.rpc("cleanup_whatsapp_inbound_jobs");
    if (cleanupError) throw cleanupError;
    expect(deleted).toBeGreaterThanOrEqual(1);
    const { data: remaining } = await admin.from("whatsapp_inbound_jobs").select("id").eq("id", queued.job_id).maybeSingle();
    expect(remaining).toBeNull();
  });

  it.runIf(process.env.RUN_WORKER_WAKE_E2E === "true")(
    "desperta imediatamente pelo webhook e recupera pelo cron",
    async () => {
      const admin = serviceClient();
      const endpointUrl = `${stagingUrl}/functions/v1/whatsapp-worker`;
      const waitUntilProcessed = async (eventKey: string) => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const { data } = await admin
            .from("whatsapp_inbound_jobs")
            .select("status, attempt_count")
            .eq("org_id", org!.orgId)
            .eq("event_key", eventKey)
            .maybeSingle();
          if (data && data.status !== "queued" && data.attempt_count >= 1) return data;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(`job ${eventKey} não foi despertado`);
      };

      await admin.from("whatsapp_inbound_jobs").delete().eq("org_id", org!.orgId);
      const { error: endpointError } = await admin
        .from("whatsapp_worker_secrets")
        .update({ endpoint_url: endpointUrl })
        .eq("id", "worker");
      if (endpointError) throw endpointError;

      try {
        const messageId = `wake-${Date.now()}`;
        const webhookResponse = await fetch(`${stagingUrl}/functions/v1/whatsapp-webhook?orgId=${org!.orgId}`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            "content-type": "application/json",
            "x-oraculo-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({
            event: "messages.upsert",
            instance: "worker-e2e",
            data: {
              key: { id: messageId, remoteJid: `${ownerPhone.slice(1)}@s.whatsapp.net`, fromMe: false },
              message: { conversation: "oi" },
            },
          }),
        });
        expect(webhookResponse.status).toBe(200);
        expect(await webhookResponse.json()).toMatchObject({ ok: true, queued: true });
        expect(await waitUntilProcessed(`message:${ownerPhone}:${messageId}`)).toMatchObject({ attempt_count: 1 });

        await admin.from("whatsapp_inbound_jobs").delete().eq("org_id", org!.orgId);
        const cronEventKey = `cron-${Date.now()}`;
        await enqueue(cronEventKey);
        const { data: requestId, error: cronError } = await admin.rpc("invoke_whatsapp_worker_cron");
        if (cronError) throw cronError;
        expect(Number(requestId)).toBeGreaterThan(0);
        const processedCron = await waitUntilProcessed(cronEventKey);
        expect(processedCron.attempt_count).toBeGreaterThanOrEqual(1);
        expect(processedCron.status).not.toBe("queued");
      } finally {
        await admin.from("whatsapp_worker_secrets").update({ endpoint_url: null }).eq("id", "worker");
      }
    },
    60_000,
  );
});
