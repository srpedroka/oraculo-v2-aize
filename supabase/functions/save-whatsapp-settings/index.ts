import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function previewSecret(value: string) {
  return value ? `****${value.slice(-4)}` : undefined;
}

function cleanUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const url = new URL(trimmed);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL da Evolution API inválida");
  return url.toString().replace(/\/+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const {
      orgId,
      instanceUrl = "",
      instanceName = "",
      connectedNumber = "",
      apiKey = "",
      webhookSecret = "",
      enabled = false,
    } = await req.json();

    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    await assertOwner(user.id, orgId);

    const cleanInstanceUrl = cleanUrl(String(instanceUrl));
    const cleanInstanceName = String(instanceName).trim();
    const cleanConnectedNumber = String(connectedNumber).trim();
    const cleanApiKey = String(apiKey).trim();
    const cleanWebhookSecret = String(webhookSecret).trim();

    const client = serviceClient();
    const [{ data: existingSettings }, { data: existingPrivate }] = await Promise.all([
      client.from("whatsapp_settings").select("*").eq("org_id", orgId).maybeSingle(),
      client.schema("private").from("whatsapp_instance_keys").select("*").eq("org_id", orgId).maybeSingle(),
    ]);
    const hasApiKey = Boolean(cleanApiKey || existingPrivate?.api_key);
    const hasWebhookSecret = Boolean(cleanWebhookSecret || existingPrivate?.webhook_secret);

    if (enabled && (!cleanInstanceUrl || !cleanInstanceName || !hasApiKey || !hasWebhookSecret)) {
      return jsonResponse({ error: "URL, instância, chave da Evolution API e segredo do webhook são obrigatórios para ativar o WhatsApp" }, 400);
    }

    if (cleanApiKey || cleanWebhookSecret) {
      const privatePayload: Record<string, unknown> = {
        org_id: orgId,
        updated_at: new Date().toISOString(),
      };
      if (cleanApiKey) privatePayload.api_key = cleanApiKey;
      if (cleanWebhookSecret) privatePayload.webhook_secret = cleanWebhookSecret;

      const { error: privateError } = await client.schema("private").from("whatsapp_instance_keys").upsert(privatePayload);
      if (privateError) throw privateError;
    }

    const { error: settingsError } = await client.from("whatsapp_settings").upsert({
      org_id: orgId,
      instance_url: cleanInstanceUrl || null,
      instance_name: cleanInstanceName || null,
      connected_number: cleanConnectedNumber || null,
      enabled: Boolean(enabled),
      has_api_key: cleanApiKey ? true : existingSettings?.has_api_key ?? false,
      key_preview: cleanApiKey ? previewSecret(cleanApiKey) : existingSettings?.key_preview ?? null,
      has_webhook_secret: cleanWebhookSecret ? true : existingSettings?.has_webhook_secret ?? false,
      webhook_secret_preview: cleanWebhookSecret ? previewSecret(cleanWebhookSecret) : existingSettings?.webhook_secret_preview ?? null,
      updated_at: new Date().toISOString(),
    });

    if (settingsError) throw settingsError;
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar WhatsApp" }, 400);
  }
});
