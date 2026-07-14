import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
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
      weeklyPulseEnabled = false,
      weeklyPulseWeekday = 5,
      weeklyPulseHour = 16,
      expectedUpdatedAt = null,
    } = await req.json();

    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    await assertOwner(user.id, orgId);
    await assertCriticalActionAal2(req, orgId);

    const cleanInstanceUrl = cleanUrl(String(instanceUrl));
    const cleanInstanceName = String(instanceName).trim();
    const cleanConnectedNumber = String(connectedNumber).trim();
    const cleanApiKey = String(apiKey).trim();
    const cleanWebhookSecret = String(webhookSecret).trim();
    const cleanPulseWeekday = Math.max(1, Math.min(7, Number(weeklyPulseWeekday) || 5));
    const cleanPulseHour = Math.max(0, Math.min(23, Number(weeklyPulseHour) || 16));

    const client = serviceClient();
    const [{ data: existingSettings }, { data: existingPrivate }] = await Promise.all([
      client.from("whatsapp_settings").select("*").eq("org_id", orgId).maybeSingle(),
      client.from("whatsapp_instance_keys").select("*").eq("org_id", orgId).maybeSingle(),
    ]);
    const hasApiKey = Boolean(cleanApiKey || existingPrivate?.api_key);
    const hasWebhookSecret = Boolean(cleanWebhookSecret || existingPrivate?.webhook_secret);

    if (enabled && (!cleanInstanceUrl || !cleanInstanceName || !hasApiKey || !hasWebhookSecret)) {
      return jsonResponse({ error: "URL, instância, chave da Evolution API e segredo do webhook são obrigatórios para ativar o WhatsApp" }, 400);
    }

    const { data: savedSettings, error: settingsError } = await client.rpc("save_whatsapp_settings_if_current", {
      p_org_id: orgId,
      p_expected_updated_at: expectedUpdatedAt ? String(expectedUpdatedAt) : null,
      p_instance_url: cleanInstanceUrl,
      p_instance_name: cleanInstanceName,
      p_connected_number: cleanConnectedNumber,
      p_enabled: Boolean(enabled),
      p_weekly_pulse_enabled: Boolean(weeklyPulseEnabled),
      p_weekly_pulse_weekday: cleanPulseWeekday,
      p_weekly_pulse_hour: cleanPulseHour,
      p_api_key: cleanApiKey,
      p_webhook_secret: cleanWebhookSecret,
      p_key_preview: previewSecret(cleanApiKey) ?? null,
      p_webhook_secret_preview: previewSecret(cleanWebhookSecret) ?? null,
    });

    if (settingsError) throw settingsError;
    if (!(savedSettings as { ok?: boolean } | null)?.ok) {
      return jsonResponse({ error: "Este dado mudou em outra sessão. Recarregue a versão atual antes de salvar novamente.", code: "CONFLICT_STALE_WRITE" }, 409);
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    if ((error as { code?: string; message?: string })?.code === "40001" || (error as { message?: string })?.message?.includes("CONFLICT_STALE_WRITE")) {
      return jsonResponse({ error: "Este dado mudou em outra sessão. Recarregue a versão atual antes de salvar novamente.", code: "CONFLICT_STALE_WRITE" }, 409);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar WhatsApp" }, 400);
  }
});
