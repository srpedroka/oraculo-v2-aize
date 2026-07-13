import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendWhatsAppText, WhatsAppSendError } from "../_shared/whatsapp.ts";
import {
  classifyWhatsAppSenderFailure,
  sanitizeWhatsAppSenderError,
  type QueuedWhatsAppOutboxItem,
} from "../_shared/whatsapp-sender.ts";
import { logStructured, requestId, safeErrorCode } from "../_shared/structured-log.ts";

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function authorizeSender(req: Request, client: ReturnType<typeof serviceClient>) {
  const received = req.headers.get("x-oraculo-sender-secret") ?? "";
  const { data, error } = await client
    .from("whatsapp_sender_secrets")
    .select("sender_secret")
    .eq("id", "sender")
    .single();
  if (error) throw error;
  return Boolean(received && data?.sender_secret && timingSafeEqual(received, data.sender_secret));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  const client = serviceClient();
  const requestLogId = requestId(req);
  const startedAt = performance.now();
  let requestedOrgId: string | null = null;
  try {
    if (!(await authorizeSender(req, client))) return jsonResponse({ error: "Sender não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.orgId !== undefined && (typeof body.orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orgId))) {
      return jsonResponse({ error: "Empresa inválida" }, 400);
    }
    const orgId = typeof body?.orgId === "string" ? body.orgId : null;
    requestedOrgId = orgId;
    const batchSize = Math.max(1, Math.min(10, Number(body?.batchSize) || 5));
    const senderId = `sender-${crypto.randomUUID()}`;
    const summary = { claimed: 0, sent: 0, retry: 0, dead: 0 };

    for (let index = 0; index < batchSize; index += 1) {
      const { data: claimedRows, error: claimError } = await client.rpc("claim_whatsapp_outbox_item", {
        p_worker_id: senderId,
        p_org_id: orgId,
        p_lock_timeout_seconds: 120,
      });
      if (claimError) throw claimError;
      const item = claimedRows?.[0] as QueuedWhatsAppOutboxItem | undefined;
      if (!item) break;
      summary.claimed += 1;

      const heartbeat = setInterval(() => {
        void client.rpc("heartbeat_whatsapp_outbox_item", { p_item_id: item.id, p_worker_id: senderId });
      }, 20_000);

      try {
        const [{ data: settings, error: settingsError }, { data: keyRow, error: keyError }] = await Promise.all([
          client
            .from("whatsapp_settings")
            .select("instance_url, instance_name, enabled")
            .eq("org_id", item.org_id)
            .single(),
          client.from("whatsapp_instance_keys").select("api_key").eq("org_id", item.org_id).single(),
        ]);
        if (settingsError || keyError || !settings?.enabled || !settings.instance_url || !keyRow?.api_key) {
          throw new WhatsAppSendError("WhatsApp não configurado para esta empresa", 404);
        }

        const receipt = await sendWhatsAppText(settings, keyRow, item.destination, item.content);
        const { data: completed, error: completeError } = await client.rpc("complete_whatsapp_outbox_item", {
          p_item_id: item.id,
          p_worker_id: senderId,
          p_http_status: receipt.httpStatus,
          p_provider_message_id: receipt.providerMessageId,
          p_provider_status: receipt.providerStatus,
        });
        if (completeError) throw completeError;
        if (!completed) throw new Error("Sender perdeu o lock antes de confirmar o envio");
        summary.sent += 1;
      } catch (error) {
        const classification = classifyWhatsAppSenderFailure(error);
        const sanitized = sanitizeWhatsAppSenderError(error);
        const { data: nextStatus, error: failError } = await client.rpc("fail_whatsapp_outbox_item", {
          p_item_id: item.id,
          p_worker_id: senderId,
          p_transient: classification.transient,
          p_error_code: classification.code,
          p_error_message: sanitized,
          p_http_status: classification.httpStatus,
          p_retry_after_seconds: classification.retryAfterSeconds,
        });
        if (failError) throw failError;
        if (nextStatus === "retry") summary.retry += 1;
        else summary.dead += 1;
      } finally {
        clearInterval(heartbeat);
      }
    }

    await client.rpc("cleanup_whatsapp_outbox");
    logStructured("info", {
      requestId: requestLogId,
      functionName: "whatsapp-sender",
      orgId: requestedOrgId,
      operation: "send_outbox_batch",
      durationMs: Math.round(performance.now() - startedAt),
      status: "ok",
    });
    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    logStructured("error", {
      requestId: requestLogId,
      functionName: "whatsapp-sender",
      orgId: requestedOrgId,
      operation: "send_outbox_batch",
      durationMs: Math.round(performance.now() - startedAt),
      status: "error",
      errorCode: safeErrorCode(error),
    });
    return jsonResponse({ error: sanitizeWhatsAppSenderError(error) }, 500);
  }
});
