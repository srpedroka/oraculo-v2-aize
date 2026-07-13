import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  assertCriticalActionAal2,
  assertOwner,
  env,
  getUser,
  isMfaRequiredError,
  serviceClient,
} from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  parseEvolutionConnectionState,
  parseEvolutionWebhookState,
  safeEvolutionBaseUrl,
  safeEvolutionError,
  shouldAlertSilentWebhook,
  type EvolutionConnectionState,
  type EvolutionWebhookState,
} from "../_shared/whatsapp-health.ts";
import { recordWhatsAppHealthEvent } from "../_shared/whatsapp-health-events.ts";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";
import { sanitizeWhatsAppSenderError } from "../_shared/whatsapp-sender.ts";

type ServiceClient = ReturnType<typeof serviceClient>;
type AlertTone = "info" | "warning" | "critical";

interface HealthAlert {
  code: string;
  tone: AlertTone;
  title: string;
  detail: string;
}

interface DeadItem {
  id: string;
  type: "inbound" | "outbound";
  label: string;
  errorCode: string | null;
  attemptCount: number;
  occurredAt: string;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function expectedWebhookUrl(orgId: string) {
  return `${env("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/whatsapp-webhook?orgId=${orgId}`;
}

async function evolutionGet(baseUrl: URL, path: string, apiKey: string) {
  const target = new URL(`${baseUrl.pathname.replace(/\/+$/, "")}${path}`, baseUrl.origin);
  const response = await fetch(target, {
    method: "GET",
    headers: { apikey: apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Evolution HTTP ${response.status}`);
  return await response.json().catch(() => ({}));
}

async function inspectEvolution(settings: any, keyRow: any, webhookUrl: string) {
  const baseUrl = safeEvolutionBaseUrl(settings?.instance_url);
  const instanceName = String(settings?.instance_name ?? "").trim();
  const apiKey = String(keyRow?.api_key ?? "").trim();
  const emptyWebhook: EvolutionWebhookState = { configured: false, enabled: null, urlMatches: false, messagesEnabled: null };
  if (!baseUrl || !instanceName || !apiKey) {
    return {
      connection: "unknown" as EvolutionConnectionState,
      connectionErrorCode: baseUrl ? null : "unsafe_or_missing_url",
      webhook: emptyWebhook,
      webhookErrorCode: null,
      providerVariant: "unknown" as const,
    };
  }

  const encodedName = encodeURIComponent(instanceName);
  const [connectionResult, goConnectionResult, webhookResult] = await Promise.allSettled([
    evolutionGet(baseUrl, `/instance/connectionState/${encodedName}`, apiKey),
    evolutionGet(baseUrl, "/instance/status", apiKey),
    evolutionGet(baseUrl, `/webhook/find/${encodedName}`, apiKey),
  ]);

  const usesEvolutionGo = connectionResult.status === "rejected" && goConnectionResult.status === "fulfilled";
  const connectionPayload = connectionResult.status === "fulfilled"
    ? connectionResult.value
    : goConnectionResult.status === "fulfilled"
      ? goConnectionResult.value
      : null;
  const webhookFailure = webhookResult.status === "rejected" ? safeEvolutionError(webhookResult.reason) : null;

  return {
    connection: connectionPayload
      ? parseEvolutionConnectionState(connectionPayload)
      : "unknown" as EvolutionConnectionState,
    connectionErrorCode: connectionPayload
      ? null
      : safeEvolutionError(connectionResult.status === "rejected" ? connectionResult.reason : goConnectionResult.status === "rejected" ? goConnectionResult.reason : null),
    webhook: webhookResult.status === "fulfilled"
      ? parseEvolutionWebhookState(webhookResult.value, webhookUrl)
      : emptyWebhook,
    webhookErrorCode: usesEvolutionGo && webhookFailure === "http_404" ? "unsupported" : webhookFailure,
    providerVariant: usesEvolutionGo ? "evolution_go" as const : connectionResult.status === "fulfilled" ? "evolution_api" as const : "unknown" as const,
  };
}

function ageMinutes(value: string | null) {
  return value ? Math.max(0, (Date.now() - new Date(value).getTime()) / 60_000) : null;
}

function healthAlerts(input: {
  configured: boolean;
  enabled: boolean;
  connection: EvolutionConnectionState;
  connectionErrorCode: string | null;
  webhook: EvolutionWebhookState;
  webhookErrorCode: string | null;
  lastEventAt: string | null;
  pendingCount: number;
  oldestPendingAt: string | null;
  deadCount: number;
  attemptsLastHour: number;
  failuresLastHour: number;
}) {
  const alerts: HealthAlert[] = [];
  if (!input.configured) {
    alerts.push({ code: "configuration_incomplete", tone: "critical", title: "Configuração incompleta", detail: "Preencha URL, instância, chave e segredo antes de usar o WhatsApp." });
    return alerts;
  }
  if (!input.enabled) {
    alerts.push({ code: "webhook_disabled", tone: "info", title: "WhatsApp pausado", detail: "A configuração está salva, mas o webhook da empresa está desativado." });
  }
  if (input.connection === "disconnected") {
    alerts.push({ code: "instance_disconnected", tone: "critical", title: "Instância desconectada", detail: "Reconecte a instância na Evolution antes de continuar." });
  } else if (input.connection === "unknown" && input.connectionErrorCode) {
    alerts.push({ code: "connection_unknown", tone: "warning", title: "Conexão não confirmada", detail: "A Evolution não respondeu à consulta de estado." });
  }
  if (input.webhookErrorCode === "unsupported") {
    alerts.push({ code: "webhook_traffic_pending", tone: "warning", title: "Webhook aguardando confirmação", detail: "O Evo Go confirma o webhook pelo tráfego. Envie uma mensagem real para validar a entrada." });
  } else if (input.webhookErrorCode) {
    alerts.push({ code: "webhook_unknown", tone: "warning", title: "Webhook não confirmado", detail: "Não foi possível consultar a configuração atual na Evolution." });
  } else if (!input.webhook.configured) {
    alerts.push({ code: "webhook_mismatch", tone: "critical", title: "Webhook fora do padrão", detail: "Confira a URL e habilite o evento MESSAGES_UPSERT na Evolution." });
  }
  const lastEventMinutes = ageMinutes(input.lastEventAt);
  if (shouldAlertSilentWebhook({ enabled: input.enabled, connection: input.connection, lastEventAt: input.lastEventAt })) {
    alerts.push({
      code: "webhook_silent",
      tone: "warning",
      title: "Sem eventos recentes",
      detail: lastEventMinutes === null
        ? "Nenhum evento foi registrado pelo webhook. Envie uma mensagem real para confirmar a entrada."
        : "Nenhum evento chegou pelo webhook nas últimas 72 horas.",
    });
  }
  const oldestPendingMinutes = ageMinutes(input.oldestPendingAt);
  if (input.pendingCount >= 10 || (oldestPendingMinutes !== null && oldestPendingMinutes > 5)) {
    alerts.push({ code: "queue_backlog", tone: "warning", title: "Fila acumulando", detail: `${input.pendingCount} item(ns) aguardando processamento ou envio.` });
  }
  if (input.deadCount > 0) {
    alerts.push({ code: "dead_items", tone: "critical", title: "Falhas que exigem atenção", detail: `${input.deadCount} item(ns) chegaram ao limite de tentativas.` });
  }
  if (input.attemptsLastHour >= 5 && input.failuresLastHour / input.attemptsLastHour >= 0.2) {
    alerts.push({ code: "high_error_rate", tone: "warning", title: "Taxa de erro elevada", detail: `${input.failuresLastHour} de ${input.attemptsLastHour} tentativas falharam na última hora.` });
  }
  return alerts;
}

async function countStatuses(client: ServiceClient, table: string, orgId: string, statuses: string[]) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", statuses);
  if (error) throw error;
  return count ?? 0;
}

async function oldestPending(client: ServiceClient, table: string, orgId: string, statuses: string[]) {
  const { data, error } = await client.from(table).select("created_at").eq("org_id", orgId).in("status", statuses).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

async function loadDeadItems(client: ServiceClient, orgId: string): Promise<DeadItem[]> {
  const [inbound, outbound] = await Promise.all([
    client.from("whatsapp_inbound_jobs").select("id, kind, attempt_count, last_error_code, updated_at").eq("org_id", orgId).eq("status", "dead").order("updated_at", { ascending: false }).limit(10),
    client.from("whatsapp_outbox").select("id, attempt_count, last_error_code, updated_at").eq("org_id", orgId).eq("status", "dead").order("updated_at", { ascending: false }).limit(10),
  ]);
  if (inbound.error) throw inbound.error;
  if (outbound.error) throw outbound.error;
  return [
    ...(inbound.data ?? []).map((item: any) => ({ id: item.id, type: "inbound" as const, label: item.kind === "audio" ? "Áudio recebido" : item.kind === "document" ? "Documento recebido" : "Mensagem recebida", errorCode: item.last_error_code ?? null, attemptCount: Number(item.attempt_count ?? 0), occurredAt: item.updated_at })),
    ...(outbound.data ?? []).map((item: any) => ({ id: item.id, type: "outbound" as const, label: "Resposta para envio", errorCode: item.last_error_code ?? null, attemptCount: Number(item.attempt_count ?? 0), occurredAt: item.updated_at })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 10);
}

async function loadStatus(client: ServiceClient, orgId: string) {
  const webhookUrl = expectedWebhookUrl(orgId);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [settingsResult, keyResult, workerSecretResult, senderSecretResult, eventsResult, pendingInbound, pendingOutbound, oldestInbound, oldestOutbound, deadItems] = await Promise.all([
    client.from("whatsapp_settings").select("*").eq("org_id", orgId).maybeSingle(),
    client.from("whatsapp_instance_keys").select("api_key, webhook_secret").eq("org_id", orgId).maybeSingle(),
    client.from("whatsapp_worker_secrets").select("endpoint_url").eq("id", "worker").single(),
    client.from("whatsapp_sender_secrets").select("endpoint_url").eq("id", "sender").single(),
    client.from("whatsapp_health_events").select("event_type, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
    countStatuses(client, "whatsapp_inbound_jobs", orgId, ["queued", "processing", "retry"]),
    countStatuses(client, "whatsapp_outbox", orgId, ["queued", "sending", "retry"]),
    oldestPending(client, "whatsapp_inbound_jobs", orgId, ["queued", "processing", "retry"]),
    oldestPending(client, "whatsapp_outbox", orgId, ["queued", "sending", "retry"]),
    loadDeadItems(client, orgId),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (keyResult.error) throw keyResult.error;
  if (workerSecretResult.error) throw workerSecretResult.error;
  if (senderSecretResult.error) throw senderSecretResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const settings = settingsResult.data;
  const keyRow = keyResult.data;
  const configured = Boolean(settings?.instance_url && settings?.instance_name && keyRow?.api_key && keyRow?.webhook_secret);
  const evolution = await inspectEvolution(settings, keyRow, webhookUrl);
  const events = eventsResult.data ?? [];
  const lastEventAt = events.find((event: any) => event.event_type === "webhook_received")?.created_at ?? null;
  const lastSentAt = events.find((event: any) => ["outbound_sent", "test_sent"].includes(event.event_type))?.created_at ?? null;
  const lastEventMinutes = ageMinutes(lastEventAt);
  const recentWebhookTraffic = lastEventMinutes !== null && lastEventMinutes <= 72 * 60;
  const webhookConfirmedByTraffic = evolution.providerVariant === "evolution_go"
    && evolution.webhookErrorCode === "unsupported"
    && Boolean(recentWebhookTraffic);
  const webhook = webhookConfirmedByTraffic
    ? { configured: true, enabled: null, urlMatches: true, messagesEnabled: true }
    : evolution.webhook;
  const webhookErrorCode = webhookConfirmedByTraffic ? null : evolution.webhookErrorCode;
  const recentAttempts = events.filter((event: any) => event.created_at >= since && ["outbound_sent", "outbound_retry", "outbound_failed", "test_sent", "test_failed"].includes(event.event_type));
  const failuresLastHour = recentAttempts.filter((event: any) => ["outbound_retry", "outbound_failed", "test_failed"].includes(event.event_type)).length;
  const pendingCount = pendingInbound + pendingOutbound;
  const oldestPendingAt = [oldestInbound, oldestOutbound].filter(Boolean).sort()[0] ?? null;

  const alerts = healthAlerts({
    configured,
    enabled: Boolean(settings?.enabled),
    connection: evolution.connection,
    connectionErrorCode: evolution.connectionErrorCode,
    webhook,
    webhookErrorCode,
    lastEventAt,
    pendingCount,
    oldestPendingAt,
    deadCount: deadItems.length,
    attemptsLastHour: recentAttempts.length,
    failuresLastHour,
  });

  await client.rpc("cleanup_whatsapp_health_events");
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    configured,
    enabled: Boolean(settings?.enabled),
    connection: evolution.connection,
    connectionErrorCode: evolution.connectionErrorCode,
    webhook,
    webhookErrorCode,
    webhookSource: webhookConfirmedByTraffic ? "traffic" : evolution.providerVariant === "evolution_api" ? "provider" : "unavailable",
    expectedWebhookUrl: webhookUrl,
    lastEventAt,
    lastSentAt,
    queue: {
      inboundEnabled: Boolean(settings?.inbound_queue_enabled),
      outboxEnabled: Boolean(settings?.outbound_outbox_enabled),
      workerReady: Boolean(workerSecretResult.data?.endpoint_url),
      senderReady: Boolean(senderSecretResult.data?.endpoint_url),
      pendingInbound,
      pendingOutbound,
      oldestPendingAt,
    },
    failuresLastHour,
    attemptsLastHour: recentAttempts.length,
    deadItems,
    alerts,
  };
}

async function sendTest(req: Request, client: ServiceClient, userId: string, orgId: string) {
  await assertCriticalActionAal2(req, orgId);
  const [settingsResult, keyResult, profileResult] = await Promise.all([
    client.from("whatsapp_settings").select("instance_url, instance_name, enabled").eq("org_id", orgId).maybeSingle(),
    client.from("whatsapp_instance_keys").select("api_key").eq("org_id", orgId).maybeSingle(),
    client.from("profiles").select("phone").eq("id", userId).maybeSingle(),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (keyResult.error) throw keyResult.error;
  if (profileResult.error) throw profileResult.error;
  if (!settingsResult.data?.enabled) throw new Error("Ative o WhatsApp da empresa antes de testar");
  const phone = String(profileResult.data?.phone ?? "").trim();
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) throw new Error("Cadastre um celular internacional válido no seu perfil antes de testar");

  try {
    const receipt = await sendWhatsAppText(
      settingsResult.data,
      keyResult.data,
      phone,
      "Teste do Oráculo concluído. O WhatsApp desta empresa está enviando mensagens normalmente.",
    );
    await recordWhatsAppHealthEvent(client, { orgId, eventType: "test_sent", source: "health_test", httpStatus: receipt.httpStatus });
    return jsonResponse({ ok: true, sentAt: new Date().toISOString(), httpStatus: receipt.httpStatus, providerStatus: receipt.providerStatus });
  } catch (error) {
    const sanitized = sanitizeWhatsAppSenderError(error);
    await recordWhatsAppHealthEvent(client, { orgId, eventType: "test_failed", source: "health_test", errorCode: safeEvolutionError(error) });
    throw new Error(sanitized);
  }
}

async function retryDead(req: Request, client: ServiceClient, orgId: string, body: any) {
  await assertCriticalActionAal2(req, orgId);
  if (!validUuid(body?.itemId) || !["inbound", "outbound"].includes(body?.itemType)) throw new Error("Item de falha inválido");
  const { data: settings, error: settingsError } = await client.from("whatsapp_settings").select("inbound_queue_enabled, outbound_outbox_enabled").eq("org_id", orgId).single();
  if (settingsError) throw settingsError;
  const secretTable = body.itemType === "inbound" ? "whatsapp_worker_secrets" : "whatsapp_sender_secrets";
  const secretId = body.itemType === "inbound" ? "worker" : "sender";
  const flagEnabled = body.itemType === "inbound" ? settings.inbound_queue_enabled : settings.outbound_outbox_enabled;
  const { data: endpoint, error: endpointError } = await client.from(secretTable).select("endpoint_url").eq("id", secretId).single();
  if (endpointError) throw endpointError;
  if (!flagEnabled || !endpoint?.endpoint_url) throw new Error("O processamento durável ainda está desligado; ative-o em uma janela controlada antes de reprocessar");

  const { data, error } = await client.rpc("requeue_whatsapp_dead_item", {
    p_org_id: orgId,
    p_item_type: body.itemType,
    p_item_id: body.itemId,
  });
  if (error) throw error;
  if (!data) throw new Error("O item não está mais disponível para reprocessamento");
  return jsonResponse({ ok: true, requeued: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const orgId = body?.orgId;
    if (!validUuid(orgId)) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const action = String(body?.action ?? "status");
    if (action === "status") return jsonResponse(await loadStatus(client, orgId));
    if (action === "send_test") return await sendTest(req, client, user.id, orgId);
    if (action === "retry") return await retryDead(req, client, orgId, body);
    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao consultar a saúde do WhatsApp" }, 400);
  }
});
