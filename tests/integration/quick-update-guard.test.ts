import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

let org: DisposableOrg | null = null;
let phone = "";
let remoteJid = "";
let instanceName = "";
let webhookSecret = "";

async function sendText(text: string) {
  const response = await fetch(`${stagingUrl}/functions/v1/whatsapp-webhook?orgId=${org!.orgId}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      "x-oraculo-webhook-secret": webhookSecret,
    },
    body: JSON.stringify({
      event: "messages.upsert",
      instance: instanceName,
      data: {
        key: { id: `quick-${crypto.randomUUID()}`, remoteJid, fromMe: false },
        message: { conversation: text },
      },
    }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

d("atualizações rápidas seguras (staging, webhook real)", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("quick-update-guard");
    const suffix = String(Date.now()).slice(-8);
    phone = `+55466${suffix}`;
    remoteJid = `${phone.slice(1)}@s.whatsapp.net`;
    instanceName = `quick-update-e2e-${suffix}`;
    webhookSecret = `e2e-${crypto.randomUUID()}`;

    const admin = serviceClient();
    const { error: profileError } = await admin.from("profiles").update({ phone }).eq("id", org.owner.id);
    if (profileError) throw profileError;
    const { error: settingsError } = await admin.from("whatsapp_settings").upsert({
      org_id: org.orgId,
      instance_url: "http://127.0.0.1:9",
      instance_name: instanceName,
      connected_number: "+5546999990000",
      enabled: true,
      has_api_key: true,
      has_webhook_secret: true,
      inbound_queue_enabled: false,
      outbound_outbox_enabled: true,
    });
    if (settingsError) throw settingsError;
    const { error: keyError } = await admin.from("whatsapp_instance_keys").upsert({
      org_id: org.orgId,
      api_key: `e2e-${crypto.randomUUID()}`,
      webhook_secret: webhookSecret,
    });
    if (keyError) throw keyError;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("não altera dados com uma confirmação curta", async () => {
    await sendText("Piloto ok");

    const admin = serviceClient();
    const [{ count: evidenceCount }, { data: objective }] = await Promise.all([
      admin.from("evidences").select("id", { count: "exact", head: true }).eq("org_id", org!.orgId),
      admin.from("objectives").select("status, progress").eq("id", org!.objectiveId).single(),
    ]);
    expect(evidenceCount).toBe(0);
    expect(objective).toMatchObject({ status: "on_track", progress: 0 });
  });

  it("mantém gravação direta quando operação e alvo estão explícitos", async () => {
    await sendText("Evidência no Objetivo de teste E2E: contrato assinado hoje");

    const { data, error } = await serviceClient()
      .from("evidences")
      .select("text, objective_id")
      .eq("org_id", org!.orgId);
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ objective_id: org!.objectiveId });
    expect(data?.[0].text).toMatch(/contrato assinado hoje/i);
  });

  it("pede confirmação quando infere o alvo e grava somente depois do sim", async () => {
    await sendText("Concluí o objetivo de teste");

    const admin = serviceClient();
    const { data: before } = await admin.from("objectives").select("status, progress").eq("id", org!.objectiveId).single();
    expect(before).toMatchObject({ status: "on_track", progress: 0 });

    const { data: conversation } = await admin
      .from("conversations")
      .select("pending_context")
      .eq("org_id", org!.orgId)
      .eq("channel", "whatsapp")
      .eq("status", "active")
      .single();
    expect(conversation?.pending_context).toMatchObject({
      type: "quick_update_confirmation",
      candidateId: org!.objectiveId,
      operation: "mark_done",
    });

    await sendText("Piloto ok");
    const { data: afterAcknowledgement } = await admin.from("objectives").select("status, progress").eq("id", org!.objectiveId).single();
    expect(afterAcknowledgement).toMatchObject({ status: "on_track", progress: 0 });

    await sendText("Concluí o objetivo de teste");
    await sendText("sim");
    const { data: after } = await admin.from("objectives").select("status, progress").eq("id", org!.objectiveId).single();
    expect(after).toMatchObject({ status: "done", progress: 100 });
  });
});
