type ServiceClientLike = {
  from: (table: string) => any;
};

export function scheduleWhatsAppSenderWake(client: ServiceClientLike, orgId: string, correlationId?: string | null) {
  const task = (async () => {
    const { data, error } = await client
      .from("whatsapp_sender_secrets")
      .select("sender_secret, endpoint_url")
      .eq("id", "sender")
      .maybeSingle();
    if (error || !data?.sender_secret || !data.endpoint_url) return;

    const expectedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-sender`;
    if (data.endpoint_url !== expectedUrl) return;
    await fetch(data.endpoint_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oraculo-sender-secret": data.sender_secret,
      },
      body: JSON.stringify({ source: "outbox", orgId, correlationId, batchSize: 5 }),
    });
  })().catch(() => undefined);

  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}
