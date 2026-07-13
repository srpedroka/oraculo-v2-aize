import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

function compressedTextPdf(text: string) {
  const content = Buffer.from(`BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, " ")}) Tj ET`, "latin1");
  const compressed = deflateSync(content);
  const objects = [
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n", "latin1"),
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
      compressed,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    ]),
    Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  ];
  const parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  let offset = parts[0].length;
  for (const object of objects) {
    offsets.push(offset);
    parts.push(object);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.concat([...parts, Buffer.from(xref, "latin1")]);
}

d("leitura de documento no WhatsApp (staging, webhook real)", () => {
  let org: DisposableOrg | null = null;
  let phone = "";
  let remoteJid = "";
  let instanceName = "";
  let webhookSecret = "";

  beforeAll(async () => {
    org = await createDisposableOrg("whatsapp-document-reading");
    const suffix = String(Date.now()).slice(-8);
    phone = `+55465${suffix}`;
    remoteJid = `${phone.slice(1)}@s.whatsapp.net`;
    instanceName = `document-e2e-${suffix}`;
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

  it("extrai PDF comprimido e persiste somente o insight seguro", async () => {
    const pdf = compressedTextPdf("ROTEIRO DE VIDEO COM CENA DE ABERTURA LOCUCAO E CHAMADA FINAL PARA O CLIENTE");
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
          key: { id: `document-${crypto.randomUUID()}`, remoteJid, fromMe: false },
          message: {
            documentMessage: {
              base64: pdf.toString("base64"),
              mimetype: "application/pdf",
              fileName: "nome-nao-confiavel.pdf",
            },
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, document: "processed" });

    const { data, error } = await serviceClient()
      .from("chat_messages")
      .select("author, text")
      .eq("org_id", org!.orgId)
      .order("created_at");
    if (error) throw error;
    const userMessage = data?.find((message) => message.author === "user")?.text ?? "";
    const oracleMessage = data?.find((message) => message.author === "oracle")?.text ?? "";

    expect(userMessage).toContain("roteiro de vídeo");
    expect(userMessage).toContain("conteúdo não confiável");
    expect(userMessage).not.toContain("nome-nao-confiavel.pdf");
    expect(userMessage).not.toContain("ROTEIRO DE VIDEO COM CENA");
    expect(oracleMessage).toContain("roteiro de vídeo");
    expect(oracleMessage).not.toMatch(/não consegui extrair/i);
  }, 60_000);
});
