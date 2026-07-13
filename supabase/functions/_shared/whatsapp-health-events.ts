type HealthClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

export async function recordWhatsAppHealthEvent(
  client: HealthClient,
  payload: {
    orgId: string;
    eventType: string;
    source: string;
    itemId?: string | null;
    correlationId?: string | null;
    errorCode?: string | null;
    httpStatus?: number | null;
  },
) {
  try {
    const { error } = await client.from("whatsapp_health_events").insert({
      org_id: payload.orgId,
      event_type: payload.eventType,
      source: payload.source,
      item_id: payload.itemId ?? null,
      correlation_id: payload.correlationId ?? null,
      error_code: payload.errorCode?.slice(0, 80) || null,
      http_status: payload.httpStatus ?? null,
    });
    if (error) console.warn("Falha ao registrar telemetria do WhatsApp");
  } catch {
    console.warn("Falha ao registrar telemetria do WhatsApp");
  }
}
