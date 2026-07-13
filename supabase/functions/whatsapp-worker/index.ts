import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  classifyWhatsAppWorkerFailure,
  rebuildWhatsAppEvent,
  sanitizeWhatsAppWorkerError,
  type QueuedWhatsAppJob,
} from "../_shared/whatsapp-worker.ts";
import { handleWhatsAppWebhook } from "../_shared/whatsapp-processor.ts";
import { logStructured, requestId, safeErrorCode } from "../_shared/structured-log.ts";

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function authorizeWorker(req: Request, client: ReturnType<typeof serviceClient>) {
  const received = req.headers.get("x-oraculo-worker-secret") ?? "";
  const { data, error } = await client
    .from("whatsapp_worker_secrets")
    .select("worker_secret")
    .eq("id", "worker")
    .single();
  if (error) throw error;
  return Boolean(received && data?.worker_secret && timingSafeEqual(received, data.worker_secret));
}

class WorkerProcessingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return String(parsed?.error ?? parsed?.message ?? `HTTP ${response.status}`);
  } catch {
    return text.slice(0, 500) || `HTTP ${response.status}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  const client = serviceClient();
  const requestLogId = requestId(req);
  const startedAt = performance.now();
  let requestedOrgId: string | null = null;
  try {
    if (!(await authorizeWorker(req, client))) return jsonResponse({ error: "Worker não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.orgId !== undefined && (typeof body.orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.orgId))) {
      return jsonResponse({ error: "Empresa inválida" }, 400);
    }
    const orgId = typeof body?.orgId === "string" ? body.orgId : null;
    requestedOrgId = orgId;
    const batchSize = Math.max(1, Math.min(10, Number(body?.batchSize) || 5));
    const workerId = `worker-${crypto.randomUUID()}`;
    const summary = { claimed: 0, completed: 0, retry: 0, dead: 0 };

    for (let index = 0; index < batchSize; index += 1) {
      const { data: claimedRows, error: claimError } = await client.rpc("claim_whatsapp_inbound_job", {
        p_worker_id: workerId,
        p_org_id: orgId,
        p_lock_timeout_seconds: 120,
      });
      if (claimError) throw claimError;
      const job = claimedRows?.[0] as QueuedWhatsAppJob | undefined;
      if (!job) break;
      summary.claimed += 1;

      const heartbeat = setInterval(() => {
        void client.rpc("heartbeat_whatsapp_inbound_job", { p_job_id: job.id, p_worker_id: workerId });
      }, 20_000);

      try {
        const [{ data: settings, error: settingsError }, { data: keyRow, error: keyError }] = await Promise.all([
          client
            .from("whatsapp_settings")
            .select("instance_name, enabled, inbound_queue_enabled, outbound_outbox_enabled")
            .eq("org_id", job.org_id)
            .single(),
          client.from("whatsapp_instance_keys").select("webhook_secret").eq("org_id", job.org_id).single(),
        ]);
        if (settingsError) throw new WorkerProcessingError(404, settingsError.message);
        if (keyError) throw new WorkerProcessingError(404, keyError.message);
        if (!settings?.enabled || !settings.instance_name || !keyRow?.webhook_secret) {
          throw new WorkerProcessingError(404, "WhatsApp não configurado para esta empresa");
        }
        if (settings.outbound_outbox_enabled !== true || (job.kind === "text" && settings.inbound_queue_enabled !== true)) {
          throw new WorkerProcessingError(503, "Processamento durável do WhatsApp indisponível");
        }

        const event = rebuildWhatsAppEvent(job, settings.instance_name);
        const internalRequest = new Request(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook?orgId=${job.org_id}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-oraculo-webhook-secret": keyRow.webhook_secret,
            },
            body: JSON.stringify(event),
          },
        );
        const response = await handleWhatsAppWebhook(internalRequest, { forceSynchronous: true });
        if (!response.ok) throw new WorkerProcessingError(response.status, await responseError(response));

        const { data: completed, error: completeError } = await client.rpc("complete_whatsapp_inbound_job", {
          p_job_id: job.id,
          p_worker_id: workerId,
        });
        if (completeError) throw completeError;
        if (!completed) throw new Error("Worker perdeu o lock antes de concluir o job");
        summary.completed += 1;
      } catch (error) {
        const status = error instanceof WorkerProcessingError ? error.status : 0;
        const sanitized = sanitizeWhatsAppWorkerError(error);
        const classification = classifyWhatsAppWorkerFailure(status, sanitized);
        const { data: nextStatus, error: failError } = await client.rpc("fail_whatsapp_inbound_job", {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_transient: classification.transient,
          p_error_code: classification.code,
          p_error_message: sanitized,
        });
        if (failError) throw failError;
        if (nextStatus === "retry") summary.retry += 1;
        else summary.dead += 1;
      } finally {
        clearInterval(heartbeat);
      }
    }

    await client.rpc("cleanup_whatsapp_inbound_jobs");
    logStructured("info", {
      requestId: requestLogId,
      functionName: "whatsapp-worker",
      orgId: requestedOrgId,
      operation: "process_inbound_batch",
      durationMs: Math.round(performance.now() - startedAt),
      status: "ok",
    });
    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    logStructured("error", {
      requestId: requestLogId,
      functionName: "whatsapp-worker",
      orgId: requestedOrgId,
      operation: "process_inbound_batch",
      durationMs: Math.round(performance.now() - startedAt),
      status: "error",
      errorCode: safeErrorCode(error),
    });
    return jsonResponse({ error: sanitizeWhatsAppWorkerError(error) }, 500);
  }
});
